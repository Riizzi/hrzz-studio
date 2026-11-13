import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { lerConfig } from './config.js';
import { construirApp } from './app.js';
import { abrirBanco } from './db.js';
import { Repo } from './repo.js';

// "claude" de mentira: le o prompt da entrada padrao e responde no mesmo formato do stream-json
const FALSO = `
import { readFileSync } from 'node:fs';
const prompt = readFileSync(0, 'utf8');
const args = process.argv.slice(2);
const sid = args.includes('--resume') ? args[args.indexOf('--resume') + 1] : 'sessao-falsa-1';
const out = (o) => console.log(JSON.stringify(o));
out({ type: 'system', subtype: 'init', session_id: sid });
if (prompt.includes('quebrar')) { out({ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in', session_id: sid }); process.exit(0); }
if (prompt.includes('apagar')) {
  out({ type: 'result', subtype: 'success', is_error: false, result: 'negado', session_id: sid, permission_denials: [{ tool_name: 'Bash', tool_input: { command: 'rm a.txt' } }] });
  process.exit(0);
}
out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ola' } } });
out({ type: 'assistant', message: { content: [{ type: 'text', text: 'ola ' + args.join(' ').includes('--model') + ' ' + sid + '\\n<progresso>\\n[x] responder\\n</progresso>' }] } });
out({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', unifiedWindows: { five_hour: { utilization: 0.5, resetsAt: 1 }, seven_day: { utilization: 0.1 } } } });
out({ type: 'result', subtype: 'success', is_error: false, session_id: sid, total_cost_usd: 0.001, usage: { input_tokens: 1, output_tokens: 1 }, permission_denials: [] });
`;

function criarFalso(pasta: string): string {
  writeFileSync(join(pasta, 'falso.mjs'), FALSO);
  if (process.platform === 'win32') {
    const cmd = join(pasta, 'falso.cmd');
    writeFileSync(cmd, `@echo off\r\n"${process.execPath}" "${join(pasta, 'falso.mjs')}" %*\r\n`);
    return cmd;
  }
  const sh = join(pasta, 'falso.sh');
  writeFileSync(sh, `#!/bin/sh\nexec "${process.execPath}" "${join(pasta, 'falso.mjs')}" "$@"\n`);
  chmodSync(sh, 0o755);
  return sh;
}

async function montar() {
  const pasta = mkdtempSync(join(tmpdir(), 'hrzz-teste-'));
  const config = { ...lerConfig({ HRZZ_DADOS: join(pasta, 'dados'), HRZZ_WEB: join(pasta, 'sem-web'), HRZZ_CLAUDE: criarFalso(pasta) }) };
  const app = await construirApp(config, { banco: abrirBanco(':memory:') });
  await app.ready();
  return { app, pasta, config };
}

async function entrar(app: Awaited<ReturnType<typeof montar>>['app']): Promise<string> {
  const r = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: '1234' } });
  assert.equal(r.statusCode, 200);
  return String(r.headers['set-cookie']).split(';')[0];
}

async function esperar(cond: () => boolean, ms = 8000): Promise<void> {
  const fim = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fim) throw new Error('tempo esgotado esperando a condicao');
    await new Promise((r) => setTimeout(r, 25));
  }
}

