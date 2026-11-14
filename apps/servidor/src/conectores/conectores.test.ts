// Testes unitarios da etapa 6: lista do `claude mcp list`, conectores (token, mcp.json, regras por modo),
// teste de token com API de mentira, git do painel do dia e leitura da agenda.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { abrirBanco } from '../db.js';
import { estadoGit, lerEventosAgenda } from '../dia/dia.js';
import { classificarNegada } from '../ia/permissoes.js';
import { montarArgsClaude } from '../ia/claude.js';
import type { OpcoesTurno } from '../ia/tipos.js';
import { Repo } from '../repo.js';
import { prefixoMcp } from './catalogo.js';
import { Conectores, lerListaMcp, tokenValido } from './conectores.js';

const LISTA = `Checking MCP server health…

claude.ai Claude Docs: https://api.anthropic.com/v1/pages/mcp - ✔ Connected
claude.ai Google Docs: https://docsmcp.googleapis.com/mcp/v1 - ✔ Connected
claude.ai Google Drive: https://drivemcp.googleapis.com/mcp/v1 - ✔ Connected
claude.ai Google Calendar: https://calendarmcp.googleapis.com/mcp/v1 - ! Needs authentication
plugin:vercel:vercel: https://mcp.vercel.com (HTTP) - ! Needs authentication
meu-servidor: node servidor.js --porta 1 - ✗ Failed to connect
`;

const APIS = { github: 'http://gh.teste', supabase: 'http://sb.teste', cloudflare: 'http://cf.teste' };

function pastaTemp() {
  return mkdtempSync(join(tmpdir(), 'hrzz-conectores-'));
}

function conectoresNovos(opcoes: { buscar?: typeof fetch; claudeBin?: string } = {}) {
  const pasta = pastaTemp();
  const c = new Conectores(join(pasta, 'segredos'), { claudeBin: opcoes.claudeBin ?? 'nao-existe', apis: APIS, buscar: opcoes.buscar });
  return { c, pasta, limpar: () => rmSync(pasta, { recursive: true, force: true }) };
}

// deixa o conector "detectado" sem rodar o claude: grava o cache que a classe le ao iniciar
function comDeteccao(pasta: string, texto: string) {
  mkdirSync(join(pasta, 'segredos'), { recursive: true });
  writeFileSync(join(pasta, 'segredos', 'conectores-detectados.json'), JSON.stringify({ quando: Date.now(), servidores: lerListaMcp(texto) }));
}

test('lista do claude mcp list: nomes com ":" e espacos, e os tres estados', () => {
  const l = lerListaMcp(LISTA);
  assert.equal(l.length, 6);
  assert.deepEqual(l[1], { nome: 'claude.ai Google Docs', url: 'https://docsmcp.googleapis.com/mcp/v1', estado: 'conectado', detalhe: 'Connected' });
  assert.equal(l[3].estado, 'precisa-login');
  assert.equal(l[4].nome, 'plugin:vercel:vercel');
  assert.equal(l[4].estado, 'precisa-login');
  assert.equal(l[5].estado, 'falhou');
  assert.deepEqual(lerListaMcp('Checking MCP server health…\n\nNo MCP servers configured.'), []);
});

test('prefixo das ferramentas MCP segue o nome do servidor', () => {
  assert.equal(prefixoMcp('claude.ai Google Drive'), 'mcp__claude_ai_Google_Drive');
  assert.equal(prefixoMcp('plugin:vercel:vercel'), 'mcp__plugin_vercel_vercel');
  assert.equal(prefixoMcp('hrzz-github'), 'mcp__hrzz-github');
});

test('token: aceita so texto sem espaco, de 8 a 400 caracteres', () => {
  assert.equal(tokenValido('ghp_abcdefgh1234'), true);
  assert.equal(tokenValido('curto'), false);
  assert.equal(tokenValido('com espaco aqui 123'), false);
  assert.equal(tokenValido('linha\nnova12345'), false);
  assert.equal(tokenValido(42), false);
});

