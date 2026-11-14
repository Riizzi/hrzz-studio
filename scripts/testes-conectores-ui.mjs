// Testes de interface da etapa 6 (conectores e painel do dia). Chamado pelo testar-interface.mjs com o servidor
// isolado: claude de mentira, que responde ao `claude mcp list` com a lista de servidor.listaMcp.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LISTA_MCP_PADRAO } from './lib-teste.mjs';

export async function testarConectores({ alvo, url, novaPagina, ok, vazamentos }) {
  console.log('conectores e painel do dia (1280 px)');
  const servidor = alvo.servidor;
  if (!servidor) {
    console.log('  [~~] sem servidor isolado: teste dos conectores pulado');
    return;
  }
  const json = async (caminho) => (await fetch(servidor.url + caminho, { headers: { cookie: servidor.cabecalhoCookie } })).json();
  const erros = [];
  const p = await novaPagina({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  p.on('console', (m) => {
    if (m.type() === 'error' && !/status of 503/.test(m.text())) erros.push('console: ' + m.text());
  });
  p.on('dialog', (d) => d.accept());
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForSelector('.topo');

  // ---------- conectores ----------
  await p.click('.lado button[data-v="con"]');
  await p.waitForSelector('#v-con.on .cartao-con');
  await p.click('#v-con button:has-text("consultar o claude")');
  await p.waitForSelector('#v-con .dica-acervo:has-text("claude consultado")', { timeout: 20000 });
  const linha = (nome) => p.locator('#v-con .bloco-con', { has: p.locator('.nome-con', { hasText: new RegExp(`^${nome}$`) }) });
  ok('conectores: Drive aparece conectado (vindo do claude)', /conectado/.test(await linha('Drive').innerText()));
  ok('conectores: Agenda e Vercel pedem login', /precisa de login/.test(await linha('Agenda').innerText()) && /precisa de login/.test(await p.locator('#v-con .cartao-con', { hasText: 'Vercel' }).first().innerText()));
  ok('conectores: Gmail aparece como nao conectado', /não conectado/.test(await linha('Gmail').innerText()));
  ok('conectores: mostra o comando pra ligar a Vercel, copiavel', await p.locator('#v-con .comando-con', { hasText: 'claude mcp add --transport http --scope user vercel https://mcp.vercel.com' }).isVisible());
  ok('conectores: GitHub, Cloudflare e Supabase pedem token', (await p.locator('#v-con input[type=password]').count()) === 3 && /sem token/.test(await p.locator('#v-con .cartao-con', { hasText: 'GitHub' }).first().innerText()));
  ok('conectores: salvar comeca desligado', await p.locator('#v-con .cartao-con:has-text("GitHub") button:has-text("salvar")').isDisabled());

  await p.fill('#v-con input[aria-label="Token do GitHub"]', 'ghp_token_da_interface_4321');
  await p.click('#v-con .cartao-con:has-text("GitHub") button:has-text("salvar")');
  await p.waitForSelector('#v-con .aviso-acervo.ok');
  ok('conectores: token salvo limpa o campo e mostra so o final', (await p.inputValue('#v-con input[aria-label="Token do GitHub"]')) === '' && (await p.getAttribute('#v-con input[aria-label="Token do GitHub"]', 'placeholder')).includes('••••4321'));
  ok('conectores: o token nao aparece em lugar nenhum da pagina', !(await p.content()).includes('ghp_token_da_interface'));
  const mcp = () => JSON.parse(readFileSync(join(servidor.pasta, 'segredos', 'mcp.json'), 'utf8'));
  ok('conectores: o mcp.json do servidor recebeu o token', mcp().mcpServers['hrzz-github']?.headers?.Authorization === 'Bearer ghp_token_da_interface_4321');
  await p.click('#v-con button[aria-label="GitHub: somente leitura ligada"]');
  await p.waitForSelector('#v-con button[aria-label="GitHub: somente leitura desligada"]');
  ok('conectores: desligar o "somente leitura" troca a url no mcp.json', !/readonly/.test(mcp().mcpServers['hrzz-github'].url));
  await p.click('#v-con button[aria-label="Drive: pergunta antes"]');
  await p.waitForSelector('#v-con button[aria-label="Drive: uso livre"]');
  await p.click('#v-con button[aria-label="Docs: ligado"]');
  await p.waitForSelector('#v-con button[aria-label="Docs: desligado"]');
  const estado = await json('/api/conectores');
  ok('conectores: "livre" e "desligado" chegam ao servidor', estado.conectores.find((c) => c.id === 'google-drive').acesso === 'livre' && estado.conectores.find((c) => c.id === 'google-docs').ligado === false);
  await p.click('#v-con .cartao-con:has-text("GitHub") button:has-text("tirar token")');
  await p.waitForSelector('#v-con .cartao-con:has-text("GitHub") button:has-text("tirar token")', { state: 'detached' });
  ok('conectores: tirar o token apaga do mcp.json', !mcp().mcpServers['hrzz-github']);
  ok('conectores: nada vaza pelas laterais', (await vazamentos(p)).length === 0, (await vazamentos(p)).join(', '));

  // ---------- painel do dia ----------
  await p.click('.lado button[data-v="dia"]');
  await p.waitForSelector('#v-dia.on .cardg');
  await p.waitForSelector('#v-dia .cardg:has-text("pendências") .linha-botao');
  const usoTexto = (await p.locator('#v-dia .cardg', { hasText: 'janela de 5 h' }).first().innerText()).replace(/\n/g, ' ');
  ok('painel do dia: uso do Claude mostra 42%', /42%/.test(usoTexto), usoTexto);
  ok('painel do dia: o Gemini aparece sem numero (o agy nao informa)', /Gemini\s*–/.test(usoTexto), usoTexto);
  ok('painel do dia: lista os repositorios dos projetos', (await p.locator('#v-dia .cardg:has-text("repositórios") .bloco-con, #v-dia .cardg:has-text("repositórios") .lin').count()) >= 1);
  ok('painel do dia: GitHub sem token convida a ligar', await p.locator('#v-dia .cardg:has-text("repositórios") .vazio:has-text("ligue o GitHub")').isVisible());
  ok('painel do dia: agenda sem login explica o motivo', /login/.test(await p.locator('#v-dia .cardg:has-text("agenda")').first().innerText()));
  ok('painel do dia: as pendencias vem da lista de tarefas das conversas', /conferir os alvos/.test(await p.locator('#v-dia .cardg:has-text("pendências")').innerText()));
  ok('painel do dia: nada vaza pelas laterais', (await vazamentos(p)).length === 0, (await vazamentos(p)).join(', '));

  // agenda: conecta o Google Agenda "no claude", consulta e busca
  writeFileSync(servidor.listaMcp, LISTA_MCP_PADRAO.replace('! Needs authentication\nplugin', '✔ Connected\nplugin'));
  await p.click('#v-dia .cardg:has-text("agenda") button:has-text("abrir conectores")');
  await p.waitForSelector('#v-con.on');
  await p.click('#v-con button:has-text("consultar o claude")');
  await p.waitForFunction(() => /conectado/.test([...document.querySelectorAll('#v-con .bloco-con')].find((e) => /Agenda/.test(e.innerText))?.innerText ?? '') && !/consultando o claude/.test(document.querySelector('#v-con')?.innerText ?? ''), null, { timeout: 20000 });
  ok('conectores: depois de conectar no claude, a Agenda aparece conectada', true);
  await p.click('.lado button[data-v="dia"]');
  await p.waitForSelector('#v-dia .cardg:has-text("agenda") button:has-text("buscar agenda")');
  await p.click('#v-dia button:has-text("buscar agenda")');
  await p.waitForSelector('#v-dia .nome-con:has-text("cafe com o cliente")', { timeout: 20000 });
  const textoAgenda = await p.locator('#v-dia .cardg:has-text("agenda")').first().innerText();
  ok('painel do dia: mostra os eventos de hoje em ordem, com hora e local', textoAgenda.indexOf('cafe com o cliente') < textoAgenda.indexOf('reuniao com a equipe') && /sala 2/.test(textoAgenda) && /hoje/.test(textoAgenda), textoAgenda);
  ok('painel do dia: o evento quebrado nao aparece', !/evento quebrado/.test(textoAgenda));
  ok('painel do dia: o botao vira "buscar de novo"', await p.locator('#v-dia button:has-text("buscar de novo")').isVisible());

  // pendencia abre a conversa
  await p.click('#v-dia .cardg:has-text("pendências") .linha-botao >> nth=0');
  await p.waitForSelector('#v-chat.on');
  await p.waitForSelector('.msg', { timeout: 10000 });
  ok('painel do dia: clicar numa pendencia abre a conversa dela', (await p.locator('.msg').count()) >= 1);

  // telas estreitas com dados de verdade: item comprido sem espacos, token salvo e agenda buscada
  const primeiraConversa = (await json('/api/conversas'))[0];
  await fetch(servidor.url + '/api/progresso', {
    method: 'POST',
    headers: { cookie: servidor.cabecalhoCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ conversa: primeiraConversa.id, texto: 'https://exemplo.com.br/um/caminho/muito/longo/que/nao/tem/espacos/e/precisa/quebrar/sem/vazar/pela/lateral/da/tela' }),
  });
  await fetch(servidor.url + '/api/conectores/cloudflare', { method: 'PUT', headers: { cookie: servidor.cabecalhoCookie, 'content-type': 'application/json' }, body: JSON.stringify({ token: 'cf_token_muito_comprido_para_testar_a_largura_1234567890' }) });
  for (const largura of [620, 420, 360]) {
    await p.setViewportSize({ width: largura, height: 800 });
    for (const tela of ['dia', 'con']) {
      await p.evaluate((t) => document.querySelector(`[data-v="${t}"]`)?.click(), tela);
      // a barra lateral pode estar escondida em tela estreita: o clique direto no botao funciona mesmo assim
      await p.waitForSelector(`#v-${tela}.on .cardg`);
      await p.waitForTimeout(tela === 'dia' ? 700 : 300);
      const v = await vazamentos(p);
      ok(`${tela === 'dia' ? 'painel do dia' : 'conectores'} em ${largura} px: nada vaza pelas laterais`, v.length === 0, v.join(', '));
    }
  }
  await p.setViewportSize({ width: 1280, height: 800 });

  ok('conectores e painel do dia: sem erro no console', erros.length === 0, erros.join(' | '));
  await p.context().close();
}
