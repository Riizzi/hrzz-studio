import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { lerConfig } from './config.js';
import { construirApp } from './app.js';
import { abrirBanco } from './db.js';

// nunca usa a pasta dados/ de verdade nos testes
async function appDeTeste() {
  const pasta = mkdtempSync(join(tmpdir(), 'hrzz-app-'));
  const config = lerConfig({ HRZZ_DADOS: pasta, HRZZ_WEB: join(pasta, 'sem-web') });
  const app = await construirApp(config, { banco: abrirBanco(':memory:') });
  return { app, pasta };
}

test('config escuta so em 127.0.0.1 e usa a porta padrao 7000', () => {
  const c = lerConfig({});
  assert.equal(c.host, '127.0.0.1');
  assert.equal(c.porta, 7000);
});

test('config aceita porta por variavel e ignora valor invalido', () => {
  assert.equal(lerConfig({ HRZZ_PORTA: '7050' }).porta, 7050);
  assert.equal(lerConfig({ HRZZ_PORTA: 'abc' }).porta, 7000);
  assert.equal(lerConfig({ HRZZ_PORTA: '99999' }).porta, 7000);
});

test('/api/saude responde ok sem PIN', async () => {
  const { app, pasta } = await appDeTeste();
  const r = await app.inject({ method: 'GET', url: '/api/saude' });
  assert.equal(r.statusCode, 200);
  const corpo = r.json();
  assert.equal(corpo.ok, true);
  assert.equal(corpo.nome, 'hrzz-studio');
  await app.close();
  rmSync(pasta, { recursive: true, force: true });
});

test('rota desconhecida da 401 sem PIN e 404 com PIN', async () => {
  const { app, pasta } = await appDeTeste();
  assert.equal((await app.inject({ method: 'GET', url: '/api/nada' })).statusCode, 401);
  const def = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: '1234' } });
  const cookie = String(def.headers['set-cookie']).split(';')[0];
  const r = await app.inject({ method: 'GET', url: '/api/nada', headers: { cookie } });
  assert.equal(r.statusCode, 404);
  await app.close();
  rmSync(pasta, { recursive: true, force: true });
});