test('conectores: salvar token gera o mcp.json; a tela nunca recebe o token inteiro', () => {
  const { c, pasta, limpar } = conectoresNovos();
  try {
    const mcp = join(pasta, 'segredos', 'mcp.json');
    assert.deepEqual(JSON.parse(readFileSync(mcp, 'utf8')), { mcpServers: {} });
    const v = c.mudar('github', { token: 'ghp_segredo_12345678' });
    assert.equal(v.temToken, true);
    assert.equal(v.tokenFim, '••••5678');
    assert.ok(!JSON.stringify(c.listar()).includes('ghp_segredo'));
    const cfg = JSON.parse(readFileSync(mcp, 'utf8'));
    assert.equal(cfg.mcpServers['hrzz-github'].type, 'http');
    assert.equal(cfg.mcpServers['hrzz-github'].headers.Authorization, 'Bearer ghp_segredo_12345678');
    // somente leitura vem ligado e usa a url /readonly
    assert.equal(cfg.mcpServers['hrzz-github'].url, 'https://api.githubcopilot.com/mcp/readonly');
    c.mudar('github', { somenteLeitura: false });
    assert.equal(JSON.parse(readFileSync(mcp, 'utf8')).mcpServers['hrzz-github'].url, 'https://api.githubcopilot.com/mcp/');
    // desligar ou apagar o token tira do mcp.json
    c.mudar('github', { ligado: false });
    assert.deepEqual(JSON.parse(readFileSync(mcp, 'utf8')).mcpServers, {});
    c.mudar('github', { ligado: true });
    c.mudar('github', { token: '' });
    assert.deepEqual(JSON.parse(readFileSync(mcp, 'utf8')).mcpServers, {});
    assert.equal(c.listar().find((x) => x.id === 'github')!.temToken, false);
    if (process.platform !== 'win32') assert.equal(statSync(mcp).mode & 0o777, 0o600);
  } finally {
    limpar();
  }
});

test('conectores: entradas invalidas sao recusadas', () => {
  const { c, limpar } = conectoresNovos();
  try {
    assert.throws(() => c.mudar('nao-existe', {}), /desconhecido/);
    assert.throws(() => c.mudar('github', { token: 'com espaco 12345' }), /token inválido/);
    assert.throws(() => c.mudar('google-drive', { token: 'abcdefgh12345' }), /login do próprio claude/);
    assert.throws(() => c.mudar('github', { acesso: 'tanto-faz' }), /acesso inválido/);
    assert.throws(() => c.mudar('cloudflare', { somenteLeitura: true }), /somente leitura/);
  } finally {
    limpar();
  }
});

test('conectores: o arquivo de estado e lido de novo ao reiniciar', () => {
  const { c, pasta, limpar } = conectoresNovos();
  try {
    c.mudar('supabase', { token: 'sbp_token_12345678', acesso: 'livre' });
    const outra = new Conectores(join(pasta, 'segredos'), { claudeBin: 'x', apis: APIS });
    const v = outra.listar().find((x) => x.id === 'supabase')!;
    assert.equal(v.temToken, true);
    assert.equal(v.acesso, 'livre');
    assert.equal(v.somenteLeitura, true);
  } finally {
    limpar();
  }
});

test('regras por modo: yolo libera tudo; mid e intern so o que esta como "livre"', () => {
  const { c, limpar } = conectoresNovos();
  try {
    c.mudar('github', { token: 'ghp_segredo_12345678' });
    c.mudar('cloudflare', { token: 'cf_segredo_12345678', acesso: 'livre' });
    const mid = c.paraTurno('mid', false);
    assert.deepEqual(mid.permitidas, ['mcp__hrzz-cloudflare']);
    assert.ok(mid.mcpConfig?.endsWith('mcp.json'));
    assert.equal(mid.estrito, false);
    assert.match(mid.instrucoes ?? '', /GitHub, Cloudflare/);
    assert.deepEqual(c.paraTurno('intern', false).permitidas, ['mcp__hrzz-cloudflare']);
    assert.deepEqual(c.paraTurno('yolo', false).permitidas.sort(), ['mcp__hrzz-cloudflare', 'mcp__hrzz-github']);
    // pela Cloudflare nenhum conector vale e o claude ignora os que ele mesmo conhece
    const restrito = c.paraTurno('yolo', true);
    assert.deepEqual(restrito, { permitidas: [], bloqueadas: [], estrito: true });
  } finally {
    limpar();
  }
});