test('PIN: rotas da API pedem cookie; saude e auth ficam abertas', async () => {
  const { app, pasta } = await montar();
  assert.equal((await app.inject({ url: '/api/saude' })).statusCode, 200);
  assert.equal((await app.inject({ url: '/api/conversas' })).statusCode, 401);
  assert.equal((await app.inject({ url: '/api/projetos' })).statusCode, 401);
  assert.equal((await app.inject({ url: '/api/uso' })).statusCode, 401);
  assert.equal((await app.inject({ url: '/api/sistema' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/api/anexos?nome=a.txt', headers: { 'content-type': 'application/octet-stream' }, payload: 'x' })).statusCode, 401);
  const estado = (await app.inject({ url: '/api/auth/estado' })).json();
  assert.deepEqual(estado, { temPin: false, logado: false });
  await app.close();
  rmSync(pasta, { recursive: true, force: true });
});

test('PIN: define, entra, erra, sai e o cookie vale 30 dias', async () => {
  const { app, pasta } = await montar();
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: 'ab' } })).statusCode, 400);
  const def = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: '4321' } });
  assert.equal(def.statusCode, 200);
  const setCookie = String(def.headers['set-cookie']);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, new RegExp(`Max-Age=${30 * 24 * 3600}`));
  const cookie = setCookie.split(';')[0];
  assert.equal((await app.inject({ url: '/api/conversas', headers: { cookie } })).statusCode, 200);
  // com PIN definido, ninguem sem login troca o PIN
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: '9999' } })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/entrar', payload: { pin: '0000' } })).statusCode, 401);
  const ok = await app.inject({ method: 'POST', url: '/api/auth/entrar', payload: { pin: '4321' } });
  assert.equal(ok.statusCode, 200);
  // cookie falsificado nao entra
  assert.equal((await app.inject({ url: '/api/conversas', headers: { cookie: 'hrzz_sessao=abc.def' } })).statusCode, 401);
  await app.close();
  rmSync(pasta, { recursive: true, force: true });
});

test('PIN: cinco erros seguidos bloqueiam por um tempo', async () => {
  const { app, pasta } = await montar();
  await entrar(app);
  for (let i = 0; i < 5; i++) await app.inject({ method: 'POST', url: '/api/auth/entrar', payload: { pin: '0000' } });
  const r = await app.inject({ method: 'POST', url: '/api/auth/entrar', payload: { pin: '1234' } });
  assert.equal(r.statusCode, 429);
  await app.close();
  rmSync(pasta, { recursive: true, force: true });
});

test('PIN: trocar o PIN derruba as sessoes antigas e o websocket tambem pede cookie', async () => {
  const { app, pasta } = await montar();
  const cookie = await entrar(app);
  const novo = await app.inject({ method: 'POST', url: '/api/auth/pin', headers: { cookie }, payload: { pin: '5555', atual: '1234' } });
  assert.equal(novo.statusCode, 200);
  assert.equal((await app.inject({ url: '/api/conversas', headers: { cookie } })).statusCode, 401);
  await assert.rejects(() => app.injectWS('/api/ws'));
  await app.close();
  rmSync(pasta, { recursive: true, force: true });
});

test('conversa: manda mensagem pelo websocket, grava resposta, sessao, progresso e uso', async () => {
  const { app, pasta } = await montar();
  const cookie = await entrar(app);
  const ws = await app.injectWS('/api/ws', { headers: { cookie } });
  const recebidos: any[] = [];
  ws.on('message', (d: Buffer) => recebidos.push(JSON.parse(d.toString())));

  ws.send(JSON.stringify({ tipo: 'enviar', texto: 'crie um site simples', modo: 'mid', pensar: 1, esforco: 1, web: true, modelo: 'auto' }));
  await esperar(() => recebidos.some((m) => m.tipo === 'fim'));

  const conversas = (await app.inject({ url: '/api/conversas', headers: { cookie } })).json();
  assert.equal(conversas.length, 1);
  assert.equal(conversas[0].modelo, 'opus', 'pedido de site escolhe o Opus');
  assert.equal(conversas[0].modeloAuto, true);
  assert.equal(conversas[0].sessaoClaude, 'sessao-falsa-1');

  const detalhe = (await app.inject({ url: `/api/conversas/${conversas[0].id}`, headers: { cookie } })).json();
  assert.equal(detalhe.mensagens.length, 2);
  assert.equal(detalhe.mensagens[0].papel, 'eu');
  const resposta = detalhe.mensagens[1].conteudo;
  assert.equal(resposta[0].tipo, 'texto');
  assert.match(resposta[0].texto, /^ola true sessao-falsa-1/);
  assert.ok(!resposta[0].texto.includes('<progresso>'), 'o bloco de progresso fica escondido');

  const prog = (await app.inject({ url: `/api/progresso?conversa=${conversas[0].id}`, headers: { cookie } })).json();
  assert.deepEqual(prog.map((p: any) => [p.texto, p.estado, p.origem]), [['responder', 'feito', 'ia']]);

  const uso = (await app.inject({ url: '/api/uso', headers: { cookie } })).json();
  assert.equal(uso.cincoHoras, 50);

  // segunda mensagem retoma a mesma sessao e nao troca o modelo
  recebidos.length = 0;
  ws.send(JSON.stringify({ tipo: 'enviar', conversa: conversas[0].id, texto: 'e agora?', modelo: 'auto' }));
  await esperar(() => recebidos.some((m) => m.tipo === 'fim'));
  const depois = (await app.inject({ url: `/api/conversas/${conversas[0].id}`, headers: { cookie } })).json();
  assert.equal(depois.mensagens.length, 4);
  assert.equal(depois.conversa.modelo, 'opus');

  // busca acha pelo texto
  const achou = (await app.inject({ url: '/api/busca?q=site%20simples', headers: { cookie } })).json();
  assert.equal(achou[0].conversaId, conversas[0].id);

  ws.close();
  await app.close();
  rmSync(pasta, { recursive: true, force: true });
});

