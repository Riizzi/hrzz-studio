// Testes da etapa 5 (IA junta) sem a interface: sobe um HRZZ isolado com o claude e o agy de mentira e confere
// guardiao de cota, dueto (servidor MCP de verdade), duelo (copias separadas), fila, agendamentos e auditoria.
//   npm run testar:ia-junta
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

const servidor = await subirServidorDeTeste({ porta: 7096, agyFalso: true });
const api = (caminho, init = {}) =>
  fetch(servidor.url + caminho, { ...init, headers: { cookie: servidor.cabecalhoCookie, ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) } });
const json = async (caminho, init) => (await api(caminho, init)).json();
const post = (caminho, corpo, headers) => api(caminho, { method: 'POST', body: JSON.stringify(corpo ?? {}), headers });
const valorDe = (args, flag) => args[args.indexOf(flag) + 1];
const depoisDe = (args, flag) => {
  const i = args.indexOf(flag);
  if (i < 0) return [];
  const fim = args.findIndex((a, j) => j > i && a.startsWith('--'));
  return args.slice(i + 1, fim < 0 ? undefined : fim);
};
const ultimaChamada = () => servidor.chamadas().at(-1);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function ate(cond, limiteMs = 20000, passo = 150) {
  const ini = Date.now();
  for (;;) {
    const v = await cond();
    if (v) return v;
    if (Date.now() - ini > limiteMs) return null;
    await espera(passo);
  }
}
// manda uma mensagem pelo WebSocket e devolve o primeiro erro (ou null se a conversa rodou normalmente)
async function enviarEErro(mensagem, cabecalhos = {}) {
  const { default: WebSocket } = await import('ws');
  const ws = new WebSocket(servidor.url.replace('http', 'ws') + '/api/ws', { headers: { cookie: servidor.cabecalhoCookie, ...cabecalhos } });
  await new Promise((res, rej) => (ws.on('open', res), ws.on('error', rej)));
  const r = await new Promise((res) => {
    const t = setTimeout(() => res(null), 6000);
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.tipo === 'erro') (clearTimeout(t), res(m.mensagem));
      if (m.tipo === 'fim') (clearTimeout(t), res(null));
    });
    ws.send(JSON.stringify({ tipo: 'enviar', modo: 'mid', modelo: 'auto', ...mensagem }));
  });
  ws.close();
  return r;
}
async function criarProjeto(nome, arquivos) {
  const pasta = join(servidor.pasta, 'p-' + nome.replace(/\W/g, '-'));
  mkdirSync(pasta, { recursive: true });
  for (const [arq, conteudo] of Object.entries(arquivos)) writeFileSync(join(pasta, arq), conteudo);
  const projeto = await json('/api/projetos', { method: 'POST', body: JSON.stringify({ nome, pasta }) });
  return { projeto, pasta };
}
const ultimaIa = async (conversa) => {
  const d = await json(`/api/conversas/${conversa}`);
  return d.mensagens.filter((m) => m.papel === 'ia').at(-1)?.conteudo ?? [];
};

