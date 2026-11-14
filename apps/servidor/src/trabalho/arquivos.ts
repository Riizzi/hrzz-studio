// Arquivos do projeto: arvore, leitura/pre-visualizacao (texto, docx, planilha), busca de texto exato
// (editar texto no preview) e galeria. Todo caminho que chega da rede passa por `caminhoSeguro`.
import { promises as fs, realpathSync, existsSync } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';

export const IGNORADAS = new Set(['.git', 'node_modules', '.astro', '.next', '.nuxt', '.svelte-kit', '.cache', '.turbo', '.venv', '__pycache__', '.vite', 'dist', 'build', 'coverage', '.DS_Store']);

export type TipoArquivo = 'pasta' | 'imagem' | 'pdf' | 'documento' | 'planilha' | 'apresentacao' | 'site' | 'codigo' | 'texto' | 'outro';

const POR_EXT: Record<string, TipoArquivo> = {
  png: 'imagem', jpg: 'imagem', jpeg: 'imagem', gif: 'imagem', webp: 'imagem', svg: 'imagem', avif: 'imagem', ico: 'imagem',
  pdf: 'pdf',
  docx: 'documento', doc: 'documento', odt: 'documento',
  xlsx: 'planilha', xls: 'planilha', csv: 'planilha', ods: 'planilha',
  pptx: 'apresentacao', ppt: 'apresentacao',
  html: 'site', htm: 'site',
  js: 'codigo', mjs: 'codigo', cjs: 'codigo', ts: 'codigo', tsx: 'codigo', jsx: 'codigo', css: 'codigo', scss: 'codigo', json: 'codigo',
  astro: 'codigo', vue: 'codigo', svelte: 'codigo', py: 'codigo', ps1: 'codigo', sh: 'codigo', sql: 'codigo', yml: 'codigo', yaml: 'codigo', toml: 'codigo', xml: 'codigo',
  md: 'texto', mdx: 'texto', txt: 'texto', srt: 'texto', log: 'texto', env: 'texto',
};

export function tipoDe(nome: string): TipoArquivo {
  const ext = extname(nome).slice(1).toLowerCase();
  return POR_EXT[ext] ?? 'outro';
}

export const CONTENT_TYPE: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', ico: 'image/x-icon',
  pdf: 'application/pdf', html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
};

export class CaminhoInvalido extends Error {}

// resolve `sub` dentro de `raiz` e garante que nem o caminho nem o destino de um link simbolico saem de la
export function caminhoSeguro(raiz: string, sub: string): string {
  const base = resolve(raiz);
  const alvo = resolve(base, sub.replace(/^[/\\]+/, ''));
  if (alvo !== base && !alvo.startsWith(base + sep)) throw new CaminhoInvalido('caminho fora da pasta do projeto');
  if (existsSync(alvo)) {
    const real = realpathSync(alvo);
    const realBase = realpathSync(base);
    if (real !== realBase && !real.startsWith(realBase + sep)) throw new CaminhoInvalido('caminho fora da pasta do projeto');
  }
  return alvo;
}

export type Entrada = { nome: string; tipo: TipoArquivo; tamanho: number; mtime: number; caminho: string };

export async function listarPasta(raiz: string, sub: string): Promise<Entrada[]> {
  const dir = caminhoSeguro(raiz, sub);
  const itens = await fs.readdir(dir, { withFileTypes: true });
  const saida: Entrada[] = [];
  for (const d of itens) {
    if (IGNORADAS.has(d.name)) continue;
    const completo = join(dir, d.name);
    let st;
    try {
      st = await fs.stat(completo);
    } catch {
      continue; // link quebrado
    }
    saida.push({ nome: d.name, tipo: st.isDirectory() ? 'pasta' : tipoDe(d.name), tamanho: st.isDirectory() ? 0 : st.size, mtime: st.mtimeMs, caminho: relative(resolve(raiz), completo).split(sep).join('/') });
  }
  return saida.sort((a, b) => (a.tipo === 'pasta' ? 0 : 1) - (b.tipo === 'pasta' ? 0 : 1) || a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
}

// ---------- pre-visualizacao ----------
export type Previa =
  | { tipo: 'texto'; nome: string; conteudo: string; truncado: boolean }
  | { tipo: 'documento'; nome: string; html: string; avisos: number }
  | { tipo: 'planilha'; nome: string; abas: { nome: string; linhas: string[][]; truncada: boolean }[] }
  | { tipo: 'imagem' | 'pdf' | 'site'; nome: string }
  | { tipo: 'sem-previa'; nome: string; motivo: string };

const LIMITE_TEXTO = 200 * 1024;
const LIMITE_LINHAS = 200;
const LIMITE_COLUNAS = 30;

function celulaTexto(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[]; hyperlink?: string; error?: string };
    if (o.result !== undefined) return celulaTexto(o.result);
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join('');
    if (o.text !== undefined) return celulaTexto(o.text);
    if (o.error) return String(o.error);
    return '';
  }
  return String(v);
}

