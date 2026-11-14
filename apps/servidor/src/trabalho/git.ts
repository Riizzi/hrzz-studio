// Pontos de retorno escondidos e versoes salvas, em cima do git do sistema (docs/01-arquitetura.md).
// Nada aqui mexe na branch, no indice ou no HEAD do joao: tudo usa um indice temporario e referencias proprias.
//   refs/hrzz/desfazer/<n>   ponto de retorno antes de cada mudanca (alimenta "desfazer ultima mudanca")
//   refs/heads/hrzz/versoes  versoes salvas pelo botao "salvar versao" (v1, v2...)
// Se a pasta nao for um repositorio git, o HRZZ usa um repositorio "sombra" em dados/versoes/<chave>.git
// (a pasta do projeto nao ganha nenhum .git).
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';

export type Alvo = { chave: string; pasta: string };
export type Ponto = { ref: string; seq: number; commit: string; data: string; motivo: string };
export type Versao = { n: number; commit: string; nome: string; data: string };

const LIMITE_PONTOS = 30;
const REF_PONTOS = 'refs/hrzz/desfazer';
const REF_VERSOES = 'refs/heads/hrzz/versoes';

const EXCLUIR_PADRAO = ['node_modules/', 'dist/', 'build/', '.astro/', '.next/', '.nuxt/', '.svelte-kit/', '.cache/', '.turbo/', '.venv/', '__pycache__/', '*.log'];

type Resultado = { codigo: number; saida: string; erro: string };