test('regras por modo: conectores da conta usam o nome que o claude listou; desligado vira bloqueio', () => {
  const pasta = pastaTemp();
  try {
    comDeteccao(pasta, LISTA);
    const c = new Conectores(join(pasta, 'segredos'), { claudeBin: 'x', apis: APIS });
    const lista = c.listar();
    assert.equal(lista.find((x) => x.id === 'google-drive')!.status, 'conectado');
    assert.equal(lista.find((x) => x.id === 'google-drive')!.servidor, 'claude.ai Google Drive');
    assert.equal(lista.find((x) => x.id === 'google-calendar')!.status, 'precisa-login');
    assert.equal(lista.find((x) => x.id === 'vercel')!.status, 'precisa-login');
    assert.equal(lista.find((x) => x.id === 'gmail')!.status, 'nao-encontrado');
    assert.equal(c.servidorDe('google-docs')?.nome, 'claude.ai Google Docs');
    // padrao: pergunta. Drive livre libera so o Drive. Docs desligado entra nas bloqueadas
    assert.deepEqual(c.paraTurno('mid', false).permitidas, []);
    c.mudar('google-drive', { acesso: 'livre' });
    c.mudar('google-docs', { ligado: false });
    const mid = c.paraTurno('mid', false);
    assert.deepEqual(mid.permitidas, ['mcp__claude_ai_Google_Drive']);
    assert.deepEqual(mid.bloqueadas, ['mcp__claude_ai_Google_Docs']);
    assert.ok(!mid.mcpConfig, 'sem conector de token nao ha mcp.json pra passar');
    assert.ok(mid.permitidas.every((r) => !r.includes('Docs')));
    // yolo libera os que estao ligados e conectados (e a agenda/Vercel, que o claude lista mesmo sem login)
    assert.ok(c.paraTurno('yolo', false).permitidas.includes('mcp__claude_ai_Google_Drive'));
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('argumentos do claude: varios --mcp-config, estrito e regras dos conectores', () => {
  const base: OpcoesTurno = {
    motor: 'claude', mensagem: 'oi', cwd: '.', esforco: 1, pensar: 1, web: true, modo: 'mid', restrito: false,
    promptSistema: 'x', pastasExtras: [], liberadas: [],
  };
  const args = montarArgsClaude({ ...base, mcpConfig: 'dueto.json', mcpExtras: ['mcp.json'], permitidasExtra: ['mcp__hrzz-github'], bloqueadasExtra: ['mcp__claude_ai_Google_Docs'] });
  const i = args.indexOf('--mcp-config');
  assert.deepEqual(args.slice(i + 1, i + 3), ['dueto.json', 'mcp.json']);
  assert.ok(!args.includes('--strict-mcp-config'));
  assert.ok(args[args.indexOf('--allowedTools') + 1] !== undefined && args.includes('mcp__hrzz-github'));
  assert.ok(args.includes('mcp__claude_ai_Google_Docs'));
  const estrito = montarArgsClaude({ ...base, mcpExtras: [], mcpEstrito: true, restrito: true });
  assert.ok(estrito.includes('--strict-mcp-config'));
  assert.ok(!estrito.includes('--mcp-config'));
});

test('negativa de ferramenta de conector vira pergunta que libera o servidor inteiro', () => {
  const n = classificarNegada('mcp__hrzz-github__create_issue', { title: 'x' }, '.');
  assert.equal(n.categoria, 'conector');
  assert.equal(n.regra, 'mcp__hrzz-github');
  assert.match(n.resumo, /github: create issue/);
  const g = classificarNegada('mcp__claude_ai_Google_Drive__search_files', {}, '.');
  assert.equal(g.regra, 'mcp__claude_ai_Google_Drive');
  // a ferramenta do dueto continua tratada fora desta regra
  assert.notEqual(classificarNegada('mcp__hrzz-gemini__pedir_ao_gemini', {}, '.').categoria, 'conector');
});

test('teste do token: GitHub, Supabase e Cloudflare com API de mentira', async () => {
  const chamadas: { url: string; auth: string | null }[] = [];
  const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
  const buscar = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    chamadas.push({ url: u, auth: new Headers(init?.headers).get('authorization') });
    if (u === 'http://gh.teste/user') return new Headers(init?.headers).get('authorization') === 'Bearer ghp_bom_12345678' ? resposta({ login: 'riizzi' }) : resposta({ message: 'Bad credentials' }, 401);
    if (u === 'http://sb.teste/v1/projects') return resposta([{ id: 'a' }, { id: 'b' }]);
    if (u === 'http://cf.teste/user/tokens/verify') return resposta({ result: { status: 'expired' } });
    throw new TypeError('sem rede');
  }) as typeof fetch;
  const { c, limpar } = conectoresNovos({ buscar });
  try {
    await assert.rejects(c.testar('github'), /salve um token/);
    c.mudar('github', { token: 'ghp_bom_12345678' });
    assert.deepEqual(await c.testar('github').then((r) => [r.ok, r.mensagem]), [true, 'conectado como riizzi']);
    assert.equal(c.listar().find((x) => x.id === 'github')!.status, 'ok');
    c.mudar('github', { token: 'ghp_ruim_12345678' });
    assert.equal(c.listar().find((x) => x.id === 'github')!.status, 'pronto', 'trocar o token zera o resultado do teste');
    const ruim = await c.testar('github');
    assert.equal(ruim.ok, false);
    assert.match(ruim.mensagem, /recusou o token/);
    c.mudar('supabase', { token: 'sbp_bom_12345678' });
    assert.equal((await c.testar('supabase')).mensagem, 'token válido, 2 projetos');
    c.mudar('cloudflare', { token: 'cf_bom_12345678' });
    assert.match((await c.testar('cloudflare')).mensagem, /expired/);
    await assert.rejects(c.testar('google-drive'), /só os conectores com token/);
    // o token vai so no cabecalho de quem tem a API, nunca na url
    assert.ok(chamadas.every((x) => !x.url.includes('segredo') && !x.url.includes('_bom_')));
  } finally {
    limpar();
  }
});

test('teste do token: sem internet vira mensagem simples', async () => {
  const { c, limpar } = conectoresNovos({ buscar: (async () => { throw new TypeError('fetch failed'); }) as typeof fetch });
  try {
    c.mudar('github', { token: 'ghp_bom_12345678' });
    const r = await c.testar('github');
    assert.equal(r.ok, false);
    assert.match(r.mensagem, /sem internet/);
  } finally {
    limpar();
  }
});

test('claude mcp list de verdade: programa que nao existe vira erro, sem derrubar', async () => {
  const { c, limpar } = conectoresNovos({ claudeBin: join(tmpdir(), 'nao-existe-hrzz-claude') });
  try {
    const d = await c.detectar(true);
    assert.ok(d.erro);
    assert.deepEqual(d.servidores, []);
  } finally {
    limpar();
  }
});

// ---------- painel do dia ----------
test('git do painel: ramo, alteracoes, a frente e atras', async () => {
  const pasta = pastaTemp();
  try {
    const g = (...a: string[]) => execFileSync('git', a, { cwd: pasta, stdio: 'pipe' });
    g('init', '-q', '-b', 'principal');
    g('config', 'user.email', 't@t');
    g('config', 'user.name', 't');
    assert.equal((await estadoGit(1, 'x', pasta)).ramo, 'principal');
    writeFileSync(join(pasta, 'a.txt'), '1');
    g('add', '.');
    g('commit', '-q', '-m', 'primeiro');
    writeFileSync(join(pasta, 'b.txt'), '2');
    writeFileSync(join(pasta, 'a.txt'), '3');
    const e = await estadoGit(1, 'x', pasta);
    assert.equal(e.git, true);
    assert.equal(e.ramo, 'principal');
    assert.equal(e.alteracoes, 2);
    assert.equal(e.semRemoto, true);
    assert.equal(e.ultimo?.assunto, 'primeiro');
    // com remoto: um commit a frente
    const remoto = pastaTemp();
    execFileSync('git', ['init', '-q', '--bare'], { cwd: remoto });
    g('remote', 'add', 'origin', remoto);
    g('push', '-q', '-u', 'origin', 'principal');
    g('commit', '-q', '-am', 'segundo');
    const f = await estadoGit(1, 'x', pasta);
    assert.equal(f.semRemoto, false);
    assert.equal(f.aFrente, 1);
    assert.equal(f.atras, 0);
    rmSync(remoto, { recursive: true, force: true });
    // pasta que sumiu e pasta sem git
    assert.deepEqual(await estadoGit(2, 'y', join(pasta, 'nao-existe')), { projetoId: 2, nome: 'y', existe: false, git: false });
    mkdirSync(join(pasta, 'sem-git'));
    const sem = await estadoGit(3, 'z', join(pasta, 'sem-git'));
    // dentro de outro repositorio o git ainda enxerga; so conferimos que nao quebra
    assert.equal(sem.existe, true);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('agenda: le o JSON mesmo com texto em volta, descarta evento quebrado e ordena', () => {
  const ev = lerEventosAgenda('Aqui esta:\n[{"inicio":"2026-11-14T14:00:00-03:00","titulo":"reuniao"},{"inicio":"2026-11-14T09:00:00-03:00","titulo":"cafe","local":"sala"},{"inicio":"lixo","titulo":"quebrado"},{"titulo":"sem hora"}]\nfim');
  assert.deepEqual(ev?.map((e) => e.titulo), ['cafe', 'reuniao']);
  assert.equal(ev?.[0].local, 'sala');
  assert.deepEqual(lerEventosAgenda('[]'), []);
  assert.equal(lerEventosAgenda('nao consegui'), null);
  assert.equal(lerEventosAgenda('[1, 2'), null);
});

test('pendencias do dia: itens abertos de conversas e projetos, os em andamento primeiro', () => {
  const repo = new Repo(abrirBanco(':memory:'));
  const projeto = repo.criarProjeto('site', tmpdir());
  const conv = repo.criarConversa({ projetoId: projeto.id, titulo: 'menu do celular' });
  repo.adicionarItem({ conversaId: conv.id, texto: 'conferir alvos', origem: 'ia', estado: 'afazer' });
  repo.adicionarItem({ conversaId: conv.id, texto: 'trocar menu', origem: 'ia', estado: 'fazendo' });
  repo.adicionarItem({ conversaId: conv.id, texto: 'ja feito', origem: 'ia', estado: 'feito' });
  repo.adicionarItem({ projetoId: projeto.id, texto: 'pedir foto da fachada', origem: 'voce', estado: 'afazer' });
  const p = repo.pendenciasAbertas();
  assert.deepEqual(p.map((x) => x.texto), ['trocar menu', 'pedir foto da fachada', 'conferir alvos']);
  assert.equal(p[0].conversaTitulo, 'menu do celular');
  assert.equal(p[0].projetoNome, 'site');
  assert.equal(p[1].conversaId, null);
  assert.equal(p[1].projetoNome, 'site');
  assert.ok(existsSync(tmpdir()));
});
