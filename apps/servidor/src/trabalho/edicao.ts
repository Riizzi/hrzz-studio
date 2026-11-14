// Editar texto no preview: acha o texto exato nos arquivos-fonte do projeto.
// Uma unica ocorrencia em um unico arquivo: grava direto. Zero ou mais de uma: devolve o motivo
// e a interface manda o pedido pro Claude (docs/07-etapas.md, etapa 2).
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { varrer } from './arquivos.js';

const EXTENSOES = new Set(['html', 'htm', 'astro', 'jsx', 'tsx', 'vue', 'svelte', 'md', 'mdx', 'js', 'ts', 'json', 'njk', 'liquid', 'hbs', 'php', 'txt']);
const LIMITE_ARQUIVO = 1024 * 1024;

export type ResultadoEdicao =
  | { ok: true; arquivo: string; antesDe: string }
  | { ok: false; motivo: 'nao-achei' | 'ambiguo' | 'invalido'; arquivos?: string[]; ocorrencias?: number };

function escaparHtml(t: string, aspas: 'dupla' | 'simples' | 'num'): string {
  let r = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (aspas === 'dupla') r = r.replace(/"/g, '&quot;');
  if (aspas === 'num') r = r.replace(/'/g, '&#39;');
  return r;
}

// formas em que o mesmo texto pode estar escrito no codigo-fonte (bruto e com entidades HTML)
export function variantes(antes: string, depois: string): { procurar: string; trocar: string }[] {
  const lista = [{ procurar: antes, trocar: depois }];
  const esc = escaparHtml(antes, 'dupla');
  if (esc !== antes) lista.push({ procurar: esc, trocar: escaparHtml(depois, 'dupla') });
  const num = escaparHtml(antes, 'num');
  if (num !== antes && num !== esc) lista.push({ procurar: num, trocar: escaparHtml(depois, 'num') });
  return lista;
}

function contar(conteudo: string, trecho: string): number {
  let n = 0;
  for (let i = conteudo.indexOf(trecho); i >= 0; i = conteudo.indexOf(trecho, i + trecho.length)) n++;
  return n;
}

export async function acharETrocar(pasta: string, antes: string, depois: string, aoGravar?: () => Promise<void>): Promise<ResultadoEdicao> {
  antes = antes.trim();
  depois = depois.trim();
  if (!antes || !depois || antes === depois || antes.length > 2000 || depois.length > 2000) return { ok: false, motivo: 'invalido' };
  const arquivos = await varrer(pasta, { profundidade: 8, max: 3000, filtro: (nome) => EXTENSOES.has(nome.split('.').pop()!.toLowerCase()) });
  const lista = variantes(antes, depois);

  // para cada arquivo, a primeira forma que aparecer (bruta antes das com entidade)
  const achados: { caminho: string; conteudo: string; v: { procurar: string; trocar: string }; vezes: number }[] = [];
  for (const a of arquivos) {
    if (a.tamanho > LIMITE_ARQUIVO) continue;
    const conteudo = await fs.readFile(join(pasta, a.caminho), 'utf8').catch(() => null);
    if (conteudo === null) continue;
    for (const v of lista) {
      const vezes = contar(conteudo, v.procurar);
      if (vezes > 0) {
        achados.push({ caminho: a.caminho, conteudo, v, vezes });
        break;
      }
    }
  }
  if (achados.length === 0) return { ok: false, motivo: 'nao-achei' };
  const total = achados.reduce((s, a) => s + a.vezes, 0);
  if (total > 1) return { ok: false, motivo: 'ambiguo', arquivos: achados.map((a) => a.caminho), ocorrencias: total };

  const alvo = achados[0];
  const i = alvo.conteudo.indexOf(alvo.v.procurar);
  const novo = alvo.conteudo.slice(0, i) + alvo.v.trocar + alvo.conteudo.slice(i + alvo.v.procurar.length);
  if (aoGravar) await aoGravar(); // ponto de retorno antes de mexer
  const arq = resolve(pasta, alvo.caminho);
  await fs.writeFile(arq, novo, 'utf8');
  return { ok: true, arquivo: alvo.caminho, antesDe: antes };
}
