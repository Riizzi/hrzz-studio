import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { construirApp } from './app.js';
import { lerConfig } from './config.js';
import { abrirBanco } from './db.js';
import { veioDaCloudflare } from './rotas.js';

process.env.HRZZ_SEM_BACKUP_AUTO = '1';

// docs/05, "PC do trabalho": pelo tunel da Cloudflare o terminal, os conectores e subir servidor ficam
// bloqueados, e o cookie do PIN dura 10 h e so viaja por HTTPS.

test('reconhece o caminho da Cloudflare por qualquer cabecalho que a borda acrescenta', () => {
  assert.equal(veioDaCloudflare({ headers: {} }), false);
  assert.equal(veioDaCloudflare({ headers: { host: '127.0.0.1:7000' } }), false);
  for (const h of ['cf-access-authenticated-user-email', 'cf-access-jwt-assertion', 'cf-ray', 'cf-connecting-ip']) {
    assert.equal(veioDaCloudflare({ headers: { [h]: 'x' } }), true, h);
  }
});

test('pela Cloudflare: cookie de 10 h com Secure e rotas de sistema bloqueadas, mesmo sem o cabecalho do Access', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'hrzz-cloudflare-'));
  const web = join(pasta, 'web');
  mkdirSync(web, { recursive: true });
  writeFileSync(join(web, 'index.html'), '<!doctype html><title>hrzz</title>');
  const app = await construirApp(lerConfig({ HRZZ_DADOS: pasta, HRZZ_WEB: web }), { banco: abrirBanco(':memory:') });
  try {
    // local: cookie normal (30 dias), sem Secure
    const local = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: '2468' } });
    const cLocal = String(local.headers['set-cookie']);
    assert.match(cLocal, /Max-Age=2592000/);
    assert.doesNotMatch(cLocal, /Secure/);

    // trabalho: so com cf-ray (como se a regra do Access tivesse sumido)
    const cf = { 'cf-ray': 'abc123-GRU', 'cf-connecting-ip': '200.0.0.1' };
    const entrar = await app.inject({ method: 'POST', url: '/api/auth/entrar', headers: cf, payload: { pin: '2468' } });
    assert.equal(entrar.statusCode, 200);
    const cTrab = String(entrar.headers['set-cookie']);
    assert.match(cTrab, /Max-Age=36000/);
    assert.match(cTrab, /; Secure/);

    const cookie = cTrab.split(';')[0];
    const h = { ...cf, cookie };
    const conectores = await app.inject({ method: 'GET', url: '/api/conectores', headers: h });
    assert.equal(conectores.statusCode, 200);
    assert.equal(conectores.json().bloqueado, true);
    const preview = await app.inject({ method: 'POST', url: '/api/preview/iniciar', headers: h, payload: {} });
    assert.equal(preview.statusCode, 403);

    // o mesmo cookie, sem os cabecalhos, ainda vale localmente (a conversa continua normal)
    assert.equal((await app.inject({ method: 'GET', url: '/api/conversas', headers: { cookie } })).statusCode, 200);
  } finally {
    await app.close();
    rmSync(pasta, { recursive: true, force: true });
  }
});
