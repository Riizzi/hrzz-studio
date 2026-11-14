// Testes da etapa 6 sem a interface: sobe um HRZZ isolado (claude de mentira, GitHub de mentira) e confere
// conectores (token, mcp.json, regras por modo, cartao de permissao, caminho da Cloudflare) e o painel do dia.
//   npm run testar:conectores
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { conversarPeloWs, subirServidorDeTeste } from './lib-teste.mjs';

let falhas = 0;
function ok(nome, cond, detalhe = '') {
  if (cond) console.log(`  [ok] ${nome}`);
  else {
    console.log(`  [--] ${nome}${detalhe ? ': ' + detalhe : ''}`);
    falhas++;
  }
}

const TOKEN = 'ghp_token_de_teste_987654';
const CLOUDFLARE = { 'cf-access-authenticated-user-email': 'joao@exemplo.com' };

// ---------- GitHub de mentira ----------
const pedidosGithub = [];
const github = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  pedidosGithub.push({ caminho: url.pathname, q: url.searchParams.get('q'), auth: req.headers.authorization });
  res.setHeader('content-type', 'application/json');
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ message: 'Bad credentials' }));
  }
  if (url.pathname === '/user') return res.end(JSON.stringify({ login: 'riizzi' }));
  if (url.pathname === '/search/issues') {
    const q = url.searchParams.get('q') ?? '';
    const item = (n, titulo, repo, quando) => ({ number: n, title: titulo, html_url: `https://github.com/${repo}/pull/${n}`, repository_url: `https://api.github.com/repos/${repo}`, updated_at: quando });
    if (q.includes('author:@me')) return res.end(JSON.stringify({ items: [item(7, 'menu do celular', 'Riizzi/bhzotica', '2026-11-13T10:00:00Z')] }));
    if (q.includes('review-requested')) return res.end(JSON.stringify({ items: [item(3, 'ajuste do contrato', 'amigo/api', '2026-11-14T08:00:00Z'), item(7, 'menu do celular', 'Riizzi/bhzotica', '2026-11-13T10:00:00Z')] }));
    return res.end(JSON.stringify({ items: [] }));
  }
  res.statusCode = 404;
  res.end('{}');
});
await new Promise((r) => github.listen(7198, '127.0.0.1', r));

// ---------- `claude mcp list` de mentira ----------
const pastaFalso = mkdtempSync(join(tmpdir(), 'hrzz-mcp-falso-'));
const listaMcp = join(pastaFalso, 'lista.txt');
const LISTA_SEM_AGENDA = `claude.ai Google Drive: https://drivemcp.googleapis.com/mcp/v1 - ✔ Connected
claude.ai Google Docs: https://docsmcp.googleapis.com/mcp/v1 - ✔ Connected
claude.ai Google Calendar: https://calendarmcp.googleapis.com/mcp/v1 - ! Needs authentication
plugin:vercel:vercel: https://mcp.vercel.com (HTTP) - ! Needs authentication`;
const LISTA_COM_AGENDA = LISTA_SEM_AGENDA.replace('! Needs authentication\nplugin', '✔ Connected\nplugin');
writeFileSync(listaMcp, LISTA_SEM_AGENDA);
process.env.HRZZ_FALSO_MCP = listaMcp;
process.env.HRZZ_API_GITHUB = 'http://127.0.0.1:7198';

const servidor = await subirServidorDeTeste({ porta: 7098 });
const api = (caminho, init = {}) =>
  fetch(servidor.url + caminho, { ...init, headers: { cookie: servidor.cabecalhoCookie, ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) } });
const json = async (caminho, init) => (await api(caminho, init)).json();
const enviar = (caminho, metodo, corpo, headers) => api(caminho, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo), headers });
const depoisDe = (args, flag) => {
  const i = args.indexOf(flag);
  if (i < 0) return [];
  const fim = args.findIndex((a, j) => j > i && a.startsWith('--'));
  return args.slice(i + 1, fim < 0 ? undefined : fim);
};
const ultima = () => servidor.chamadas().at(-1);