test('conversa: erro do motor aparece como bloco de erro', async () => {
  const { app, pasta } = await montar();
  const cookie = await entrar(app);
  const ws = await app.injectWS('/api/ws', { headers: { cookie } });
  const recebidos: any[] = [];
  ws.on('message', (d: Buffer) => recebidos.push(JSON.parse(d.toString())));
  ws.send(JSON.stringify({ tipo: 'enviar', texto: 'quebrar tudo', modelo: 'sonnet' }));
  await esperar(() => recebidos.some((m) => m.tipo === 'fim'));
  assert.equal(recebidos.find((m) => m.tipo === 'fim').erro, true);
  const id = (await app.inject({ url: '/api/conversas', headers: { cookie } })).json()[0].id;
  const det = (await app.inject({ url: `/api/conversas/${id}`, headers: { cookie } })).json();
  assert.equal(det.mensagens[1].conteudo[0].tipo, 'erro');
  assert.equal(det.conversa.modelo, 'sonnet');
  ws.close();
  await app.close();
  rmSync(pasta, { recursive: true, force: true });
});

test('permissao: pedido negado vira pergunta; "pode sempre" guarda a regra na conversa', async () => {
  const { app, pasta } = await montar();
  const cookie = await entrar(app);
  const ws = await app.injectWS('/api/ws', { headers: { cookie } });
  const recebidos: any[] = [];
  ws.on('message', (d: Buffer) => recebidos.push(JSON.parse(d.toString())));
  ws.send(JSON.stringify({ tipo: 'enviar', texto: 'quero apagar o arquivo', modelo: 'sonnet' }));
  await esperar(() => recebidos.some((m) => m.tipo === 'fim'));
  const id = (await app.inject({ url: '/api/conversas', headers: { cookie } })).json()[0].id;
  let det = (await app.inject({ url: `/api/conversas/${id}`, headers: { cookie } })).json();
  const msgIa = det.mensagens[1];
  const idx = msgIa.conteudo.findIndex((b: any) => b.tipo === 'permissao');
  assert.ok(idx >= 0);
  assert.equal(msgIa.conteudo[idx].negadas[0].categoria, 'apagar');

  recebidos.length = 0;
  ws.send(JSON.stringify({ tipo: 'permissao', conversa: id, mensagem: msgIa.id, indiceBloco: idx, resposta: 'sempre' }));
  await esperar(() => recebidos.some((m) => m.tipo === 'fim'));
  det = (await app.inject({ url: `/api/conversas/${id}`, headers: { cookie } })).json();
  assert.deepEqual(det.conversa.liberadas, ['cat:apagar']);
  assert.equal(det.mensagens[1].conteudo[idx].respondida, 'sempre');
  ws.close();
  await app.close();
  rmSync(pasta, { recursive: true, force: true });
});

