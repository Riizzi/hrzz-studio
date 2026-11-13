// SQLite do HRZZ (node:sqlite, sem dependencia nativa). Um arquivo so: dados/hrzz.db
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type Banco = DatabaseSync;

const ESQUEMA = `
create table if not exists projetos (
  id integer primary key autoincrement,
  nome text not null,
  pasta text not null,
  criado text not null default (datetime('now'))
);
create table if not exists conversas (
  id integer primary key autoincrement,
  projeto_id integer references projetos(id) on delete set null,
  titulo text not null default 'nova conversa',
  motor text not null default 'claude',
  modelo text,
  modelo_auto integer not null default 1,
  modo text not null default 'mid',
  pensar integer not null default 1,
  esforco integer not null default 1,
  web integer not null default 1,
  sessao_claude text,
  sessao_agy text,
  liberadas text not null default '[]',
  criada text not null default (datetime('now')),
  atualizada text not null default (datetime('now'))
);
create table if not exists mensagens (
  id integer primary key autoincrement,
  conversa_id integer not null references conversas(id) on delete cascade,
  papel text not null,
  conteudo text not null,
  criada text not null default (datetime('now'))
);
create index if not exists idx_msg_conversa on mensagens(conversa_id);
create table if not exists progresso (
  id integer primary key autoincrement,
  conversa_id integer references conversas(id) on delete cascade,
  projeto_id integer references projetos(id) on delete cascade,
  texto text not null,
  estado text not null default 'afazer',
  origem text not null default 'ia',
  detalhe text,
  ordem integer not null default 0,
  mudou text not null default (datetime('now'))
);
create table if not exists config (
  chave text primary key,
  valor text not null
);
`;

export function abrirBanco(arquivo: string): Banco {
  if (arquivo !== ':memory:') mkdirSync(dirname(arquivo), { recursive: true });
  const db = new DatabaseSync(arquivo);
  db.exec('pragma journal_mode = wal');
  db.exec('pragma foreign_keys = on');
  db.exec(ESQUEMA);
  return db;
}

export function lerConfigBanco(db: Banco, chave: string): string | undefined {
  const l = db.prepare('select valor from config where chave = ?').get(chave) as { valor: string } | undefined;
  return l?.valor;
}

export function gravarConfigBanco(db: Banco, chave: string, valor: string): void {
  db.prepare('insert into config(chave, valor) values(?, ?) on conflict(chave) do update set valor = excluded.valor').run(chave, valor);
}

// copia segura do banco aberto (usada no backup da etapa 7): VACUUM INTO nunca copia o arquivo "no meio"
export function copiarBanco(db: Banco, destino: string): void {
  mkdirSync(dirname(destino), { recursive: true });
  db.prepare('vacuum into ?').run(destino);
}