try {
  console.log('etapa 6: protecao');
  for (const caminho of ['/api/conectores', '/api/dia']) ok(`sem o cookie do PIN: 401 em ${caminho}`, (await fetch(servidor.url + caminho)).status === 401);
  for (const [metodo, caminho] of [['PUT', '/api/conectores/github'], ['POST', '/api/conectores/github/testar'], ['POST', '/api/conectores/detectar'], ['POST', '/api/dia/agenda/atualizar'], ['POST', '/api/dia/github']]) {
    ok(`sem o cookie do PIN: 401 em ${metodo} ${caminho}`, (await fetch(servidor.url + caminho, { method: metodo })).status === 401);
  }

  // ---------------------------------------------------------------------------------------------
  console.log('conectores: lista e deteccao do claude');
  const detectado = await (await enviar('/api/conectores/detectar', 'POST', {})).json();
  const por = (d, id) => d.conectores.find((c) => c.id === id);
  ok('a lista traz os 9 conectores', detectado.conectores.length === 9, String(detectado.conectores.length));
  ok('Drive e Docs aparecem como conectados', por(detectado, 'google-drive').status === 'conectado' && por(detectado, 'google-docs').status === 'conectado');
  ok('Agenda e Vercel pedem login', por(detectado, 'google-calendar').status === 'precisa-login' && por(detectado, 'vercel').status === 'precisa-login');
  ok('Gmail nao esta no claude', por(detectado, 'gmail').status === 'nao-encontrado');
  ok('a leitura do claude e guardada pro proximo turno', existsSync(join(servidor.pasta, 'segredos', 'conectores-detectados.json')));
  ok('GitHub, Cloudflare e Supabase comecam sem token', ['github', 'cloudflare', 'supabase'].every((id) => por(detectado, id).status === 'sem-token'));

  // ---------------------------------------------------------------------------------------------
  console.log('conectores: token do GitHub');
  const sem = await enviar('/api/conectores/github/testar', 'POST', {});
  ok('testar sem token: 400', sem.status === 400);
  const curto = await enviar('/api/conectores/github', 'PUT', { token: 'curto' });
  ok('token curto demais: 400', curto.status === 400);
  const salvo = await (await enviar('/api/conectores/github', 'PUT', { token: TOKEN })).json();
  ok('token salvo: a resposta mostra so o final', salvo.temToken === true && salvo.tokenFim === '••••7654' && !JSON.stringify(salvo).includes(TOKEN), JSON.stringify(salvo));
  ok('a lista nunca devolve o token inteiro', !JSON.stringify(await json('/api/conectores')).includes(TOKEN));
  const mcpJson = JSON.parse(readFileSync(join(servidor.pasta, 'segredos', 'mcp.json'), 'utf8'));
  ok('o mcp.json em dados/segredos tem o GitHub (somente leitura) com o token no cabecalho', mcpJson.mcpServers['hrzz-github']?.headers?.Authorization === `Bearer ${TOKEN}` && /readonly$/.test(mcpJson.mcpServers['hrzz-github'].url), JSON.stringify(mcpJson));
  const teste = await (await enviar('/api/conectores/github/testar', 'POST', {})).json();
  ok('testar fala com a API do GitHub e mostra o usuario', teste.ok === true && /riizzi/.test(teste.mensagem), JSON.stringify(teste));
  ok('o token vai no cabecalho Authorization, nunca na url', pedidosGithub.at(-1)?.auth === `Bearer ${TOKEN}` && pedidosGithub.every((p) => !p.caminho.includes('ghp_')));
  ok('depois do teste a tela mostra "ok"', por(teste, 'github').status === 'ok');
  await enviar('/api/conectores/github', 'PUT', { token: 'ghp_errado_de_teste_1' });
  const ruim = await (await enviar('/api/conectores/github/testar', 'POST', {})).json();
  ok('token errado: testar diz que o GitHub recusou', ruim.ok === false && /recusou/.test(ruim.mensagem), JSON.stringify(ruim));
  await enviar('/api/conectores/github', 'PUT', { token: TOKEN });

  // ---------------------------------------------------------------------------------------------
  console.log('conectores: o que cada turno do claude recebe');
  await conversarPeloWs(servidor, { texto: 'oi' });
  let args = ultima().args;
  ok('o turno leva --mcp-config com o mcp.json dos conectores', depoisDe(args, '--mcp-config').some((a) => a.endsWith('mcp.json')), JSON.stringify(depoisDe(args, '--mcp-config')));
  ok('"pergunta antes" (padrao): nada de conector na lista de liberados', !depoisDe(args, '--allowedTools').some((r) => r.startsWith('mcp__')), JSON.stringify(depoisDe(args, '--allowedTools')));
  ok('o prompt de fundo cita o GitHub ligado', servidor.chamadas().at(-1).prompt !== undefined && args.join(' ').includes('Conectores ligados no HRZZ: GitHub'));
  ok('sem --strict-mcp-config no caminho normal', !args.includes('--strict-mcp-config'));

  await enviar('/api/conectores/github', 'PUT', { acesso: 'livre' });
  await conversarPeloWs(servidor, { texto: 'oi de novo' });
  ok('GitHub "livre": o servidor inteiro entra nos liberados', depoisDe(ultima().args, '--allowedTools').includes('mcp__hrzz-github'));

  await enviar('/api/conectores/github', 'PUT', { acesso: 'perguntar' });
  await enviar('/api/conectores/google-drive', 'PUT', { acesso: 'livre' });
  await enviar('/api/conectores/google-docs', 'PUT', { ligado: false });
  await conversarPeloWs(servidor, { texto: 'e agora?' });
  args = ultima().args;
  ok('Drive "livre": entra com o nome que o claude listou (claude_ai_Google_Drive)', depoisDe(args, '--allowedTools').includes('mcp__claude_ai_Google_Drive'));
  ok('Docs desligado: entra nas ferramentas bloqueadas', depoisDe(args, '--disallowedTools').includes('mcp__claude_ai_Google_Docs'));
  ok('Docs desligado: nao esta nos liberados', !depoisDe(args, '--allowedTools').includes('mcp__claude_ai_Google_Docs'));

  await conversarPeloWs(servidor, { texto: 'modo yolo', modo: 'yolo' });
  ok('modo Yolo libera o GitHub mesmo em "pergunta antes"', depoisDe(ultima().args, '--allowedTools').includes('mcp__hrzz-github'));

  await enviar('/api/conectores/github', 'PUT', { ligado: false });
  await conversarPeloWs(servidor, { texto: 'github desligado' });
  ok('GitHub desligado: sai do mcp.json e do --mcp-config', !JSON.parse(readFileSync(join(servidor.pasta, 'segredos', 'mcp.json'), 'utf8')).mcpServers['hrzz-github'] && !ultima().args.includes('--mcp-config'));
  await enviar('/api/conectores/github', 'PUT', { ligado: true });

  // ---------------------------------------------------------------------------------------------
  console.log('conectores: negativa vira cartao de permissao');
  const neg = await conversarPeloWs(servidor, { texto: 'conector-teste abrir uma issue' });
  const conv = await json(`/api/conversas/${neg.conversa}`);
  const msgIa = conv.mensagens.filter((m) => m.papel === 'ia').at(-1);
  const indice = msgIa.conteudo.findIndex((b) => b.tipo === 'permissao');
  const cartao = msgIa.conteudo[indice];
  ok('a ferramenta negada do GitHub vira cartao', !!cartao && cartao.negadas[0].categoria === 'conector', JSON.stringify(cartao));
  ok('o cartao libera o servidor inteiro e fala em linguagem simples', cartao?.negadas[0].regra === 'mcp__hrzz-github' && /github: create issue/.test(cartao.negadas[0].resumo), JSON.stringify(cartao?.negadas));
  {
    const { default: WebSocket } = await import('ws');
    const ws = new WebSocket(servidor.url.replace('http', 'ws') + '/api/ws', { headers: { cookie: servidor.cabecalhoCookie } });
    await new Promise((res, rej) => (ws.on('open', res), ws.on('error', rej)));
    const fim = new Promise((res) => ws.on('message', (d) => JSON.parse(d.toString()).tipo === 'fim' && res(null)));
    ws.send(JSON.stringify({ tipo: 'permissao', conversa: neg.conversa, mensagem: msgIa.id, indiceBloco: indice, resposta: 'sempre' }));
    await Promise.race([fim, new Promise((r) => setTimeout(r, 8000))]);
    ws.close();
  }
  ok('"pode sempre": a conversa passa a liberar o GitHub', depoisDe(ultima().args, '--allowedTools').includes('mcp__hrzz-github'), JSON.stringify(depoisDe(ultima().args, '--allowedTools')));

  // ---------------------------------------------------------------------------------------------
  console.log('conectores: pelo caminho da Cloudflare');
  const bloqueado = await json('/api/conectores', { headers: CLOUDFLARE });
  ok('a lista mostra, avisando que esta bloqueado', bloqueado.bloqueado === true && bloqueado.conectores.length === 9);
  ok('mudar conector: 403', (await enviar('/api/conectores/github', 'PUT', { ligado: false }, CLOUDFLARE)).status === 403);
  ok('testar token: 403', (await enviar('/api/conectores/github/testar', 'POST', {}, CLOUDFLARE)).status === 403);
  ok('consultar a agenda: 403', (await enviar('/api/dia/agenda/atualizar', 'POST', {}, CLOUDFLARE)).status === 403);
  {
    const { default: WebSocket } = await import('ws');
    const ws = new WebSocket(servidor.url.replace('http', 'ws') + '/api/ws', { headers: { cookie: servidor.cabecalhoCookie, ...CLOUDFLARE } });
    await new Promise((res, rej) => (ws.on('open', res), ws.on('error', rej)));
    const fim = new Promise((res) => ws.on('message', (d) => ['fim', 'erro'].includes(JSON.parse(d.toString()).tipo) && res(null)));
    ws.send(JSON.stringify({ tipo: 'enviar', modo: 'yolo', modelo: 'auto', texto: 'pela cloudflare' }));
    await Promise.race([fim, new Promise((r) => setTimeout(r, 8000))]);
    ws.close();
  }
  args = ultima().args;
  ok('conversa pela Cloudflare: --restricted e --strict-mcp-config', args.includes('--restricted') && args.includes('--strict-mcp-config'), JSON.stringify(args.slice(0, 40)));
  ok('conversa pela Cloudflare: nenhum conector no turno', !args.includes('--mcp-config') && !depoisDe(args, '--allowedTools').some((r) => r.startsWith('mcp__')));

  // ---------------------------------------------------------------------------------------------
  console.log('painel do dia');
  // um projeto com git de verdade: uma alteracao solta
  const pastaGit = join(servidor.pasta, 'projeto-git');
  mkdirSync(pastaGit, { recursive: true });
  const g = (...a) => execFileSync('git', a, { cwd: pastaGit, stdio: 'pipe' });
  g('init', '-q', '-b', 'principal');
  g('config', 'user.email', 't@t');
  g('config', 'user.name', 't');
  writeFileSync(join(pastaGit, 'a.txt'), '1');
  g('add', '.');
  g('commit', '-q', '-m', 'primeiro commit');
  writeFileSync(join(pastaGit, 'b.txt'), '2');
  const projeto = await json('/api/projetos', { method: 'POST', body: JSON.stringify({ nome: 'site de teste', pasta: pastaGit }) });
  await conversarPeloWs(servidor, { texto: 'preciso de ajuda com o menu', projeto: projeto.id });

  const dia = await json('/api/dia');
  ok('uso: o Claude aparece com 42% na janela de 5 h', dia.uso.cincoHoras === 42 && dia.uso.nivel === 'ok', JSON.stringify(dia.uso));
  ok('pendencias: itens abertos da conversa (sem os feitos), com o titulo da conversa', dia.pendencias.length >= 2 && dia.pendencias.every((p) => p.estado !== 'feito') && dia.pendencias.some((p) => p.conversaId && p.conversaTitulo), JSON.stringify(dia.pendencias.slice(0, 2)));
  const repoDia = dia.repositorios.find((r) => r.nome === 'site de teste');
  ok('repositorios: ramo, 1 alteracao e o ultimo commit', repoDia?.git && repoDia.ramo === 'principal' && repoDia.alteracoes === 1 && repoDia.ultimo?.assunto === 'primeiro commit', JSON.stringify(repoDia));
  ok('repositorios: projeto sem git (o de exemplo do teste) nao quebra o painel', Array.isArray(dia.repositorios));
  ok('GitHub: junta PRs e revisoes sem repetir, do mais novo pro mais velho', dia.github.ligado && dia.github.itens.length === 2 && dia.github.itens[0].repo === 'amigo/api' && dia.github.itens[0].tipo === 'revisar', JSON.stringify(dia.github));
  ok('GitHub: o painel pede so o que e do proprio usuario (@me)', pedidosGithub.filter((p) => p.q).every((p) => p.q.includes('@me')));
  const antes = pedidosGithub.length;
  await json('/api/dia');
  ok('GitHub: segunda leitura usa o cache (nao chama de novo)', pedidosGithub.length === antes);
  await enviar('/api/conectores/github', 'PUT', { token: 'ghp_errado_de_teste_2' });
  const comTokenRuim = await (await enviar('/api/dia/github', 'POST', {})).json();
  ok('GitHub: token recusado vira aviso, nao erro 500', /recusou/.test(comTokenRuim.erro ?? ''), JSON.stringify(comTokenRuim));
  await enviar('/api/conectores/github', 'PUT', { token: '' });
  ok('GitHub sem token: painel diz que nao esta ligado', (await json('/api/dia')).github.ligado === false);

  // agenda
  const semAgenda = (await json('/api/dia')).agenda;
  ok('agenda: sem login no Google Agenda, avisa o motivo', semAgenda.disponivel === false && /login/.test(semAgenda.motivo), JSON.stringify(semAgenda));
  writeFileSync(listaMcp, LISTA_COM_AGENDA);
  await enviar('/api/conectores/detectar', 'POST', {});
  const comAgenda = (await json('/api/dia')).agenda;
  ok('agenda: conectada, fica disponivel e ainda sem busca', comAgenda.disponivel === true && comAgenda.eventos.length === 0 && !comAgenda.quando, JSON.stringify(comAgenda));
  const antesAgenda = servidor.chamadas().length;
  const buscada = await (await enviar('/api/dia/agenda/atualizar', 'POST', {})).json();
  ok('agenda: busca 2 eventos validos e descarta o quebrado, em ordem', buscada.eventos?.length === 2 && buscada.eventos[0].titulo === 'cafe com o cliente' && buscada.eventos[1].local === 'sala 2', JSON.stringify(buscada));
  const chamadaAgenda = servidor.chamadas().at(-1);
  ok('agenda: foi uma chamada so, no Haiku, no modo que pergunta tudo', servidor.chamadas().length === antesAgenda + 1 && depoisDe(chamadaAgenda.args, '--model')[0] === 'haiku' && depoisDe(chamadaAgenda.args, '--permission-mode')[0] === 'manual', JSON.stringify(chamadaAgenda.args.slice(0, 30)));
  ok('agenda: so a ferramenta da agenda esta liberada (nada de Bash, nem os outros conectores)', JSON.stringify(depoisDe(chamadaAgenda.args, '--allowedTools')) === JSON.stringify(['mcp__claude_ai_Google_Calendar']), JSON.stringify(depoisDe(chamadaAgenda.args, '--allowedTools')));
  ok('agenda: sem pesquisa na web', chamadaAgenda.args.includes('WebSearch'));
  ok('agenda: a busca fica guardada pro proximo carregamento', (await json('/api/dia')).agenda.eventos.length === 2);
  writeFileSync(listaMcp + '.torta', '1');
  const torta = await (await enviar('/api/dia/agenda/atualizar', 'POST', {})).json();
  ok('agenda: resposta que nao e JSON vira aviso e mantem a ultima busca boa', /formato/.test(torta.erro ?? '') && torta.eventos.length === 2, JSON.stringify(torta));
  rmSync(listaMcp + '.torta');
  await enviar('/api/conectores/google-calendar', 'PUT', { ligado: false });
  const desligada = await (await enviar('/api/dia/agenda/atualizar', 'POST', {})).json();
  ok('agenda: conector desligado nao chama o claude', desligada.disponivel === false && /desligado/.test(desligada.motivo), JSON.stringify(desligada));
} finally {
  await servidor.parar();
  await new Promise((r) => github.close(r));
  rmSync(pastaFalso, { recursive: true, force: true });
}

console.log(falhas === 0 ? '\ntudo certo' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
