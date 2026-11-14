// Testes de interface da etapa 5 (IA junta): dueto, duelo, guardiao de cota, fila, agendamentos e auditoria.
// Chamado pelo testar-interface.mjs (e pelo testar-ia-junta-ui.mjs) com o servidor isolado: claude e agy de mentira.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGINA_RUIM = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:16px sans-serif}.largo{width:700px;height:20px;background:#ccc}.pq{width:20px;height:20px}.claro{color:#aaa;background:#fff}</style></head><body><div class="largo">largo demais</div><button class="pq">x</button><img src="x.png"><p class="claro">texto claro demais</p></body></html>`;

export async function testarIaJunta({ alvo, url, novaPagina, ok, vazamentos }) {
  console.log('ia junta: dueto, duelo, cota, fila, agendamentos e auditoria (1280 px)');
  const servidor = alvo.servidor;
  if (!servidor) {
    console.log('  [~~] sem servidor isolado: teste da IA junta pulado');
    return;
  }
  const api = (caminho, init = {}) =>
    fetch(servidor.url + caminho, { ...init, headers: { cookie: servidor.cabecalhoCookie, ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) } });
  const json = async (caminho, init) => (await api(caminho, init)).json();

  // projeto do dueto/duelo e projeto da auditoria (com uma pagina cheia de problemas)
  const pastaDuelo = join(servidor.pasta, 'ui-duelo');
  mkdirSync(pastaDuelo, { recursive: true });
  writeFileSync(join(pastaDuelo, 'index.html'), '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>original</title></head><body><main><h1>original</h1></main></body></html>');
  const pDuelo = await json('/api/projetos', { method: 'POST', body: JSON.stringify({ nome: 'ui duelo', pasta: pastaDuelo }) });
  const pastaAud = join(servidor.pasta, 'ui-auditoria');
  mkdirSync(pastaAud, { recursive: true });
  writeFileSync(join(pastaAud, 'index.html'), PAGINA_RUIM);
  const pAud = await json('/api/projetos', { method: 'POST', body: JSON.stringify({ nome: 'ui auditoria', pasta: pastaAud }) });

  const erros = [];
  const p = await novaPagina({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  p.on('console', (m) => {
    // 404 do site de teste da auditoria (imagem que nao existe, de proposito) nao e erro do HRZZ
    if (m.type() === 'error' && !/status of 503/.test(m.text()) && !m.location().url.includes('/preview/')) erros.push('console: ' + m.text() + ' ' + m.location().url);
  });
  p.on('dialog', (d) => d.accept());
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForSelector('.topo');

  const campo = 'textarea[aria-label="Mensagem"]';
  const digitar = async (texto) => {
    await p.fill(campo, texto);
    await p.press(campo, 'Enter');
  };
  const esperarFim = async () => {
    await p.waitForSelector('button[aria-label="Enviar"]', { timeout: 30000 });
  };
  const novaNoProjeto = async (nome) => {
    await p.locator('.item-proj', { hasText: nome }).first().click();
  };

  // ---------- dueto ----------
  await novaNoProjeto('ui duelo');
  ok('dueto: botao comeca desligado', (await p.getAttribute('button[aria-label="Modo dueto"]', 'aria-pressed')) === 'false');
  await p.click('button[aria-label="Modo dueto"]');
  ok('dueto: o botao liga', (await p.getAttribute('button[aria-label="Modo dueto"]', 'aria-pressed')) === 'true');
  ok('dueto: o duelo desliga junto (so um por vez)', (await p.getAttribute('button[aria-label="Modo duelo"]', 'aria-pressed')) === 'false');
  ok('dueto: o aviso explica o que vai acontecer', (await p.locator('.aviso-modo').innerText()).includes('dueto ligado'));
  await digitar('dueto-teste: faça variações do logo');
  await p.waitForSelector('.gemini-bloco', { timeout: 30000 });
  await esperarFim();
  ok('dueto: a fala do Gemini aparece recuada, com o ponto do Google', (await p.locator('.gemini-bloco .pt.gm').count()) >= 1);
  ok('dueto: mostra a tarefa e a resposta do Gemini', (await p.locator('.gemini-bloco').first().innerText()).includes('variacao.svg'));
  ok('dueto: o Claude responde depois', await p.locator('.msg.ia', { hasText: 'revisei' }).first().isVisible());
  ok('dueto: o Gemini criou o arquivo na subpasta arte/', existsSync(join(pastaDuelo, 'arte', 'variacao.svg')));
  ok('dueto: a conversa lembra a parceria (botao continua ligado)', (await p.getAttribute('button[aria-label="Modo dueto"]', 'aria-pressed')) === 'true');
  await p.click('button[aria-label="Modo dueto"]');
  await p.waitForSelector('button[aria-label="Modo dueto"][aria-pressed="false"]', { timeout: 5000 }).catch(() => undefined);
  ok('dueto: desliga', (await p.getAttribute('button[aria-label="Modo dueto"]', 'aria-pressed')) === 'false');
  const v0 = await vazamentos(p);
  ok('dueto: nada vaza em 1280 px', v0.length === 0, v0.join(', '));

  // ---------- duelo ----------
  await p.click('button[aria-label="Modo duelo"]');
  ok('duelo: liga e mostra o aviso', (await p.locator('.aviso-modo').innerText()).includes('duelo ligado'));
  await digitar('criar-site de novo');
  await p.waitForSelector('.duelo-lado', { timeout: 30000 });
  await p.waitForSelector('.duelo .bt:has-text("usar essa")', { timeout: 30000 });
  await esperarFim();
  ok('duelo: duas respostas lado a lado', (await p.locator('.duelo .duelo-lado').count()) === 2);
  const nomes = await p.locator('.duelo .duelo-lado .modelo-tag').allInnerTexts();
  ok('duelo: um lado e o Claude e o outro o Gemini', nomes.some((n) => /Claude|Opus|Sonnet|Haiku/.test(n)) && nomes.some((n) => /Gemini/.test(n)), nomes.join(' | '));
  ok('duelo: cada lado tem o seu "usar essa"', (await p.locator('.duelo .bt:has-text("usar essa")').count()) === 2);
  ok('duelo: lista o que cada um mudou', (await p.locator('.duelo-mudancas').allInnerTexts()).some((t) => t.includes('so-do-gemini.txt')));
  ok('duelo: o projeto ainda nao foi mexido', readFileSync(join(pastaDuelo, 'index.html'), 'utf8').includes('<title>original</title>') && !existsSync(join(pastaDuelo, 'so-do-gemini.txt')));
  ok('duelo: tem "nenhuma das duas"', await p.locator('.duelo .bt:has-text("nenhuma das duas")').isVisible());

  // no celular as duas respostas ficam uma embaixo da outra e nada vaza
  await p.setViewportSize({ width: 360, height: 780 });
  await p.waitForTimeout(250);
  const caixas = await p.locator('.duelo .duelo-lado').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
  ok('duelo: no celular as respostas ficam empilhadas', caixas.length === 2 && caixas[1].top >= caixas[0].bottom - 2, JSON.stringify(caixas.map((c) => [Math.round(c.top), Math.round(c.bottom)])));
  const v360 = await vazamentos(p);
  ok('duelo: nada vaza em 360 px', v360.length === 0, v360.join(', '));
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.waitForTimeout(250);

  await p.locator('.duelo .duelo-lado').nth(1).locator('.bt:has-text("usar essa")').click();
  await p.waitForSelector('.duelo-aviso', { timeout: 15000 });
  ok('duelo: usar essa leva as mudancas pro projeto e avisa', (await p.locator('.duelo-aviso').innerText()).includes('2 arquivos'));
  ok('duelo: o index.html do projeto agora e o do Gemini', readFileSync(join(pastaDuelo, 'index.html'), 'utf8').includes('Versao do Gemini') && existsSync(join(pastaDuelo, 'so-do-gemini.txt')));
  ok('duelo: a resposta escolhida ganha o selo', (await p.locator('.duelo-lado.escolhida .duelo-selo').count()) === 1);
  ok('duelo: a outra fica recolhida, com botao pra abrir', (await p.locator('.duelo-lado.recolhida .bt:has-text("ver a resposta guardada")').count()) === 1);
  await p.locator('.duelo-lado.recolhida .bt:has-text("ver a resposta guardada")').click();
  ok('duelo: abrir mostra a resposta guardada', (await p.locator('.duelo-lado.recolhida').innerText()).includes('Criei o site'));
  ok('duelo: depois de escolher some o "usar essa"', (await p.locator('.duelo .bt:has-text("usar essa")').count()) === 0);
  await p.click('button[aria-label="Modo duelo"]');
  await p.waitForSelector('button[aria-label="Modo duelo"][aria-pressed="false"]', { timeout: 5000 }).catch(() => undefined);
  ok('duelo: desliga', (await p.getAttribute('button[aria-label="Modo duelo"]', 'aria-pressed')) === 'false');

  // ---------- guardiao de cota ----------
  await p.click('.lado button[aria-label="Nova conversa"]');
  await digitar('cota-alta');
  await esperarFim();
  await p.waitForSelector('.aviso-cota', { timeout: 10000 });
  ok('cota: aviso a partir de 80% com a porcentagem', (await p.locator('.aviso-cota').first().innerText()).includes('85%'));
  ok('cota: a barrinha do topo fica ambar', (await p.locator('.topo .mini.am').count()) >= 1);
  await p.click('.aviso-cota .bt:has-text("usar o Haiku até renovar")');
  await p.waitForSelector('.aviso-cota:has-text("usando o Haiku")', { timeout: 10000 });
  ok('cota: "usar o Haiku" guarda no servidor', typeof (await json('/api/uso')).haikuAte === 'number');
  await digitar('com o haiku forcado');
  await esperarFim();
  ok('cota: a proxima mensagem roda no Haiku', servidor.chamadas().at(-1).args.includes('haiku') && servidor.chamadas().at(-1).args[servidor.chamadas().at(-1).args.indexOf('--model') + 1] === 'haiku');
  await p.click('.aviso-cota button:has-text("voltar ao modelo normal")');
  await p.waitForFunction(() => !document.querySelector('.aviso-cota')?.textContent?.includes('usando o Haiku'), null, { timeout: 10000 });
  ok('cota: voltar ao normal desliga no servidor', (await json('/api/uso')).haikuAte === undefined);

  await p.click('.lado button[aria-label="Nova conversa"]');
  await digitar('limite-teste');
  await esperarFim();
  await p.waitForSelector('.limite', { timeout: 10000 });
  ok('limite: explica o que aconteceu e quando renova', (await p.locator('.limite').innerText()).includes('usage limit') && (await p.locator('.limite').innerText()).includes('renova em'));
  ok('limite: oferece o Haiku e o Gemini', (await p.locator('.limite .bt').allInnerTexts()).join('|').includes('Haiku') && (await p.locator('.limite .bt').allInnerTexts()).join('|').includes('Gemini'));
  const antesAgy = servidor.chamadasAgy().length;
  await p.click('.limite .bt:has-text("mandar pro Gemini")');
  await p.waitForSelector('.msg.ia:has-text("Fiz o que o Claude pediu")', { timeout: 30000 });
  ok('limite: "mandar pro Gemini" troca de motor e manda a mensagem de novo', servidor.chamadasAgy().length === antesAgy + 1);

  // ---------- fila em segundo plano ----------
  await p.click('.lado button[aria-label="Nova conversa"]');
  await p.fill(campo, 'tarefa em segundo plano pela interface');
  await p.click('button[aria-label="Mandar pra fila"]');
  await p.waitForFunction(() => document.querySelector('.leg')?.textContent?.includes('na fila'), null, { timeout: 5000 });
  ok('fila: o texto some do campo depois de mandar', (await p.inputValue(campo)) === '');
  await p.click('button[title="fila de tarefas"]');
  await p.waitForSelector('.pop-fila .it-fila', { timeout: 10000 });
  ok('fila: a tarefa aparece no popover do topo', (await p.locator('.pop-fila .it-fila').first().innerText()).includes('tarefa em segundo plano'));
  await p.waitForSelector('.pop-fila .it-fila .tag:has-text("pronta")', { timeout: 30000 });
  ok('fila: termina "pronta" sozinha', true);
  await p.locator('.pop-fila .it-fila', { hasText: 'tarefa em segundo plano' }).first().click();
  await p.waitForSelector('.msg.eu:has-text("tarefa em segundo plano")', { timeout: 10000 });
  ok('fila: clicar abre a conversa criada pela tarefa', true);

  // ---------- ajustes: agendamentos e dueto ----------
  await p.click('.lado button[data-v="cfg"]');
  await p.waitForSelector('#v-cfg.on');
  ok('ajustes: mostra a fila em segundo plano e os agendamentos', (await p.locator('#v-cfg .gr', { hasText: 'agendamentos' }).count()) === 1);
  await p.click('#v-cfg button:has-text("novo agendamento")');
  ok('agendamento: criar comeca desligado (falta o pedido)', await p.locator('#v-cfg .form-agenda button[type="submit"]').isDisabled());
  await p.fill('#v-cfg textarea[aria-label="Pedido do agendamento"]', 'resumo diário dos projetos');
  await p.fill('#v-cfg input[aria-label="Nome do agendamento"]', 'resumo diario');
  await p.waitForFunction(() => document.querySelector('#v-cfg .form-agenda .nota-pin')?.textContent?.includes('próximas'), null, { timeout: 5000 });
  ok('agendamento: mostra as proximas execucoes antes de criar', true);
  await p.selectOption('#v-cfg select[aria-label="Quando rodar"]', 'cron');
  await p.fill('#v-cfg input[aria-label="Cron de 5 campos"]', 'banana');
  await p.waitForFunction(() => document.querySelector('#v-cfg .form-agenda .nota-pin')?.textContent?.includes('horário inválido') || document.querySelector('#v-cfg .form-agenda .nota-pin')?.textContent?.includes('5 campos'), null, { timeout: 5000 });
  ok('agendamento: cron errado mostra o motivo e nao deixa criar', await p.locator('#v-cfg .form-agenda button[type="submit"]').isDisabled());
  await p.selectOption('#v-cfg select[aria-label="Quando rodar"]', 'uteis');
  await p.fill('#v-cfg input[aria-label="Horário"]', '07:30');
  await p.waitForFunction(() => document.querySelector('#v-cfg .form-agenda .nota-pin')?.textContent?.includes('30 7 * * 1-5'), null, { timeout: 5000 });
  await p.waitForFunction(() => !document.querySelector('#v-cfg .form-agenda button[type="submit"]')?.disabled, null, { timeout: 5000 });
  await p.click('#v-cfg .form-agenda button[type="submit"]');
  await p.waitForSelector('#v-cfg .cartao-agenda', { timeout: 10000 });
  ok('agendamento: aparece na lista com o cron e a proxima execucao', (await p.locator('#v-cfg .cartao-agenda').innerText()).includes('30 7 * * 1-5') && (await p.locator('#v-cfg .cartao-agenda').innerText()).includes('próxima'));
  await p.click('#v-cfg .cartao-agenda button:has-text("rodar agora")');
  await p.waitForFunction(() => /agendada|resumo diario/.test(document.querySelector('#v-cfg')?.textContent ?? '') && document.querySelectorAll('#v-cfg .lin .tag').length > 0, null, { timeout: 10000 });
  const tarefas = (await json('/api/tarefas')).tarefas;
  ok('agendamento: "rodar agora" criou uma tarefa de origem agenda', tarefas.some((t) => t.origem === 'agenda'));
  await p.click('#v-cfg .cartao-agenda button:has-text("ligado")');
  await p.waitForSelector('#v-cfg .cartao-agenda button:has-text("desligado")', { timeout: 5000 });
  ok('agendamento: desligar mostra "desligado"', true);
  await p.fill('#subpasta-dueto', 'imagens');
  await p.click('#v-cfg button:has-text("salvar"):near(#subpasta-dueto)');
  await p.waitForFunction(() => document.querySelector('#v-cfg')?.textContent?.includes('imagens/'), null, { timeout: 5000 });
  ok('dueto: a pasta do Gemini e configuravel', (await json('/api/dueto/ajustes')).subpasta === 'imagens');
  await api('/api/dueto/ajustes', { method: 'PUT', body: JSON.stringify({ subpasta: 'arte' }) });
  const vc = await vazamentos(p);
  ok('ajustes: nada vaza em 1280 px', vc.length === 0, vc.join(', '));
  for (const larg of [620, 360]) {
    await p.setViewportSize({ width: larg, height: 800 });
    await p.waitForTimeout(250);
    const v = await vazamentos(p);
    ok(`ajustes: nada vaza em ${larg} px`, v.length === 0, v.join(', '));
  }
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.waitForTimeout(250);
  await p.locator('#v-cfg .cartao-agenda button:has-text("apagar")').click();
  await p.waitForSelector('#v-cfg .cartao-agenda', { state: 'detached', timeout: 5000 });
  ok('agendamento: apagar tira da lista', true);

  // ---------- auditoria ----------
  const ini = await api('/api/preview/iniciar', { method: 'POST', body: JSON.stringify({ projeto: pAud.id, como: 'estatico' }) });
  ok('auditoria: preview estatico do projeto de teste sobe', ini.status === 200);
  const fimAud = await (async () => {
    const { conversarPeloWs } = await import('./lib-teste.mjs');
    return conversarPeloWs(servidor, { texto: 'oi', projeto: pAud.id });
  })();
  await p.locator('.conv-abrir', { hasText: 'oi' }).first().evaluate((e) => e.click());
  await p.waitForSelector('.msg.ia');
  await p.click('.tab:has-text("preview")');
  await p.waitForSelector('iframe.quadro', { timeout: 15000 });
  await p.click('button[aria-label="Auditoria"]');
  await p.waitForSelector('.auditoria', { timeout: 60000 });
  ok('auditoria: mostra as 4 verificacoes', (await p.locator('.auditoria .aud-verif').count()) === 4);
  ok('auditoria: acha problemas na pagina ruim', (await p.locator('.auditoria .aud-topo .tag').innerText()).includes('problema'));
  const textoAud = await p.locator('.auditoria').innerText();
  ok('auditoria: lista estouro, alvo de toque, imagem sem alt e contraste', /largo/.test(textoAud) && /20 x 20/.test(textoAud) && /image-alt/.test(textoAud) && /contraste \d\.\d\d:1/.test(textoAud), textoAud.slice(0, 300));
  const va = await vazamentos(p);
  ok('auditoria: nada vaza em 1280 px', va.length === 0, va.join(', '));
  void fimAud;
  await p.click('.auditoria .bt:has-text("pedir pro Claude corrigir")');
  await p.waitForSelector('.msg.eu:has-text("Rodei a auditoria do preview")', { timeout: 15000 });
  ok('auditoria: "pedir pro Claude corrigir" manda o pedido na conversa', true);
  await esperarFim();
  ok('auditoria: o painel da auditoria fecha depois de pedir', (await p.locator('.auditoria').count()) === 0);

  ok('ia junta: nenhum erro no console', erros.length === 0, erros.join(' | '));
  await p.close();
}