try {
  console.log('etapa 5: protecao');
  for (const caminho of ['/api/uso', '/api/tarefas', '/api/agendamentos', '/api/dueto/ajustes']) {
    ok(`sem o cookie do PIN: 401 em ${caminho}`, (await fetch(servidor.url + caminho)).status === 401);
  }
  ok('sem o cookie do PIN: 401 em /api/auditoria', (await fetch(servidor.url + '/api/auditoria', { method: 'POST' })).status === 401);

  // ---------------------------------------------------------------------------------------------
  console.log('guardiao de cota');
  let uso = await json('/api/uso');
  ok('sem dado ainda: nivel "sem-dado"', uso.nivel === 'sem-dado', JSON.stringify(uso));
  await conversarPeloWs(servidor, { texto: 'oi' });
  uso = await json('/api/uso');
  ok('depois da primeira resposta o uso aparece (42%) e o nivel e "ok"', uso.cincoHoras === 42 && uso.nivel === 'ok', JSON.stringify(uso));
  await conversarPeloWs(servidor, { texto: 'cota-alta' });
  uso = await json('/api/uso');
  ok('85% da janela: nivel "alto" (aviso a partir de 80%)', uso.nivel === 'alto' && uso.cincoHoras === 85, JSON.stringify(uso));
  const novaAlta = await conversarPeloWs(servidor, { texto: 'conversa nova com a cota alta' });
  const detalheAlto = await json(`/api/conversas/${novaAlta.conversa}`);
  ok('conversa nova com a cota alta ja nasce no Haiku', detalheAlto.conversa.modelo === 'haiku', detalheAlto.conversa.modelo);

  const sonnet = await conversarPeloWs(servidor, { texto: 'e agora?', modelo: 'sonnet' });
  ok('antes do botao, o modelo escolhido vale', valorDe(ultimaChamada().args, '--model') === 'sonnet');
  const h = await (await post('/api/cota/haiku', { ligar: true })).json();
  ok('"usar o Haiku ate renovar" guarda ate quando', typeof h.haikuAte === 'number' && h.haikuAte * 1000 > Date.now());
  await conversarPeloWs(servidor, { texto: 'mais uma', conversa: sonnet.conversa });
  ok('com o Haiku forcado, a conversa do Sonnet roda no Haiku', valorDe(ultimaChamada().args, '--model') === 'haiku');
  await post('/api/cota/haiku', { ligar: false });
  await conversarPeloWs(servidor, { texto: 'voltou?', conversa: sonnet.conversa });
  ok('desligado, volta pro modelo da conversa', valorDe(ultimaChamada().args, '--model') === 'sonnet');

  const lim = await conversarPeloWs(servidor, { texto: 'limite-teste', modelo: 'sonnet' });
  const blocosLim = await ultimaIa(lim.conversa);
  ok('limite batido vira um bloco "limite" (nao um erro generico)', blocosLim.some((b) => b.tipo === 'limite' && /usage limit/i.test(b.texto)), JSON.stringify(blocosLim));
  uso = await json('/api/uso');
  ok('e o nivel vira "limite"', uso.nivel === 'limite', JSON.stringify(uso));

  // ---------------------------------------------------------------------------------------------
  console.log('dueto: o Claude chama o Gemini pelo servidor MCP');
  const { projeto: pDueto, pasta: pastaDueto } = await criarProjeto('dueto', { 'index.html': '<h1>logo</h1>' });
  const antesAgy = servidor.chamadasAgy().length;
  const fimDueto = await conversarPeloWs(servidor, { texto: 'dueto-teste: faça variações do logo', projeto: pDueto.id, parceria: 'dueto', modelo: 'sonnet' }, { limiteMs: 30000 });
  const cd = ultimaChamada();
  ok('o claude recebe --mcp-config', !!valorDe(cd.args, '--mcp-config'));
  const cfg = existsSync(valorDe(cd.args, '--mcp-config') ?? '') ? JSON.parse(readFileSync(valorDe(cd.args, '--mcp-config'), 'utf8')) : null;
  ok('o arquivo de conectores declara o servidor hrzz-gemini', !!cfg?.mcpServers?.['hrzz-gemini']?.args?.[0]?.endsWith('gemini.mjs'));
  ok('a ferramenta do Gemini entra nas permitidas', depoisDe(cd.args, '--allowedTools').includes('mcp__hrzz-gemini__pedir_ao_gemini'));
  ok('as instrucoes de fundo explicam o dueto', valorDe(cd.args, '--append-system-prompt').includes('Dueto ligado'));
  const chamadasAgy = servidor.chamadasAgy().slice(antesAgy);
  ok('o servidor MCP rodou o agy uma vez', chamadasAgy.length === 1, String(chamadasAgy.length));
  const ca = chamadasAgy[0];
  ok('o Gemini trabalha na subpasta arte/ do projeto', !!ca && ca.cwd === join(pastaDueto, 'arte'), ca?.cwd);
  ok('modo mid vira --mode accept-edits', !!ca && ca.args.includes('accept-edits'));
  ok('o prompt do Gemini leva a tarefa e o arquivo pedido', !!ca && ca.prompt.includes('arte-teste') && ca.prompt.includes(join(pastaDueto, 'index.html')));
  ok('arquivo fora do projeto nao e passado pro Gemini', !!ca && !ca.prompt.includes('fora.txt'));
  ok('o arquivo criado pelo Gemini esta em arte/', existsSync(join(pastaDueto, 'arte', 'variacao.svg')));
  const blocosDueto = await ultimaIa(fimDueto.conversa);
  const bg = blocosDueto.find((b) => b.tipo === 'gemini');
  ok('a conversa guarda o bloco "gemini" com a resposta dele', !!bg && bg.texto.includes('Criei variacao.svg') && bg.tarefa.includes('arte-teste'), JSON.stringify(bg));
  ok('o bloco avisa o arquivo que foi recusado', !!bg && bg.texto.includes('fora.txt'));
  ok('o Claude ainda responde depois do Gemini', blocosDueto.some((b) => b.tipo === 'texto' && b.texto.includes('revisei')));

  await json(`/api/conversas/${fimDueto.conversa}`, { method: 'PATCH', body: JSON.stringify({ modo: 'yolo' }) });
  await conversarPeloWs(servidor, { texto: 'dueto-teste de novo', conversa: fimDueto.conversa, modo: 'yolo' }, { limiteMs: 30000 });
  ok('modo yolo vira --mode auto no agy', servidor.chamadasAgy().at(-1).args.includes('auto'));
  const conv = await json(`/api/conversas/${fimDueto.conversa}`);
  ok('a conversa guarda a parceria "dueto"', conv.conversa.parceria === 'dueto');

  const r400 = await api('/api/dueto/ajustes', { method: 'PUT', body: JSON.stringify({ subpasta: '../fora' }) });
  ok('subpasta fora do projeto e recusada', r400.status === 400);
  const rOk = await api('/api/dueto/ajustes', { method: 'PUT', body: JSON.stringify({ subpasta: 'imagens' }) });
  ok('subpasta configuravel', rOk.status === 200 && (await json('/api/dueto/ajustes')).subpasta === 'imagens');
  await conversarPeloWs(servidor, { texto: 'dueto-teste outra subpasta', conversa: fimDueto.conversa }, { limiteMs: 30000 });
  ok('o Gemini passa a trabalhar em imagens/', servidor.chamadasAgy().at(-1).cwd === join(pastaDueto, 'imagens'));
  await api('/api/dueto/ajustes', { method: 'PUT', body: JSON.stringify({ subpasta: 'arte' }) });

  ok('pelo acesso da Cloudflare o dueto e recusado', /Cloudflare/.test((await enviarEErro({ texto: 'oi', parceria: 'dueto', modelo: 'sonnet' }, { 'cf-access-authenticated-user-email': 'a@b.c' })) ?? ''));
  const erroGoogle = await enviarEErro({ texto: 'oi', parceria: 'dueto', modelo: 'gemini-3-pro' });
  ok('dueto com modelo do Google: o Claude precisa coordenar', /Claude/.test(erroGoogle ?? ''), String(erroGoogle));

  // ---------------------------------------------------------------------------------------------
  console.log('duelo: dois motores, copias separadas, "usar essa"');
  const original = '<h1>original</h1>';
  const { projeto: pDuelo, pasta: pastaDuelo } = await criarProjeto('duelo', { 'index.html': original, 'leia.txt': 'nao mexe' });
  const fimDuelo = await conversarPeloWs(servidor, { texto: 'criar-site para a oficina', projeto: pDuelo.id, parceria: 'duelo', modelo: 'sonnet' }, { limiteMs: 40000 });
  const msgsDuelo = (await json(`/api/conversas/${fimDuelo.conversa}`)).mensagens;
  const msgDuelo = msgsDuelo.filter((m) => m.papel === 'ia').at(-1);
  const bd = msgDuelo?.conteudo?.find((b) => b.tipo === 'duelo');
  ok('a resposta e um bloco "duelo" com dois lados', !!bd && bd.lados.length === 2 && bd.escolhida === null, JSON.stringify(bd)?.slice(0, 200));
  ok('lado 0 e o Claude, lado 1 e o Gemini', bd?.lados[0].motor === 'claude' && bd?.lados[1].motor === 'agy');
  ok('cada lado tem a sua resposta', bd?.lados[0].blocos.some((b) => b.tipo === 'texto' && b.texto.includes('Criei o site')) && bd?.lados[1].blocos.some((b) => b.tipo === 'texto' && b.texto.includes('do meu jeito')));
  ok('o que cada um mudou fica listado', bd?.lados[0].mudancas.includes('M index.html') && bd?.lados[1].mudancas.includes('A so-do-gemini.txt'), JSON.stringify(bd?.lados.map((l) => l.mudancas)));
  ok('o projeto NAO foi mexido (cada lado usou a sua copia)', readFileSync(join(pastaDuelo, 'index.html'), 'utf8') === original && !existsSync(join(pastaDuelo, 'so-do-gemini.txt')));
  const cDuelo = servidor.chamadas().at(-1);
  ok('o claude rodou numa pasta de copia (dados/duelo)', !!cDuelo && cDuelo.cwd.replace(/\\/g, '/').includes('/duelo/'), cDuelo?.cwd);
  const aDuelo = servidor.chamadasAgy().at(-1);
  ok('o agy rodou na outra copia', !!aDuelo && aDuelo.cwd !== cDuelo?.cwd && aDuelo.cwd.replace(/\\/g, '/').includes('/duelo/'), aDuelo?.cwd);

  ok('nao deixa continuar sem escolher', /escolha/.test((await enviarEErro({ texto: 'e agora?', conversa: fimDuelo.conversa })) ?? ''));
  const escolha = await post('/api/duelo/escolher', { conversa: fimDuelo.conversa, mensagem: msgDuelo.id, lado: 1 });
  const re = await escolha.json();
  ok('"usar essa" no Gemini leva 2 arquivos pro projeto', escolha.status === 200 && re.aplicados === 2, JSON.stringify(re));
  ok('index.html agora e o do Gemini e o arquivo novo existe', readFileSync(join(pastaDuelo, 'index.html'), 'utf8').includes('Versao do Gemini') && existsSync(join(pastaDuelo, 'so-do-gemini.txt')));
  ok('o que nao mudou continua igual', readFileSync(join(pastaDuelo, 'leia.txt'), 'utf8') === 'nao mexe');
  ok('escolher de novo e recusado', (await post('/api/duelo/escolher', { conversa: fimDuelo.conversa, mensagem: msgDuelo.id, lado: 0 })).status === 400);
  const depois = (await ultimaIa(fimDuelo.conversa)).find((b) => b.tipo === 'duelo');
  ok('a escolha e o aviso ficam gravados', depois?.escolhida === 1 && /2 arquivos/.test(depois?.aviso ?? ''), JSON.stringify(depois?.aviso));
  const convDuelo = (await json(`/api/conversas/${fimDuelo.conversa}`)).conversa;
  ok('a conversa guarda a parceria "duelo"', convDuelo.parceria === 'duelo');

  const desfeito = await (await post('/api/desfazer', { projeto: pDuelo.id })).json();
  ok('"desfazer ultima mudanca" volta o projeto ao estado antes do "usar essa"', desfeito.ok && readFileSync(join(pastaDuelo, 'index.html'), 'utf8') === original && !existsSync(join(pastaDuelo, 'so-do-gemini.txt')), JSON.stringify(desfeito));

  await conversarPeloWs(servidor, { texto: 'oi depois do duelo', conversa: fimDuelo.conversa, parceria: '' }, { limiteMs: 30000 });
  const proxima = servidor.chamadas().at(-1);
  ok('a proxima mensagem leva o contexto do duelo (pedido e resposta escolhida)', proxima.prompt.includes('Contexto do HRZZ') && proxima.prompt.includes('criar-site') && proxima.prompt.includes('do meu jeito'));
  ok('fora do duelo, volta a rodar na pasta do projeto', proxima.cwd === pastaDuelo, proxima.cwd);

  // "nenhuma": nada vai pro projeto
  const antesNenhuma = readFileSync(join(pastaDuelo, 'index.html'), 'utf8'); // (o contexto do duelo cita criar-site: o claude de mentira escreveu um index.html no projeto)
  const f2 = await conversarPeloWs(servidor, { texto: 'criar-site de novo', conversa: fimDuelo.conversa, parceria: 'duelo' }, { limiteMs: 40000 });
  const m2 = (await json(`/api/conversas/${f2.conversa}`)).mensagens.filter((m) => m.papel === 'ia').at(-1);
  const r2 = await (await post('/api/duelo/escolher', { conversa: f2.conversa, mensagem: m2.id, lado: -1 })).json();
  ok('"nenhuma": nada vai pro projeto', r2.aplicados === 0 && readFileSync(join(pastaDuelo, 'index.html'), 'utf8') === antesNenhuma);
  ok('pelo acesso da Cloudflare o duelo e recusado', /Cloudflare/.test((await enviarEErro({ texto: 'oi', parceria: 'duelo' }, { 'cf-access-authenticated-user-email': 'a@b.c' })) ?? ''));

  // ---------------------------------------------------------------------------------------------
  console.log('fila em segundo plano e agendamentos');
  const { projeto: pFila } = await criarProjeto('fila', { 'leia.txt': 'oi' });
  const t1 = await (await post('/api/tarefas', { pedido: 'tarefa em segundo plano', projeto: pFila.id, titulo: 'resumo da noite' })).json();
  ok('criar tarefa devolve a tarefa na fila ou rodando', t1.id > 0 && ['fila', 'rodando'].includes(t1.estado), JSON.stringify(t1));
  const pronta = await ate(async () => (await json('/api/tarefas')).tarefas.find((t) => t.id === t1.id && t.estado === 'pronta'));
  ok('a tarefa roda sozinha e termina "pronta"', !!pronta, JSON.stringify((await json('/api/tarefas')).tarefas));
  if (pronta) {
    const cv = await json(`/api/conversas/${pronta.conversaId}`);
    ok('virou uma conversa no projeto, com o titulo da tarefa', cv.conversa.titulo === 'resumo da noite' && cv.conversa.projetoId === pFila.id && cv.mensagens.length >= 2);
  }

  const lenta = await (await post('/api/tarefas', { pedido: 'tarefa lenta pra cancelar', projeto: pFila.id })).json();
  const segunda = await (await post('/api/tarefas', { pedido: 'a segunda da fila', projeto: pFila.id })).json();
  const rodandoLenta = await ate(async () => (await json('/api/tarefas')).tarefas.find((t) => t.id === lenta.id && t.estado === 'rodando'));
  ok('uma tarefa por vez: a segunda espera na fila', !!rodandoLenta && (await json('/api/tarefas')).tarefas.find((t) => t.id === segunda.id).estado === 'fila');
  ok('cancelar a que esta rodando', (await post(`/api/tarefas/${lenta.id}/cancelar`)).status === 200);
  const canc = await ate(async () => (await json('/api/tarefas')).tarefas.find((t) => t.id === lenta.id && t.estado === 'cancelada'), 10000);
  ok('ela termina "cancelada"', !!canc);
  const seg = await ate(async () => (await json('/api/tarefas')).tarefas.find((t) => t.id === segunda.id && t.estado === 'pronta'));
  ok('e a segunda segue sozinha', !!seg);
  ok('cancelar tarefa que ja terminou: 409', (await post(`/api/tarefas/${t1.id}/cancelar`)).status === 409);
  ok('tirar da lista uma tarefa pronta', (await api(`/api/tarefas/${t1.id}`, { method: 'DELETE' })).status === 200);
  ok('pelo acesso da Cloudflare tarefas sao recusadas', (await post('/api/tarefas', { pedido: 'x' }, { 'cf-access-authenticated-user-email': 'a@b.c' })).status === 403);
  ok('tarefa sem pedido: 400', (await post('/api/tarefas', { pedido: '  ' })).status === 400);

  const v1 = await (await post('/api/agendamentos/validar', { cron: '0 8 * * 1-5' })).json();
  ok('validar cron: mostra as proximas 3 execucoes', v1.ok && v1.proximas.length === 3 && v1.proximas[0] > Date.now(), JSON.stringify(v1));
  ok('cron de 6 campos (com segundos) e recusado', !(await (await post('/api/agendamentos/validar', { cron: '*/5 * * * * *' })).json()).ok);
  ok('cron invalido e recusado', !(await (await post('/api/agendamentos/validar', { cron: '99 99 * * *' })).json()).ok);
  ok('criar agendamento com cron invalido: 400', (await post('/api/agendamentos', { pedido: 'x', cron: 'banana' })).status === 400);
  const ag = await (await post('/api/agendamentos', { titulo: 'resumo diario', pedido: 'agendamento lento de teste', projeto: pFila.id, cron: '0 8 * * *' })).json();
  ok('criar agendamento devolve a proxima execucao', ag.id > 0 && ag.ligado === true && ag.proxima > Date.now(), JSON.stringify(ag));
  const desl = await (await api(`/api/agendamentos/${ag.id}`, { method: 'PATCH', body: JSON.stringify({ ligado: false }) })).json();
  ok('desligar tira a proxima execucao', desl.ligado === false && desl.proxima === null);
  await api(`/api/agendamentos/${ag.id}`, { method: 'PATCH', body: JSON.stringify({ ligado: true }) });
  const ra = await post(`/api/agendamentos/${ag.id}/rodar-agora`);
  const ta = await ra.json();
  ok('"rodar agora" cria uma tarefa de origem "agenda"', ra.status === 200 && ta.origem === 'agenda' && ta.agendamentoId === ag.id, JSON.stringify(ta));
  ok('nao empilha enquanto a rodada anterior nao acabou', (await post(`/api/agendamentos/${ag.id}/rodar-agora`)).status === 409);
  await post(`/api/tarefas/${ta.id}/cancelar`);
  await ate(async () => (await json('/api/tarefas')).tarefas.find((t) => t.id === ta.id && t.estado === 'cancelada'), 10000);
  ok('o agendamento guarda quando rodou pela ultima vez', !!(await json('/api/agendamentos')).find((a) => a.id === ag.id).ultimo);
  ok('apagar agendamento', (await api(`/api/agendamentos/${ag.id}`, { method: 'DELETE' })).status === 200 && (await json('/api/agendamentos')).length === 0);

  // ---------------------------------------------------------------------------------------------
  console.log('auditoria: estouro, alvos de 44 px, axe, contraste');
  const ruim = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:16px sans-serif}.largo{width:700px;height:20px;background:#ccc}.pq{width:20px;height:20px}.claro{color:#aaa;background:#fff}</style></head><body><div class="largo">largo demais</div><button class="pq">x</button><img src="x.png"><p class="claro">texto claro demais</p></body></html>`;
  const boa = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pagina boa</title><style>body{margin:0;font:16px sans-serif;color:#111;background:#fff}main{padding:12px}button{min-width:44px;min-height:44px}</style></head><body><main><h1>Pagina boa</h1><p>Texto legivel.</p><button>ok</button></main></body></html>`;
  const { projeto: pAud, pasta: pastaAud } = await criarProjeto('auditoria', { 'index.html': boa, 'ruim.html': ruim });
  ok('sem preview rodando: 409', (await post('/api/auditoria', { projeto: pAud.id })).status === 409);
  const ini = await post('/api/preview/iniciar', { projeto: pAud.id, como: 'estatico' });
  ok('preview estatico sobe', ini.status === 200, await ini.text());
  const rb = await (await post('/api/auditoria', { projeto: pAud.id, caminho: '/index.html' })).json();
  const porId = (r, id) => r.verificacoes.find((v) => v.id === id);
  ok('pagina boa: nenhum problema', rb.problemas === 0 && rb.verificacoes.length === 4 && rb.verificacoes.every((v) => v.ok), JSON.stringify(rb.verificacoes?.map((v) => [v.id, v.total, v.itens?.[0]])));
  ok('pagina boa: pedido diz que nao achou nada', /não achou problemas/.test(rb.pedido));
  const rr = await (await post('/api/auditoria', { projeto: pAud.id, caminho: '/ruim.html' })).json();
  ok('pagina ruim: estouro lateral achado', !porId(rr, 'estouro').ok && porId(rr, 'estouro').itens.some((i) => /largo/.test(i.onde)), JSON.stringify(porId(rr, 'estouro')));
  ok('pagina ruim: botao de 20 px achado nos alvos de toque', !porId(rr, 'alvos').ok && porId(rr, 'alvos').itens.some((i) => /button/.test(i.onde) && /20 x 20/.test(i.detalhe)), JSON.stringify(porId(rr, 'alvos')));
  ok('pagina ruim: axe acha imagem sem alt e falta de lang/titulo', !porId(rr, 'acessibilidade').ok && porId(rr, 'acessibilidade').itens.some((i) => /image-alt/.test(i.detalhe)), JSON.stringify(porId(rr, 'acessibilidade').itens.map((i) => i.detalhe)));
  ok('pagina ruim: contraste baixo achado com a razao', !porId(rr, 'contraste').ok && porId(rr, 'contraste').itens.some((i) => /contraste \d\.\d\d:1/.test(i.detalhe)), JSON.stringify(porId(rr, 'contraste')));
  ok('o pedido pro Claude lista os problemas e pede conferir em 360 e 1280', /problemas/.test(rr.pedido) && rr.pedido.includes('nada passa da lateral') && /360 px e em 1280 px/.test(rr.pedido));
  const guardada = await json(`/api/auditoria?projeto=${pAud.id}`);
  ok('a ultima auditoria fica guardada', guardada?.caminho === '/ruim.html' && guardada.problemas === rr.problemas);
  await post('/api/preview/parar', { projeto: pAud.id });
  void pastaAud;
} finally {
  await servidor.parar();
}

console.log(falhas === 0 ? '\ntudo certo' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
