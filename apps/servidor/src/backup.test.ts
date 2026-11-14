import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { Backups, dataDoNome, nomeDoBackup } from './backup.js';
import { construirApp } from './app.js';
import { lerConfig } from './config.js';
import { abrirBanco } from './db.js';

process.env.HRZZ_SEM_BACKUP_AUTO = '1';

function montar() {
  const pasta = mkdtempSync(join(tmpdir(), 'hrzz-backup-'));
  const config = lerConfig({ HRZZ_DADOS: pasta, HRZZ_WEB: join(pasta, 'sem-web') });
  const db = abrirBanco(join(pasta, 'hrzz.db'));
  db.prepare("insert into projetos(nome, pasta) values('loja', 'C:/x')").run();
  mkdirSync(join(pasta, 'memoria', 'areas'), { recursive: true });
  writeFileSync(join(pasta, 'memoria', 'perfil.md'), 'sou o Joao');
  writeFileSync(join(pasta, 'memoria', 'areas', 'hrzz.md'), 'projeto hrzz');
  mkdirSync(join(pasta, 'skills', 'minha'), { recursive: true });
  writeFileSync(join(pasta, 'skills', 'minha', 'SKILL.md'), 'skill');
  mkdirSync(join(pasta, 'comandos'), { recursive: true });
  writeFileSync(join(pasta, 'comandos', 'revisar.md'), 'revise');
  mkdirSync(join(pasta, 'transcricoes'), { recursive: true });
  writeFileSync(join(pasta, 'transcricoes', 'reuniao.txt'), 'bom dia');
  writeFileSync(join(pasta, 'transcricoes', 'reuniao.json'), '{}');
  writeFileSync(join(pasta, 'transcricoes', 'reuniao.wav'), 'audio enorme');
  mkdirSync(join(pasta, 'segredos'), { recursive: true });
  writeFileSync(join(pasta, 'segredos', 'pin.json'), 'segredo');
  mkdirSync(join(pasta, 'anexos'), { recursive: true });
  writeFileSync(join(pasta, 'anexos', 'foto.png'), 'png');
  return { pasta, config, db };
}

test('nome do backup leva a data e volta a data', () => {
  const d = new Date(2026, 10, 14, 3, 0, 5);
  assert.equal(nomeDoBackup(d), 'hrzz-20261114-030005');
  assert.equal(dataDoNome('hrzz-20261114-030005')?.getTime(), d.getTime());
  assert.equal(dataDoNome('hrzz-20261114-030005-2')?.getTime(), d.getTime());
  assert.equal(dataDoNome('qualquer-coisa'), null);
});

