// Transcricoes salvas em dados/transcricoes: ultima, copia como anexo do chat e o comando /ata.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

export type ResumoTranscricao = { id: string; titulo: string; criada: string; idioma?: string; duracao?: number };

export function listarSalvas(pasta: string): ResumoTranscricao[] {
  if (!existsSync(pasta)) return [];
  const itens: ResumoTranscricao[] = [];
  for (const f of readdirSync(pasta)) {
    if (!f.endsWith('.json')) continue;
    try {
      const m = JSON.parse(readFileSync(join(pasta, f), 'utf8')) as ResumoTranscricao;
      if (m.id && m.titulo) itens.push({ id: m.id, titulo: m.titulo, criada: m.criada ?? '', idioma: m.idioma, duracao: m.duracao });
    } catch {
      /* arquivo incompleto: ignora */
    }
  }
  return itens.sort((a, b) => b.criada.localeCompare(a.criada));
}

export function idValido(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,80}$/.test(id);
}

// copia o .txt da transcricao pra pasta de anexos (o claude ja enxerga essa pasta) e devolve o anexo
export function comoAnexo(pastaTranscricoes: string, pastaAnexos: string, id: string): { nome: string; caminho: string; tipo: string; titulo: string } | null {
  if (!idValido(id)) return null;
  const origem = join(pastaTranscricoes, `${id}.txt`);
  if (!existsSync(origem)) return null;
  let titulo = id;
  try {
    titulo = (JSON.parse(readFileSync(join(pastaTranscricoes, `${id}.json`), 'utf8')) as { titulo?: string }).titulo ?? id;
  } catch {
    /* sem json: usa o id */
  }
  const pasta = join(pastaAnexos, new Date().toISOString().slice(0, 10));
  mkdirSync(pasta, { recursive: true });
  const nome = `${id}.txt`;
  const caminho = join(pasta, `${randomBytes(4).toString('hex')}-${nome}`);
  copyFileSync(origem, caminho);
  return { nome, caminho, tipo: 'texto', titulo };
}

export const SUGESTOES = [
  { rotulo: 'resumo', texto: 'Faça um resumo da transcrição anexada em até 10 linhas.' },
  { rotulo: 'ata', texto: textoAta() },
  { rotulo: 'tópicos e encaminhamentos', texto: 'Liste os tópicos tratados na transcrição anexada e, separados, os encaminhamentos: o que, quem e prazo (quando aparecerem).' },
];

function textoAta(titulo?: string): string {
  return `Faça a ata da reunião${titulo ? ` "${titulo}"` : ''} a partir da transcrição anexada. Estrutura: data e participantes (se aparecerem), pauta, decisões, encaminhamentos (o que, responsável e prazo) e pendências. Linguagem institucional, objetiva e sem inventar nada que não esteja na fala. Se algo estiver ambíguo, marque como [a confirmar].`;
}

// "/ata" no comeco da mensagem vira o pedido de ata com a ultima transcricao anexada.
// O que vier depois de "/ata" entra como instrucao extra.
export function expandirAta(texto: string, pastaTranscricoes: string, pastaAnexos: string): { texto: string; anexo: { nome: string; caminho: string; tipo: string } } | { erro: string } | null {
  const m = /^\/ata(?:\s+([\s\S]*))?$/i.exec(texto.trim());
  if (!m) return null;
  const ultima = listarSalvas(pastaTranscricoes)[0];
  if (!ultima) return { erro: 'ainda não há transcrição. Faça uma na tela transcrição e use /ata de novo.' };
  const anexo = comoAnexo(pastaTranscricoes, pastaAnexos, ultima.id);
  if (!anexo) return { erro: 'não achei o texto da última transcrição.' };
  const extra = m[1]?.trim();
  return { texto: textoAta(ultima.titulo) + (extra ? `\n\nInstruções extras: ${extra}` : ''), anexo: { nome: anexo.nome, caminho: anexo.caminho, tipo: anexo.tipo } };
}