function rodar(args: string[], opcoes: { cwd?: string; env?: Record<string, string>; entrada?: string } = {}): Promise<Resultado> {
  return new Promise((res) => {
    const filho = spawn('git', args, {
      cwd: opcoes.cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...opcoes.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const so: Buffer[] = [];
    const se: Buffer[] = [];
    filho.stdout.on('data', (d: Buffer) => so.push(d));
    filho.stderr.on('data', (d: Buffer) => se.push(d));
    filho.on('error', (e) => res({ codigo: -1, saida: '', erro: e.message }));
    filho.on('close', (codigo) => res({ codigo: codigo ?? -1, saida: Buffer.concat(so).toString('utf8'), erro: Buffer.concat(se).toString('utf8') }));
    filho.stdin.on('error', () => undefined);
    if (opcoes.entrada !== undefined) filho.stdin.end(opcoes.entrada);
    else filho.stdin.end();
  });
}

export class Versionador {
  private filas = new Map<string, Promise<unknown>>();

  constructor(private pastaSombra: string) {}

  // uma operacao por vez em cada projeto (duas ao mesmo tempo brigariam pela mesma referencia)
  private enfileirar<T>(chave: string, f: () => Promise<T>): Promise<T> {
    const anterior = this.filas.get(chave) ?? Promise.resolve();
    const atual = anterior.then(f, f);
    this.filas.set(chave, atual.catch(() => undefined));
    return atual;
  }

  private async gitDir(a: Alvo): Promise<string> {
    const proprio = join(a.pasta, '.git');
    try {
      if (statSync(proprio).isDirectory()) return proprio;
    } catch {
      /* sem .git: usa a sombra */
    }
    const sombra = join(this.pastaSombra, `${a.chave}.git`);
    if (!existsSync(join(sombra, 'HEAD'))) {
      mkdirSync(sombra, { recursive: true });
      const r = await rodar(['init', '--quiet', '--bare', sombra]);
      if (r.codigo !== 0) throw new Error('não consegui criar o repositório de versões: ' + r.erro.trim());
      mkdirSync(join(sombra, 'info'), { recursive: true });
      writeFileSync(join(sombra, 'info', 'exclude'), EXCLUIR_PADRAO.join('\n') + '\n');
    }
    return sombra;
  }

  private async git(a: Alvo, args: string[], opcoes: { indice?: string; entrada?: string; arvoreTrabalho?: string } = {}): Promise<string> {
    const dir = await this.gitDir(a);
    const env: Record<string, string> = {
      GIT_AUTHOR_NAME: 'HRZZ',
      GIT_AUTHOR_EMAIL: 'hrzz@localhost',
      GIT_COMMITTER_NAME: 'HRZZ',
      GIT_COMMITTER_EMAIL: 'hrzz@localhost',
    };
    if (opcoes.indice) env.GIT_INDEX_FILE = opcoes.indice;
    const trabalho = opcoes.arvoreTrabalho ?? a.pasta;
    const base = ['--git-dir', dir, '--work-tree', trabalho, '-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', '-c', 'core.quotepath=off', '-c', 'core.fsmonitor=false'];
    const r = await rodar([...base, ...args], { cwd: trabalho, env, entrada: opcoes.entrada });
    if (r.codigo !== 0) throw new Error(`git ${args[0]}: ${r.erro.trim() || r.saida.trim() || 'falhou'}`);
    return r.saida;
  }

  private novoIndice(a: Alvo): string {
    return join(this.pastaSombra, `.indice-${a.chave}-${randomBytes(4).toString('hex')}`);
  }

  // hash da arvore (os arquivos da pasta, respeitando .gitignore) sem tocar no indice do joao
  private async arvoreAtual(a: Alvo): Promise<string> {
    mkdirSync(this.pastaSombra, { recursive: true });
    const indice = this.novoIndice(a);
    try {
      await this.git(a, ['add', '-A', '--', '.'], { indice });
      return (await this.git(a, ['write-tree'], { indice })).trim();
    } finally {
      rmSync(indice, { force: true });
    }
  }

  private async arvoreDe(a: Alvo, ref: string): Promise<string | null> {
    try {
      return (await this.git(a, ['rev-parse', '--verify', '--quiet', `${ref}^{tree}`])).trim() || null;
    } catch {
      return null;
    }
  }

  // ---------- pontos de retorno ----------
  private async listarPontosSemFila(a: Alvo): Promise<Ponto[]> {
    let saida = '';
    try {
      saida = await this.git(a, ['for-each-ref', '--format=%(refname)%09%(objectname)%09%(creatordate:iso-strict)%09%(subject)', REF_PONTOS]);
    } catch {
      return [];
    }
    const lista: Ponto[] = [];
    for (const linha of saida.split('\n')) {
      if (!linha.trim()) continue;
      const [ref, commit, data, ...resto] = linha.split('\t');
      const seq = Number(ref.slice(ref.lastIndexOf('/') + 1));
      if (Number.isFinite(seq)) lista.push({ ref, seq, commit, data, motivo: resto.join('\t') });
    }
    return lista.sort((x, y) => y.seq - x.seq); // mais novo primeiro
  }

  listarPontos(a: Alvo): Promise<Ponto[]> {
    return this.enfileirar(a.chave, () => this.listarPontosSemFila(a));
  }

  private async gravarPonto(a: Alvo, arvore: string, motivo: string, pontos: Ponto[]): Promise<Ponto> {
    const seq = (pontos[0]?.seq ?? 0) + 1;
    const ref = `${REF_PONTOS}/${String(seq).padStart(6, '0')}`;
    const commit = (await this.git(a, ['commit-tree', arvore, '-m', motivo])).trim();
    await this.git(a, ['update-ref', ref, commit]);
    // guarda so os ultimos pontos
    for (const velho of pontos.slice(LIMITE_PONTOS - 1)) await this.git(a, ['update-ref', '-d', velho.ref]).catch(() => undefined);
    return { ref, seq, commit, data: new Date().toISOString(), motivo };
  }

  // guarda o estado atual da pasta. Devolve null se nada mudou desde o ponto anterior.
  criarPonto(a: Alvo, motivo: string): Promise<Ponto | null> {
    return this.enfileirar(a.chave, async () => {
      const arvore = await this.arvoreAtual(a);
      const pontos = await this.listarPontosSemFila(a);
      if (pontos[0] && (await this.arvoreDe(a, pontos[0].commit)) === arvore) return null;
      return this.gravarPonto(a, arvore, motivo, pontos);
    });
  }

  // a pasta mudou desde o ponto de retorno mais recente?
  mudouDesdeUltimoPonto(a: Alvo): Promise<boolean> {
    return this.enfileirar(a.chave, async () => {
      const pontos = await this.listarPontosSemFila(a);
      if (!pontos[0]) return false;
      return (await this.arvoreAtual(a)) !== (await this.arvoreDe(a, pontos[0].commit));
    });
  }

  // volta a pasta ao estado do ponto mais recente que seja diferente do atual
  desfazer(a: Alvo): Promise<{ ok: boolean; mensagem: string; arquivos: number }> {
    return this.enfileirar(a.chave, async () => {
      const atual = await this.arvoreAtual(a);
      for (const p of await this.listarPontosSemFila(a)) {
        const arvore = await this.arvoreDe(a, p.commit);
        if (!arvore) continue;
        if (arvore === atual) {
          await this.git(a, ['update-ref', '-d', p.ref]).catch(() => undefined);
          continue;
        }
        // rede de seguranca: guarda o estado de agora, caso o desfazer tenha sido sem querer
        const seguranca = (await this.git(a, ['commit-tree', atual, '-m', 'antes de desfazer'])).trim();
        await this.git(a, ['update-ref', 'refs/hrzz/antes-de-desfazer', seguranca]);
        const n = await this.restaurarArvore(a, atual, arvore);
        await this.git(a, ['update-ref', '-d', p.ref]).catch(() => undefined);
        return { ok: true, mensagem: p.motivo ? `voltei ao estado de antes: ${p.motivo}` : 'voltei ao estado de antes da última mudança', arquivos: n };
      }
      return { ok: false, mensagem: 'nada pra desfazer', arquivos: 0 };
    });
  }

  // leva a pasta do estado "de" para o estado "para": apaga o que nao existe la e regrava o resto
  private async restaurarArvore(a: Alvo, de: string, para: string): Promise<number> {
    const dif = await this.git(a, ['diff-tree', '-r', '-z', '--name-status', '--no-renames', de, para]);
    const partes = dif.split('\0').filter((x) => x !== '');
    const gravar: string[] = [];
    const apagar: string[] = [];
    for (let i = 0; i + 1 < partes.length; i += 2) {
      // de -> para: 'D' = existe em "de" e nao em "para" (some); 'A' e 'M' = vem de "para"
      (partes[i] === 'D' ? apagar : gravar).push(partes[i + 1]);
    }
    const raiz = resolve(a.pasta);
    for (const rel of apagar) {
      const alvo = resolve(raiz, rel);
      if (alvo.startsWith(raiz + sep)) {
        try {
          unlinkSync(alvo);
        } catch {
          /* ja nao existe */
        }
      }
    }
    if (gravar.length) {
      mkdirSync(this.pastaSombra, { recursive: true });
      const indice = this.novoIndice(a);
      try {
        await this.git(a, ['read-tree', para], { indice });
        await this.git(a, ['checkout-index', '-f', '-z', '--stdin'], { indice, entrada: gravar.join('\0') + '\0' });
      } finally {
        rmSync(indice, { force: true });
      }
    }
    return apagar.length + gravar.length;
  }

  // ---------- versoes salvas ----------
  private async listarVersoesSemFila(a: Alvo): Promise<Versao[]> {
    let saida = '';
    try {
      saida = await this.git(a, ['log', REF_VERSOES, '--reverse', '--format=%H%x1f%s%x1f%cI']);
    } catch {
      return [];
    }
    return saida
      .split('\n')
      .filter((l) => l.trim())
      .map((l, i) => {
        const [commit, assunto, data] = l.split('\x1f');
        const nome = assunto.replace(/^v\d+:?\s*/, '').trim();
        return { n: i + 1, commit, nome, data };
      });
  }

  listarVersoes(a: Alvo): Promise<Versao[]> {
    return this.enfileirar(a.chave, () => this.listarVersoesSemFila(a));
  }

  salvarVersao(a: Alvo, nome: string): Promise<{ versao: Versao; igual: boolean }> {
    return this.enfileirar(a.chave, async () => {
      const arvore = await this.arvoreAtual(a);
      const versoes = await this.listarVersoesSemFila(a);
      const ultima = versoes[versoes.length - 1];
      if (ultima && (await this.arvoreDe(a, ultima.commit)) === arvore) return { versao: ultima, igual: true };
      const n = versoes.length + 1;
      const limpo = nome.replace(/\s+/g, ' ').trim().slice(0, 60);
      const args = ['commit-tree', arvore, '-m', limpo ? `v${n}: ${limpo}` : `v${n}`];
      if (ultima) args.push('-p', ultima.commit);
      const commit = (await this.git(a, args)).trim();
      await this.git(a, ['update-ref', REF_VERSOES, commit]);
      return { versao: { n, commit, nome: limpo, data: new Date().toISOString() }, igual: false };
    });
  }

  restaurarVersao(a: Alvo, n: number): Promise<{ ok: boolean; mensagem: string }> {
    return this.enfileirar(a.chave, async () => {
      const v = (await this.listarVersoesSemFila(a)).find((x) => x.n === n);
      if (!v) return { ok: false, mensagem: `a v${n} não existe` };
      const atual = await this.arvoreAtual(a);
      const alvo = await this.arvoreDe(a, v.commit);
      if (!alvo) return { ok: false, mensagem: 'versão ilegível' };
      if (alvo !== atual) {
        // ponto de retorno antes de voltar, pra dar pra desfazer
        await this.gravarPonto(a, atual, `antes de voltar pra v${n}`, await this.listarPontosSemFila(a));
        await this.restaurarArvore(a, atual, alvo);
      }
      return { ok: true, mensagem: `voltei pra v${n}` };
    });
  }

  // ---------- duelo: copias separadas da pasta ----------
  // Cada lado do duelo trabalha numa copia (os arquivos da pasta no momento da pergunta, fora o que o .gitignore
  // exclui). So a copia escolhida volta pro projeto. A copia sai do git do projeto, sem mexer em branch nem indice.
  instantaneo(a: Alvo): Promise<string> {
    return this.enfileirar(a.chave, () => this.arvoreAtual(a));
  }

  extrair(a: Alvo, arvore: string, destino: string): Promise<void> {
    return this.enfileirar(a.chave, async () => {
      rmSync(destino, { recursive: true, force: true });
      mkdirSync(destino, { recursive: true });
      mkdirSync(this.pastaSombra, { recursive: true });
      const indice = this.novoIndice(a);
      try {
        await this.git(a, ['read-tree', arvore], { indice });
        const prefixo = destino.split(sep).join('/').replace(/\/+$/, '');
        await this.git(a, ['checkout-index', '-a', '-f', `--prefix=${prefixo}/`], { indice });
      } finally {
        rmSync(indice, { force: true });
      }
    });
  }

  private async mudancasSemFila(a: Alvo, base: string, copia: string): Promise<{ estado: 'A' | 'M' | 'D'; caminho: string }[]> {
    mkdirSync(this.pastaSombra, { recursive: true });
    const indice = this.novoIndice(a);
    try {
      await this.git(a, ['add', '-A', '--', '.'], { indice, arvoreTrabalho: copia });
      const arvore = (await this.git(a, ['write-tree'], { indice })).trim();
      const dif = await this.git(a, ['diff-tree', '-r', '-z', '--name-status', '--no-renames', base, arvore]);
      const partes = dif.split(String.fromCharCode(0)).filter((x) => x !== '');
      const lista: { estado: 'A' | 'M' | 'D'; caminho: string }[] = [];
      for (let i = 0; i + 1 < partes.length; i += 2) lista.push({ estado: partes[i] as 'A' | 'M' | 'D', caminho: partes[i + 1] });
      return lista;
    } finally {
      rmSync(indice, { force: true });
    }
  }

  // o que a copia mudou em relacao a pasta de quando o duelo comecou
  mudancasDaCopia(a: Alvo, base: string, copia: string): Promise<{ estado: 'A' | 'M' | 'D'; caminho: string }[]> {
    return this.enfileirar(a.chave, () => this.mudancasSemFila(a, base, copia));
  }

  // leva as mudancas da copia escolhida pro projeto, guardando antes um ponto de retorno (dá pra desfazer)
  aplicarCopia(a: Alvo, base: string, copia: string): Promise<number> {
    return this.enfileirar(a.chave, async () => {
      const mudancas = await this.mudancasSemFila(a, base, copia);
      if (mudancas.length === 0) return 0;
      const atual = await this.arvoreAtual(a);
      const pontos = await this.listarPontosSemFila(a);
      if (!pontos[0] || (await this.arvoreDe(a, pontos[0].commit)) !== atual) await this.gravarPonto(a, atual, 'antes de usar a resposta do duelo', pontos);
      const raizProjeto = resolve(a.pasta);
      const raizCopia = resolve(copia);
      let n = 0;
      for (const m of mudancas) {
        const destino = resolve(raizProjeto, m.caminho);
        const origem = resolve(raizCopia, m.caminho);
        if (!destino.startsWith(raizProjeto + sep) || !origem.startsWith(raizCopia + sep)) continue;
        if (m.estado === 'D') {
          try {
            unlinkSync(destino);
            n++;
          } catch {
            /* ja nao existe */
          }
        } else {
          mkdirSync(dirname(destino), { recursive: true });
          copyFileSync(origem, destino);
          n++;
        }
      }
      return n;
    });
  }

  // remove o repositorio sombra de um projeto apagado (nao mexe em .git de projeto)
  esquecer(chave: string): void {
    try {
      rmSync(join(this.pastaSombra, `${chave}.git`), { recursive: true, force: true });
    } catch {
      /* nada */
    }
  }
}
