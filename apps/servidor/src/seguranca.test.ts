import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { construirApp } from './app.js';
import { lerConfig } from './config.js';
import { abrirBanco } from './db.js';

process.env.HRZZ_SEM_BACKUP_AUTO = '1';

// Regra 6 do CLAUDE.md: toda rota (inclusive localhost) exige o cookie do PIN. As unicas abertas sao
// a saude, as rotas de auth e a interface estatica (so codigo da tela, nada pessoal).
const ABERTAS = (url: string) => url === '/api/saude' || url.startsWith('/api/auth/');

test('toda rota da API, do preview e dos websockets responde 401 sem o cookie do PIN', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'hrzz-seguranca-'));
  // com a interface compilada de mentira, pra a rota estatica tambem existir
  const web = join(pasta, 'web');
  mkdirSync(web, { recursive: true });
  writeFileSync(join(web, 'index.html'), '<!doctype html><title>hrzz</title>');
  const config = lerConfig({ HRZZ_DADOS: pasta, HRZZ_WEB: web });
  const app = await construirApp(config, { banco: abrirBanco(':memory:') });
  try {
    // com PIN criado (sem PIN a tela de criacao e a unica coisa que existe)
    await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: '2468' } });
    const rotas = app.rotasRegistradas.filter((r) => r.metodo !== 'HEAD' && r.metodo !== 'OPTIONS');
    assert.ok(rotas.length > 80, `esperava mais de 80 rotas, achei ${rotas.length}`);
    const protegidas = rotas.filter((r) => (r.url.startsWith('/api/') && !ABERTAS(r.url)) || r.url.startsWith('/preview'));
    assert.ok(protegidas.length > 70);
    const furos: string[] = [];
    for (const r of protegidas) {
      const url = r.url.replace(/:[A-Za-z_]+/g, '1').replace(/\*/g, 'x');
      const resp = await app.inject({ method: r.metodo as 'GET', url, payload: r.metodo === 'GET' || r.metodo === 'DELETE' ? undefined : {} });
      if (resp.statusCode !== 401) furos.push(`${r.metodo} ${r.url} -> ${resp.statusCode}`);
    }
    assert.deepEqual(furos, []);
    // as abertas continuam abertas
    assert.equal((await app.inject({ method: 'GET', url: '/api/saude' })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/api/auth/estado' })).statusCode, 200);
    // e um cookie falso nao vale
    assert.equal((await app.inject({ method: 'GET', url: '/api/conversas', headers: { cookie: 'hrzz_sessao=falso' } })).statusCode, 401);
    // arquivo de projeto e preview por caminho de recurso tambem exigem
    assert.equal((await app.inject({ method: 'GET', url: '/preview/5173/index.html' })).statusCode, 401);
  } finally {
    await app.close();
    rmSync(pasta, { recursive: true, force: true });
  }
});
