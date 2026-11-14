// Comandos salvos: arquivos dados/comandos/<nome>.md. Digitar "/nome texto" no chat manda o pedido do arquivo,
// com o texto no lugar de {{texto}} (ou no fim, se o arquivo nao tiver {{texto}}).
// O /ata e especial (le a ultima transcricao) e fica em transcricao/ata.ts.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type Comando = { nome: string; descricao: string; embutido: boolean };
export type ComandoCompleto = Comando & { corpo: string };

export const COMANDOS_EMBUTIDOS: Comando[] = [{ nome: 'ata', descricao: 'ata da última transcrição (o texto depois vira instrução extra)', embutido: true }];

export function nomeComandoValido(nome: unknown): nome is string {
  return typeof nome === 'string' && /^[a-z0-9][a-z0-9-]{0,30}$/.test(nome) && !COMANDOS_EMBUTIDOS.some((c) => c.nome === nome);
}

const SEMENTES: { nome: string; descricao: string; corpo: string }[] = [
  {
    nome: 'grillme',
    descricao: 'me entrevista sem dó sobre um plano ou ideia',
    corpo:
      'Quero que você me entreviste sem dó sobre o plano ou a ideia abaixo, até não sobrar ponto frágil. Use a skill grill-me se ela estiver disponível. Faça uma pergunta por vez, aponte furos e premissas escondidas e só no fim resuma o que ficou decidido.\n\n{{texto}}',
  },
  {
    nome: 'site-loja',
    descricao: 'cria ou ajusta um site de loja com a skill sites-de-loja',
    corpo:
      'Use a skill sites-de-loja neste pedido. Se faltar informação (nome da loja, produtos, cores, contato, endereço), pergunte antes de começar, em múltipla escolha quando fizer sentido.\n\n{{texto}}',
  },
  {
    nome: 'revisar',
    descricao: 'revisa um texto no meu estilo e tira o jeito de texto de IA',
    corpo:
      'Revise o texto abaixo (ou o arquivo anexado). Passo 1: ajuste ao meu jeito de escrever com a skill estilo-joao-pedro. Passo 2: passe a skill humanizer para tirar marcas de texto escrito por IA. Não mude o que o texto diz e não invente informação. Entregue o texto revisado inteiro e, depois, uma lista curta do que mudou. Se não vier texto nem anexo, peça o texto.\n\n{{texto}}',
  },
];

function arquivo(pasta: string, nome: string): string {
  return join(pasta, `${nome}.md`);
}

function ler(pasta: string, nome: string): ComandoCompleto | null {
  const c = arquivo(pasta, nome);
  if (!existsSync(c)) return null;
  const bruto = readFileSync(c, 'utf8').replace(/^﻿/, '');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(bruto);
  let descricao = '';
  let corpo = bruto;
  if (m) {
    descricao = /^descricao:\s*(.*)$/m.exec(m[1])?.[1].trim() ?? '';
    corpo = m[2];
  }
  return { nome, descricao, embutido: false, corpo: corpo.trim() };
}

// cria os comandos de exemplo uma vez so (se o Joao apagar, nao voltam)
export function garantirComandos(pasta: string): void {
  mkdirSync(pasta, { recursive: true });
  const marca = join(pasta, '.semeado');
  if (existsSync(marca)) return;
  for (const s of SEMENTES) if (!existsSync(arquivo(pasta, s.nome))) gravarComando(pasta, s.nome, s.descricao, s.corpo);
  writeFileSync(marca, 'comandos de exemplo criados\n');
}

export function listarComandos(pasta: string): Comando[] {
  const lista: Comando[] = [];
  if (existsSync(pasta)) {
    for (const f of readdirSync(pasta)) {
      if (!f.endsWith('.md')) continue;
      const nome = f.slice(0, -3);
      if (!nomeComandoValido(nome)) continue;
      const c = ler(pasta, nome);
      if (c) lista.push({ nome, descricao: c.descricao, embutido: false });
    }
  }
  return [...COMANDOS_EMBUTIDOS, ...lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))];
}

export function lerComando(pasta: string, nome: string): ComandoCompleto | null {
  return nomeComandoValido(nome) ? ler(pasta, nome) : null;
}

export function gravarComando(pasta: string, nome: string, descricao: string, corpo: string): void {
  if (!nomeComandoValido(nome)) throw new Error('nome inválido: use letras minúsculas, números e - (e não use "ata")');
  if (!corpo.trim()) throw new Error('escreva o pedido do comando');
  if (Buffer.byteLength(corpo) > 100 * 1024) throw new Error('o pedido passa de 100 KB');
  mkdirSync(pasta, { recursive: true });
  const desc = descricao.replace(/\s+/g, ' ').trim();
  writeFileSync(arquivo(pasta, nome), `---\ndescricao: ${desc}\n---\n${corpo.trim()}\n`);
}

export function apagarComando(pasta: string, nome: string): boolean {
  if (!nomeComandoValido(nome) || !existsSync(arquivo(pasta, nome))) return false;
  rmSync(arquivo(pasta, nome));
  return true;
}

// "/nome texto": devolve o pedido pronto, ou null se nao for um comando salvo (a mensagem segue como veio)
export function expandirComando(texto: string, pasta: string): string | null {
  const m = /^\/([a-z0-9][a-z0-9-]*)(?:\s+([\s\S]*))?$/.exec(texto.trim());
  if (!m) return null;
  const cmd = lerComando(pasta, m[1]);
  if (!cmd) return null;
  const extra = (m[2] ?? '').trim();
  if (cmd.corpo.includes('{{texto}}')) return cmd.corpo.replace(/\{\{texto\}\}/g, extra).trim();
  return extra ? `${cmd.corpo}\n\n${extra}` : cmd.corpo;
}