test('projetos: conversa dentro de um projeto roda na pasta dele; progresso do joao nao e apagado pela IA', async () => {
  const { app, pasta } = await montar();
  const cookie = await entrar(app);
  const h = { cookie };
  assert.equal((await app.inject({ method: 'POST', url: '/api/projetos', headers: h, payload: { nome: 'x', pasta: join(pasta, 'nao-existe') } })).statusCode, 400);
  const proj = (await app.inject({ method: 'POST', url: '/api/projetos', headers: h, payload: { nome: 'Site da Loja' } })).json();
  assert.ok(existsSync(proj.pasta));
  assert.match(proj.pasta, /site-da-loja$/);

  const ws = await app.injectWS('/api/ws', { headers: h });
  const recebidos: any[] = [];
  ws.on('message', (d: Buffer) => recebidos.push(JSON.parse(d.toString())));
  ws.send(JSON.stringify({ tipo: 'enviar', projeto: proj.id, texto: 'oi', modelo: 'haiku' }));
  await esperar(() => recebidos.some((m) => m.tipo === 'fim'));
  const conv = (await app.inject({ url: '/api/conversas', headers: h })).json()[0];
  assert.equal(conv.projetoId, proj.id);

  // item do joao + item da IA
  await app.inject({ method: 'POST', url: '/api/progresso', headers: h, payload: { conversa: conv.id, texto: 'minha tarefa' } });
  recebidos.length = 0;
  ws.send(JSON.stringify({ tipo: 'enviar', conversa: conv.id, texto: 'de novo' }));
  await esperar(() => recebidos.some((m) => m.tipo === 'fim'));
  const itens = (await app.inject({ url: `/api/progresso?conversa=${conv.id}`, headers: h })).json();
  assert.ok(itens.some((i: any) => i.texto === 'minha tarefa' && i.origem === 'voce'));
  assert.ok(itens.some((i: any) => i.texto === 'responder' && i.origem === 'ia'));
  // visao de projeto junta as conversas do projeto
  const doProjeto = (await app.inject({ url: `/api/progresso?projeto=${proj.id}`, headers: h })).json();
  assert.equal(doProjeto.length, itens.length);

  ws.close();
  await app.close();
  rmSync(pasta, { recursive: true, force: true });
});

test('anexos: grava o arquivo em dados/anexos e devolve o caminho', async () => {
  const { app, pasta } = await montar();
  const cookie = await entrar(app);
  const r = await app.inject({ method: 'POST', url: '/api/anexos?nome=../../relatorio.pdf', headers: { cookie, 'content-type': 'application/octet-stream' }, payload: Buffer.from('%PDF-1.4') });
  assert.equal(r.statusCode, 200);
  const corpo = r.json();
  assert.equal(corpo.tipo, 'pdf');
  assert.ok(existsSync(corpo.caminho));
  assert.ok(corpo.caminho.includes('anexos'));
  assert.ok(!corpo.caminho.includes('..'));
  await app.close();
  rmSync(pasta, { recursive: true, force: true });
});

test('repo: sincronizar progresso da IA mantem itens iguais, troca estado e remove os que sumiram', () => {
  const repo = new Repo(abrirBanco(':memory:'));
  const c = repo.criarConversa({});
  repo.sincronizarProgressoIa(c.id, [
    { texto: 'a', estado: 'fazendo' },
    { texto: 'b', estado: 'afazer' },
  ]);
  repo.adicionarItem({ conversaId: c.id, texto: 'do joao', origem: 'voce' });
  repo.sincronizarProgressoIa(c.id, [
    { texto: 'a', estado: 'feito' },
    { texto: 'c', estado: 'afazer' },
  ]);
  const lista = repo.listarProgresso({ conversaId: c.id });
  assert.deepEqual(
    lista.map((i) => [i.texto, i.estado]).sort(),
    [['a', 'feito'], ['c', 'afazer'], ['do joao', 'afazer']],
  );
});
