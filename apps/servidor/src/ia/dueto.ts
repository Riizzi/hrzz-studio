// Dueto: o Claude coordena e delega partes pro Gemini por uma ferramenta propria, `pedir_ao_gemini`,
// entregue por um servidor MCP local (apps/servidor/mcp/gemini.mjs). Aqui so se prepara o arquivo de
// configuracao que o `claude` recebe em --mcp-config; quem roda o agy e o servidor MCP.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { acharPrograma } from './processo.js';
import { FERRAMENTA_GEMINI, SERVIDOR_MCP_GEMINI } from './stream.js';
import type { Modo } from './tipos.js';

export const SUBPASTA_PADRAO = 'arte';
const MODO_AGY: Record<Modo, string> = { yolo: 'auto', mid: 'accept-edits', intern: 'plan' };

// nome da subpasta do Gemini: sempre dentro do projeto, sem "..", sem caminho absoluto
export function subpastaValida(texto: string | undefined): string {
  const limpo = (texto ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!limpo || limpo.split('/').some((p) => p === '..' || p === '.' || p === '')) return SUBPASTA_PADRAO;
  if (/[<>:"|?*\0]/.test(limpo)) return SUBPASTA_PADRAO;
  const rel = relative('/p', resolve('/p', limpo));
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? limpo : SUBPASTA_PADRAO;
}

export type PreparoDueto = { mcpConfig: string; permitidas: string[]; instrucoes: string; subpasta: string };

export function prepararDueto(
  config: { raiz: string; agyBin: string; agyPastaExtra?: string },
  d: { pastaDueto: string; conversa: number; pastaProjeto: string; subpasta?: string; modo: Modo; modeloAgy?: string },
): PreparoDueto {
  const subpasta = subpastaValida(d.subpasta);
  const script = join(config.raiz, 'apps', 'servidor', 'mcp', 'gemini.mjs');
  const env: Record<string, string> = {
    HRZZ_MCP_AGY: acharPrograma(config.agyBin, config.agyPastaExtra),
    HRZZ_MCP_PASTA: d.pastaProjeto,
    HRZZ_MCP_SUBPASTA: subpasta,
    HRZZ_MCP_MODO: MODO_AGY[d.modo],
  };
  if (d.modeloAgy) env.HRZZ_MCP_MODELO = d.modeloAgy;
  const arquivo = join(d.pastaDueto, `conversa-${d.conversa}.json`);
  mkdirSync(dirname(arquivo), { recursive: true });
  writeFileSync(arquivo, JSON.stringify({ mcpServers: { [SERVIDOR_MCP_GEMINI]: { command: process.execPath, args: [script], env } } }, null, 2));
  return {
    mcpConfig: arquivo,
    permitidas: [FERRAMENTA_GEMINI],
    subpasta,
    instrucoes: instrucoesDueto(subpasta),
  };
}

export function instrucoesDueto(subpasta: string): string {
  return `Dueto ligado: você coordena e tem um parceiro, o Gemini (Google). A ferramenta pedir_ao_gemini(tarefa, arquivos) entrega uma parte do trabalho a ele. Ele trabalha na subpasta ${subpasta}/ do projeto e não vê esta conversa: escreva a tarefa completa, com o contexto que ele precisa, e liste em "arquivos" o que ele deve ler. Use quando um segundo modelo ajudar (variações de arte, imagens, alternativas); o resto você mesmo faz. Você revisa o que ele devolve e conta ao João, em poucas linhas, quem fez o quê.`;
}