test('backup copia banco, memoria, skills, comandos e so os textos das transcricoes; deixa segredos e anexos de fora', async () => {
  const { pasta, config, db } = montar();
  try {
    const b = new Backups(config, db);
    const r = await b.fazer(new Date(2026, 10, 14, 3, 0, 0));
    const raiz = join(pasta, 'backups', r.nome);
    assert.ok(existsSync(join(raiz, 'hrzz.db')));
    assert.equal(readFileSync(join(raiz, 'memoria', 'areas', 'hrzz.md'), 'utf8'), 'projeto hrzz');
    assert.ok(existsSync(join(raiz, 'skills', 'minha', 'SKILL.md')));
    assert.ok(existsSync(join(raiz, 'comandos', 'revisar.md')));
    assert.ok(existsSync(join(raiz, 'transcricoes', 'reuniao.txt')));
    assert.ok(existsSync(join(raiz, 'transcricoes', 'reuniao.json')));
    assert.ok(!existsSync(join(raiz, 'transcricoes', 'reuniao.wav')), 'audio fica de fora');
    assert.ok(!existsSync(join(raiz, 'segredos')), 'segredos ficam de fora');
    assert.ok(!existsSync(join(raiz, 'anexos')), 'anexos ficam de fora');
    assert.ok(r.arquivos >= 7 && r.tamanho > 0);
    // o banco copiado abre e tem os dados
    const copia = new DatabaseSync(join(raiz, 'hrzz.db'));
    assert.equal((copia.prepare('select nome from projetos').get() as { nome: string }).nome, 'loja');
    copia.close();
    // nada de pasta provisoria sobrando
    assert.deepEqual(
      b.listar().map((x) => x.nome),
      [r.nome],
    );
  } finally {
    db.close();
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('backup guarda so os ultimos N e apaga os mais antigos', async () => {
  const { pasta, config, db } = montar();
  try {
    const b = new Backups(config, db, { manter: 3 });
    for (let dia = 1; dia <= 5; dia++) await b.fazer(new Date(2026, 10, dia, 3, 0, 0));
    assert.deepEqual(
      b.listar().map((x) => x.nome),
      ['hrzz-20261105-030000', 'hrzz-20261104-030000', 'hrzz-20261103-030000'],
    );
  } finally {
    db.close();
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('dois backups no mesmo segundo nao se sobrescrevem, e pasta alheia dentro de backups nao e apagada', async () => {
  const { pasta, config, db } = montar();
  try {
    mkdirSync(join(pasta, 'backups', 'minhas-coisas'), { recursive: true });
    const b = new Backups(config, db, { manter: 1 });
    const quando = new Date(2026, 10, 14, 3, 0, 0);
    const a1 = await b.fazer(quando);
    const a2 = await b.fazer(quando);
    assert.notEqual(a1.nome, a2.nome);
    assert.equal(b.listar().length, 1);
    assert.ok(existsSync(join(pasta, 'backups', 'minhas-coisas')));
  } finally {
    db.close();
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('pasta provisoria de um backup interrompido e limpa e nunca aparece na lista', async () => {
  const { pasta, config, db } = montar();
  try {
    mkdirSync(join(pasta, 'backups', '.incompleto-hrzz-20261101-030000'), { recursive: true });
    const b = new Backups(config, db);
    assert.equal(b.listar().length, 0);
    await b.fazer();
    assert.ok(!existsSync(join(pasta, 'backups', '.incompleto-hrzz-20261101-030000')));
  } finally {
    db.close();
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('backup sem memoria, skills nem transcricoes ainda funciona (instalacao nova)', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'hrzz-backup-vazio-'));
  const config = lerConfig({ HRZZ_DADOS: pasta });
  const db = abrirBanco(join(pasta, 'hrzz.db'));
  try {
    const r = await new Backups(config, db).fazer();
    assert.ok(existsSync(join(pasta, 'backups', r.nome, 'hrzz.db')));
  } finally {
    db.close();
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('o proximo backup e as 03:00', () => {
  const { pasta, config, db } = montar();
  try {
    const d = new Date(new Backups(config, db).proximo() ?? '');
    assert.equal(d.getHours(), 3);
    assert.equal(d.getMinutes(), 0);
    assert.ok(d.getTime() > Date.now());
  } finally {
    db.close();
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('rotas: exigem PIN, fazem backup e listam', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'hrzz-backup-rota-'));
  const config = lerConfig({ HRZZ_DADOS: pasta, HRZZ_WEB: join(pasta, 'sem-web') });
  const app = await construirApp(config, { banco: abrirBanco(join(pasta, 'hrzz.db')) });
  try {
    assert.equal((await app.inject({ method: 'GET', url: '/api/backup' })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/api/backup' })).statusCode, 401);
    const def = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: '2468' } });
    const cookie = String(def.headers['set-cookie']).split(';')[0];
    const antes = (await app.inject({ method: 'GET', url: '/api/backup', headers: { cookie } })).json();
    assert.equal(antes.lista.length, 0);
    assert.equal(antes.ultimo, null);
    assert.equal(antes.manter, 14);
    assert.equal(antes.horario, '03:00');
    const feito = await app.inject({ method: 'POST', url: '/api/backup', headers: { cookie } });
    assert.equal(feito.statusCode, 200);
    assert.equal(feito.json().total, 1);
    const depois = (await app.inject({ method: 'GET', url: '/api/backup', headers: { cookie } })).json();
    assert.equal(depois.lista.length, 1);
    assert.equal(depois.ultimo.nome, feito.json().backup.nome);
    // o PIN nao vai pro backup
    assert.ok(!existsSync(join(pasta, 'backups', depois.ultimo.nome, 'segredos')));
  } finally {
    await app.close();
    rmSync(pasta, { recursive: true, force: true });
  }
});
