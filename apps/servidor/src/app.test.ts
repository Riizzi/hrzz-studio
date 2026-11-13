import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lerConfig } from './config.js';
import { construirApp } from './app.js';

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

test('/api/saude responde ok', async () => {
  const app = await construirApp(lerConfig({ HRZZ_WEB: 'pasta-que-nao-existe' }));
  const r = await app.inject({ method: 'GET', url: '/api/saude' });
  assert.equal(r.statusCode, 200);
  const corpo = r.json();
  assert.equal(corpo.ok, true);
  assert.equal(corpo.nome, 'hrzz-studio');
  await app.close();
});

test('rota desconhecida da 404 em json', async () => {
  const app = await construirApp(lerConfig({ HRZZ_WEB: 'pasta-que-nao-existe' }));
  const r = await app.inject({ method: 'GET', url: '/api/nada' });
  assert.equal(r.statusCode, 404);
  await app.close();
});