// CSV simples (aspas, virgula ou ponto e virgula)
export function lerCsv(texto: string): string[][] {
  const sep = (texto.split('\n', 1)[0].match(/;/g)?.length ?? 0) > (texto.split('\n', 1)[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else campo += c;
  }
  if (campo !== '' || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}

export async function previa(raiz: string, sub: string): Promise<Previa> {
  const arq = caminhoSeguro(raiz, sub);
  const nome = basename(arq);
  const st = await fs.stat(arq);
  if (!st.isFile()) throw new CaminhoInvalido('isso não é um arquivo');
  const tipo = tipoDe(nome);
  const ext = extname(nome).slice(1).toLowerCase();

  if (tipo === 'imagem' || tipo === 'pdf') return { tipo, nome };
  if (tipo === 'site') return { tipo: 'site', nome };
  if (ext === 'docx') {
    const mammoth = (await import('mammoth')).default;
    const r = await mammoth.convertToHtml({ path: arq });
    return { tipo: 'documento', nome, html: r.value, avisos: r.messages.length };
  }
  if (ext === 'xlsx') {
    const ExcelJS = (await import('exceljs')).default;
    const livro = new ExcelJS.Workbook();
    await livro.xlsx.readFile(arq);
    const abas = livro.worksheets.slice(0, 12).map((ws) => {
      const linhas: string[][] = [];
      let truncada = false;
      ws.eachRow({ includeEmpty: true }, (linha, n) => {
        if (n > LIMITE_LINHAS) {
          truncada = true;
          return;
        }
        const cols = Math.min(Math.max(ws.columnCount, 1), LIMITE_COLUNAS);
        const cel: string[] = [];
        for (let c = 1; c <= cols; c++) cel.push(celulaTexto(linha.getCell(c).value));
        linhas.push(cel);
      });
      return { nome: ws.name, linhas, truncada };
    });
    return { tipo: 'planilha', nome, abas };
  }
  if (ext === 'csv') {
    const texto = (await fs.readFile(arq, 'utf8')).slice(0, LIMITE_TEXTO);
    const todas = lerCsv(texto);
    return { tipo: 'planilha', nome, abas: [{ nome, linhas: todas.slice(0, LIMITE_LINHAS).map((l) => l.slice(0, LIMITE_COLUNAS)), truncada: todas.length > LIMITE_LINHAS }] };
  }
  if (tipo === 'apresentacao' || ext === 'doc' || ext === 'xls' || ext === 'odt' || ext === 'ods') {
    return { tipo: 'sem-previa', nome, motivo: 'esse formato não tem pré-visualização aqui. Baixe e abra no programa dele.' };
  }
  // texto/codigo/outros: so se parecer texto
  const f = await fs.open(arq, 'r');
  try {
    const buf = Buffer.alloc(Math.min(st.size, LIMITE_TEXTO));
    await f.read(buf, 0, buf.length, 0);
    if (buf.includes(0)) return { tipo: 'sem-previa', nome, motivo: 'arquivo binário' };
    return { tipo: 'texto', nome, conteudo: buf.toString('utf8'), truncado: st.size > LIMITE_TEXTO };
  } finally {
    await f.close();
  }
}

// ---------- varredura (galeria e busca de texto) ----------
export type Achado = { caminho: string; nome: string; tipo: TipoArquivo; tamanho: number; mtime: number };

export async function varrer(raiz: string, opcoes: { profundidade: number; max: number; filtro?: (nome: string, tipo: TipoArquivo) => boolean }): Promise<Achado[]> {
  const saida: Achado[] = [];
  const base = resolve(raiz);
  async function andar(dir: string, nivel: number): Promise<void> {
    if (saida.length >= opcoes.max) return;
    let itens;
    try {
      itens = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of itens) {
      if (saida.length >= opcoes.max) return;
      if (IGNORADAS.has(d.name) || d.isSymbolicLink()) continue;
      const completo = join(dir, d.name);
      if (d.isDirectory()) {
        if (nivel < opcoes.profundidade) await andar(completo, nivel + 1);
      } else if (d.isFile()) {
        const tipo = tipoDe(d.name);
        if (opcoes.filtro && !opcoes.filtro(d.name, tipo)) continue;
        try {
          const st = await fs.stat(completo);
          saida.push({ caminho: relative(base, completo).split(sep).join('/'), nome: d.name, tipo, tamanho: st.size, mtime: st.mtimeMs });
        } catch {
          /* sumiu no meio */
        }
      }
    }
  }
  await andar(base, 0);
  return saida;
}
