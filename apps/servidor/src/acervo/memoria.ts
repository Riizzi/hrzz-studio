// Memoria do Joao: arquivos .md em dados/memoria (podem ter subpastas, ex.: areas/hrzz.md).
// A IA le tudo no comeco de toda conversa (ia/prompt.ts). Aqui ficam listar, ler, gravar, apagar e importar.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const LIMITE_ARQUIVO = 200 * 1024;
export const LIMITE_MEMORIA_PROMPT = 12000;

export type ArquivoMemoria = { nome: string; tamanho: number; modificado: number };

// nome sem a extensao, com subpastas separadas por "/": "perfil", "areas/hrzz"
export function nomeMemoriaValido(nome: unknown): nome is string {
  return typeof nome === 'string' && nome.length <= 120 && /^[\p{L}\p{N}_-]+(\/[\p{L}\p{N}_-]+){0,2}$/u.test(nome);
}

function caminhoDe(pasta: string, nome: string): string {
  return join(pasta, ...nome.split('/')) + '.md';
}

export function listarMemoria(pasta: string): ArquivoMemoria[] {
  const achados: ArquivoMemoria[] = [];
  const varrer = (dir: string, prefixo: string, nivel: number) => {
    if (!existsSync(dir) || nivel > 2) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) varrer(join(dir, e.name), `${prefixo}${e.name}/`, nivel + 1);
      else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        const nome = prefixo + e.name.slice(0, -3);
        if (!nomeMemoriaValido(nome)) continue;
        const st = statSync(join(dir, e.name));
        achados.push({ nome, tamanho: st.size, modificado: st.mtimeMs });
      }
    }
  };
  varrer(pasta, '', 0);
  return achados.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function lerArquivoMemoria(pasta: string, nome: string): string | null {
  if (!nomeMemoriaValido(nome)) return null;
  const c = caminhoDe(pasta, nome);
  return existsSync(c) ? readFileSync(c, 'utf8') : null;
}

export function gravarArquivoMemoria(pasta: string, nome: string, conteudo: string): void {
  if (!nomeMemoriaValido(nome)) throw new Error('nome inválido: use letras, números, - e _ (e / pra subpasta)');
  if (Buffer.byteLength(conteudo) > LIMITE_ARQUIVO) throw new Error('o arquivo passa de 200 KB');
  const c = caminhoDe(pasta, nome);
  mkdirSync(dirname(c), { recursive: true });
  writeFileSync(c, conteudo);
}

export function apagarArquivoMemoria(pasta: string, nome: string): boolean {
  if (!nomeMemoriaValido(nome)) return false;
  const c = caminhoDe(pasta, nome);
  if (!existsSync(c)) return false;
  rmSync(c);
  // tira a subpasta se ficou vazia (nunca a pasta da memoria)
  let dir = dirname(c);
  while (dir !== pasta && dir.startsWith(pasta)) {
    try {
      rmdirSync(dir);
    } catch {
      break;
    }
    dir = dirname(dir);
  }
  return true;
}

export function slugMemoria(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'sem-titulo'
  );
}

function nomeLivre(pasta: string, base: string): string {
  let nome = base;
  for (let i = 2; existsSync(caminhoDe(pasta, nome)); i++) nome = `${base}-${i}`;
  return nome;
}

// O texto que o claude.ai mostra em Configuracoes > Memoria (copiado ou salvo em .txt/.md).
// Se vier com titulos e "dividir" estiver ligado, cada titulo vira um arquivo em claude-ai/.
export function importarMemoria(pasta: string, texto: string, dividir: boolean): string[] {
  const limpo = texto.replace(/\r\n/g, '\n').trim();
  if (!limpo) throw new Error('o texto está vazio');
  const criados: string[] = [];
  const gravar = (base: string, conteudo: string) => {
    const nome = nomeLivre(pasta, base);
    gravarArquivoMemoria(pasta, nome, conteudo.trim() + '\n');
    criados.push(nome);
  };

  if (dividir) {
    const secoes: { titulo: string; linhas: string[] }[] = [];
    let atual: { titulo: string; linhas: string[] } | null = null;
    for (const linha of limpo.split('\n')) {
      const m = /^#{1,3}\s+(.+?)\s*#*\s*$/.exec(linha);
      if (m) {
        atual = { titulo: m[1], linhas: [] };
        secoes.push(atual);
      } else if (atual) atual.linhas.push(linha);
      else if (linha.trim()) {
        atual = { titulo: 'inicio', linhas: [linha] };
        secoes.push(atual);
      }
    }
    const comTexto = secoes.filter((s) => s.linhas.join('').trim());
    if (comTexto.length >= 2) {
      for (const s of comTexto) gravar(`claude-ai/${slugMemoria(s.titulo)}`, `# ${s.titulo}\n\n${s.linhas.join('\n').trim()}`);
      return criados;
    }
  }
  gravar('claude-ai', limpo);
  return criados;
}

// tudo que entra nas instrucoes de fundo; cortado em LIMITE_MEMORIA_PROMPT caracteres
export function lerMemoriaParaPrompt(pasta: string): string {
  const partes: string[] = [];
  for (const a of listarMemoria(pasta)) {
    try {
      const t = readFileSync(caminhoDe(pasta, a.nome), 'utf8').trim();
      if (t) partes.push(`### ${a.nome}.md\n${t}`);
    } catch {
      /* arquivo sumiu no meio: ignora */
    }
  }
  const tudo = partes.join('\n\n');
  return tudo.length > LIMITE_MEMORIA_PROMPT ? tudo.slice(0, LIMITE_MEMORIA_PROMPT) + '\n[memória cortada: muito grande]' : tudo;
}

export function tamanhoTotalMemoria(pasta: string): number {
  return listarMemoria(pasta).reduce((s, a) => s + a.tamanho, 0);
}
