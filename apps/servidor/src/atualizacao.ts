// Atualizar e voltar versao (docs/06-atualizacao-e-backup.md). Tudo com o git do sistema.
import { execFile } from 'node:child_process';

export type Resultado = { ok: boolean; saida: string };

function executar(programa: string, args: string[], cwd: string, timeoutMs = 120000): Promise<Resultado> {
  return new Promise((resolve) => {
    // npm no Windows e um .cmd: precisa do shell
    const shell = process.platform === 'win32' && programa === 'npm';
    execFile(programa, args, { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024, shell }, (erro, saida, erroSaida) => {
      const texto = `${saida ?? ''}${erroSaida ?? ''}`.trim();
      resolve({ ok: !erro, saida: texto || (erro ? erro.message : '') });
    });
  });
}

export const git = (raiz: string, ...args: string[]) => executar('git', args, raiz, 60000);

export type EstadoGit = {
  repositorio: boolean;
  ramo?: string;
  versao?: string;
  limpo?: boolean;
  atras?: number;
  semRemoto?: boolean;
  erro?: string;
};

export async function estadoGit(raiz: string, buscar: boolean): Promise<EstadoGit> {
  const dentro = await git(raiz, 'rev-parse', '--is-inside-work-tree');
  if (!dentro.ok) return { repositorio: false };
  const ramo = (await git(raiz, 'rev-parse', '--abbrev-ref', 'HEAD')).saida;
  const versao = (await git(raiz, 'describe', '--tags', '--always')).saida;
  const sujo = (await git(raiz, 'status', '--porcelain')).saida;
  const estado: EstadoGit = { repositorio: true, ramo, versao, limpo: sujo === '' };
  if (buscar) {
    const f = await git(raiz, 'fetch', '--quiet');
    if (!f.ok) estado.erro = `não consegui falar com o GitHub: ${f.saida.split('\n').slice(-1)[0]}`;
  }
  const atras = await git(raiz, 'rev-list', '--count', 'HEAD..@{u}');
  if (atras.ok) estado.atras = Number(atras.saida) || 0;
  else estado.semRemoto = true;
  return estado;
}

export async function listarVersoes(raiz: string): Promise<{ tag: string; data: string }[]> {
  const r = await git(raiz, 'for-each-ref', '--sort=-creatordate', '--format=%(refname:short)|%(creatordate:iso8601)', 'refs/tags/antes-*');
  if (!r.ok || !r.saida) return [];
  return r.saida
    .split(/\r?\n/)
    .map((l) => {
      const [tag, data] = l.split('|');
      return { tag, data: data ?? '' };
    })
    .filter((v) => /^antes-[0-9T-]+$/.test(v.tag));
}

function marcaDeAgora(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `antes-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// Roda a lista de passos e para no primeiro que falhar. `log` recebe cada linha pra interface mostrar.
async function passos(raiz: string, lista: { rotulo: string; programa: string; args: string[]; timeout?: number }[], log: string[]): Promise<boolean> {
  for (const p of lista) {
    log.push(`> ${p.rotulo}`);
    const r = await executar(p.programa, p.args, raiz, p.timeout ?? 300000);
    if (r.saida) log.push(r.saida.split('\n').slice(-6).join('\n'));
    if (!r.ok) {
      log.push(`falhou em: ${p.rotulo}`);
      return false;
    }
  }
  return true;
}

export async function atualizar(raiz: string): Promise<{ ok: boolean; log: string[]; reiniciar: boolean; tag?: string }> {
  const log: string[] = [];
  const estado = await estadoGit(raiz, true);
  if (!estado.repositorio) return { ok: false, log: ['esta pasta não é um repositório git'], reiniciar: false };
  if (!estado.limpo) return { ok: false, log: ['há mudanças não salvas na pasta do HRZZ. Faça commit ou descarte antes de atualizar.'], reiniciar: false };
  if (estado.erro) return { ok: false, log: [estado.erro], reiniciar: false };
  if (!estado.atras) return { ok: true, log: ['já está na versão mais nova'], reiniciar: false };

  const tag = marcaDeAgora();
  const antes = (await git(raiz, 'rev-parse', 'HEAD')).saida;
  const lockAntes = (await git(raiz, 'rev-parse', 'HEAD:package-lock.json')).saida;
  const marcou = await git(raiz, 'tag', tag);
  if (!marcou.ok) return { ok: false, log: [`não consegui marcar a versão atual: ${marcou.saida}`], reiniciar: false };
  log.push(`versão atual marcada como ${tag}`);

  let bem = await passos(raiz, [{ rotulo: 'git pull', programa: 'git', args: ['pull', '--ff-only'] }], log);
  if (bem) {
    const lockDepois = (await git(raiz, 'rev-parse', 'HEAD:package-lock.json')).saida;
    const lista = [];
    if (lockDepois !== lockAntes) lista.push({ rotulo: 'npm install', programa: 'npm', args: ['install'], timeout: 600000 });
    lista.push({ rotulo: 'npm run build', programa: 'npm', args: ['run', 'build'], timeout: 600000 });
    bem = await passos(raiz, lista, log);
  }
  if (!bem) {
    log.push(`voltando pra versão anterior (${antes.slice(0, 7)})`);
    await git(raiz, 'reset', '--hard', antes);
    return { ok: false, log, reiniciar: false, tag };
  }
  return { ok: true, log, reiniciar: true, tag };
}

export async function voltarVersao(raiz: string, tag: string): Promise<{ ok: boolean; log: string[]; reiniciar: boolean }> {
  const log: string[] = [];
  const versoes = await listarVersoes(raiz);
  if (!versoes.some((v) => v.tag === tag)) return { ok: false, log: ['versão não encontrada'], reiniciar: false };
  const estado = await estadoGit(raiz, false);
  if (!estado.limpo) return { ok: false, log: ['há mudanças não salvas na pasta do HRZZ. Faça commit ou descarte antes de voltar.'], reiniciar: false };
  const ok = await passos(
    raiz,
    [
      { rotulo: `git checkout ${tag}`, programa: 'git', args: ['checkout', tag] },
      { rotulo: 'npm install', programa: 'npm', args: ['install'], timeout: 600000 },
      { rotulo: 'npm run build', programa: 'npm', args: ['run', 'build'], timeout: 600000 },
    ],
    log,
  );
  return { ok, log, reiniciar: ok };
}

// 75 e o codigo que o vigia entende como "reinicie". Sem vigia (npm run dev) so avisa.
export const CODIGO_REINICIAR = 75;
