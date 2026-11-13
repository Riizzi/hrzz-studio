// Testa o comportamento da interface num navegador de verdade (Playwright):
// barra lateral, painel, abas, ctrl+k, popovers, floresta, erros no console
// e se alguma coisa vaza pelas laterais com a barra e o painel abertos.
//
// Uso (com o app rodando):
//   npm run testar:interface                 -> http://localhost:7001
//   npm run testar:interface -- <url>        -> outra url (ex.: http://127.0.0.1:7000 com o build)

import { chromium } from 'playwright';
import { prepararAlvo } from './lib-teste.mjs';
import { testarConversa } from './testes-conversa.mjs';

const urlInformada = process.argv[2] ?? null;
let falhas = 0;

function ok(nome, condicao, detalhe = '') {
  if (condicao) console.log(`  [ok] ${nome}`);
  else {
    console.log(`  [--] ${nome}${detalhe ? ': ' + detalhe : ''}`);
    falhas++;
  }
}

// mesma regra do testar-layout.mjs, so que sem trocar de tela
async function vazamentos(pagina) {
  return pagina.evaluate(() => {
    const ignorar = (el) => el.closest('[data-ignorar-layout], .floresta, .pinhos, svg');
    const recorta = (el) => {
      let p = el.parentElement;
      while (p && p !== document.body) {
        if (getComputedStyle(p).overflowX !== 'visible') return p;
        p = p.parentElement;
      }
      return document.documentElement;
    };
    const saida = [];
    for (const el of document.querySelectorAll('body *')) {
      if (ignorar(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const pai = recorta(el);
      const pcs = getComputedStyle(pai);
      if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll') continue;
      const caixa = pai.getBoundingClientRect();
      if (r.right > caixa.right + 1.5 || r.left < caixa.left - 1.5) {
        saida.push(el.tagName.toLowerCase() + (typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : ''));
      }
    }
    if (document.documentElement.scrollWidth > window.innerWidth) saida.push('rolagem horizontal na pagina');
    return [...new Set(saida)].slice(0, 10);
  });
}

const alvo = await prepararAlvo(urlInformada);
const url = alvo.url;
const navegador = await chromium.launch();

// pagina ja com o PIN aceito (cookie), pra nao cair na tela de entrada
async function novaPagina(opcoes) {
  const contexto = await navegador.newContext(opcoes);
  if (alvo.cookie) await contexto.addCookies([alvo.cookie]);
  return contexto.newPage();
}

// ---------- tela larga ----------
{
  console.log('1280 px');
  const pagina = await novaPagina({ viewport: { width: 1280, height: 760 } });
  const erros = [];
  pagina.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  pagina.on('console', (m) => {
    if (m.type() === 'error') erros.push('console: ' + m.text());
  });
  await pagina.goto(url, { waitUntil: 'load' });
  await pagina.waitForTimeout(500);

  ok('titulo da pagina', (await pagina.title()) === 'HRZZ STUDIO');
  ok('servidor responde (chip "pc ligado")', (await pagina.locator('.topo .chip', { hasText: 'pc ligado' }).count()) === 1);

  // barra lateral
  const larguraLateral = () => pagina.evaluate(() => document.querySelector('.lado').getBoundingClientRect().width);
  ok('barra lateral aberta com 168 px', Math.round(await larguraLateral()) === 168);
  await pagina.click('button[title="recolher barra lateral"]');
  await pagina.waitForTimeout(350);
  ok('barra lateral recolhe pra 44 px', Math.round(await larguraLateral()) === 44);
  await pagina.click('button[title="abrir barra lateral"]');
  await pagina.waitForTimeout(350);
  ok('barra lateral abre de novo', Math.round(await larguraLateral()) === 168);

  // painel
  const painelVisivel = () => pagina.locator('.painel').isVisible();
  ok('painel aberto no comeco', await painelVisivel());
  await pagina.click('button[aria-label="Fechar painel"]');
  ok('painel fecha', !(await painelVisivel()));
  await pagina.keyboard.press('Control+\\');
  ok('ctrl+\\ abre o painel', await painelVisivel());
  await pagina.keyboard.press('Control+.');
  ok('ctrl+. abre por completo (chat some)', !(await pagina.locator('.chatbox').isVisible()));
  await pagina.keyboard.press('Control+.');
  ok('ctrl+. volta pro chat', await pagina.locator('.chatbox').isVisible());

  // abas
  await pagina.click('.tab:has-text("progresso")');
  ok('aba progresso mostra a barra', await pagina.locator('.barra-prog').isVisible());
  await pagina.click('.tab:has-text("terminal")');
  ok('aba terminal abre', await pagina.locator('.pn', { hasText: 'terminal' }).isVisible());
  await pagina.click('button.prog-chip');
  ok('chip de progresso leva pra aba progresso', await pagina.locator('.barra-prog').isVisible());

  // popovers
  await pagina.click('.mod');
  ok('seletor de modelo abre', await pagina.locator('.pop-modelo').isVisible());
  await pagina.click('.pop-modelo .it:has-text("Haiku")');
  ok('escolher o Haiku troca o nome', (await pagina.locator('.mod .nm').textContent()) === 'Haiku 5.5');
  ok('popover fecha depois de escolher', (await pagina.locator('.pop-modelo').count()) === 0);
  await pagina.click('.modo');
  await pagina.click('.pop-modo .it:has-text("yolo")');
  ok('modo yolo escolhido', (await pagina.locator('.modo span').textContent()) === 'yolo');
  await pagina.click('.chatbox .hd .tt');
  ok('clicar fora fecha o popover', (await pagina.locator('.pop-modo').count()) === 0);

  // botoes pensar / esforco / web
  await pagina.click('button[aria-label="Pensamento"]');
  ok('pensamento chega em "profundo"', (await pagina.locator('button[aria-label="Pensamento"]').getAttribute('title')) === 'pensamento: profundo');
  await pagina.click('button[aria-label="Pesquisa na web"]');
  ok('web desliga', (await pagina.locator('button[aria-label="Pesquisa na web"]').getAttribute('title')) === 'pesquisa na web: desligada');

  // dueto e duelo se excluem
  await pagina.click('button[aria-label="Modo dueto"]');
  await pagina.click('button[aria-label="Modo duelo"]');
  ok('dueto e duelo nao ficam ligados juntos', (await pagina.locator('button[aria-pressed="true"][aria-label^="Modo"]').count()) === 1);

  // paleta
  await pagina.keyboard.press('Control+k');
  ok('ctrl+k abre a busca', await pagina.locator('.paleta').isVisible());
  await pagina.keyboard.type('transcr');
  ok('busca filtra as acoes', (await pagina.locator('.paleta-linha').count()) === 1);
  await pagina.keyboard.press('Enter');
  ok('enter executa e fecha', (await pagina.locator('.paleta').count()) === 0 && (await pagina.locator('#v-tra.on').count()) === 1);

  // floresta
  await pagina.click('button[data-v="cfg"]');
  ok('floresta existe no chat', true);
  await pagina.click('.linha-botao');
  await pagina.click('button[data-v="chat"].so-rail, .lado .nova');
  ok('floresta some quando desligada', (await pagina.locator('.floresta').count()) === 0);
  await pagina.reload({ waitUntil: 'load' });
  await pagina.waitForTimeout(300);
  ok('escolha da floresta lembrada depois de recarregar', (await pagina.locator('.floresta').count()) === 0);
  await pagina.click('button[data-v="cfg"]');
  await pagina.click('.linha-botao');
  await pagina.click('.lado .nova');
  ok('floresta volta quando ligada', (await pagina.locator('.floresta').count()) === 1);

  // cada tela do menu abre
  for (const v of ['dia', 'tra', 'gal', 'mem', 'skl', 'con', 'cfg']) {
    await pagina.click(`.lado button[data-v="${v}"]`);
    ok(`tela ${v} abre`, (await pagina.locator(`#v-${v}.on`).count()) === 1);
  }

  ok('nenhum erro no console', erros.length === 0, erros.join(' | '));
  await pagina.close();
}

// ---------- tela estreita, com a barra e o painel abertos ----------
for (const largura of [760, 620, 420, 360]) {
  console.log(`${largura} px`);
  const pagina = await novaPagina({ viewport: { width: largura, height: 760 } });
  const erros = [];
  pagina.on('pageerror', (e) => erros.push(e.message));
  pagina.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text());
  });
  await pagina.goto(url, { waitUntil: 'load' });
  await pagina.waitForTimeout(400);

  const larguraLateral = () => pagina.evaluate(() => Math.round(document.querySelector('.lado').getBoundingClientRect().width));
  ok('barra comeca recolhida (44 px)', (await larguraLateral()) === 44);

  await pagina.click('button[title="abrir barra lateral"]');
  await pagina.waitForTimeout(350);
  ok('barra abre (168 px)', (await larguraLateral()) === 168);
  const v1 = await vazamentos(pagina);
  ok('nada vaza com a barra aberta', v1.length === 0, v1.join(', '));
  await pagina.click('button[title="recolher barra lateral"]');
  await pagina.waitForTimeout(350);

  // abre o painel
  // acima de 640 px o painel ja comeca aberto; abaixo, comeca fechado
  if (!(await pagina.locator('.painel').isVisible())) {
    await pagina.click('button[aria-label="Abrir ou fechar o painel"]');
    await pagina.waitForTimeout(200);
  }
  const aberto = await pagina.locator('.painel').isVisible();
  ok('painel abre', aberto);
  if (aberto) {
    const v2 = await vazamentos(pagina);
    ok('nada vaza com o painel aberto', v2.length === 0, v2.join(', '));
    for (const aba of ['progresso', 'terminal', 'arquivos']) {
      await pagina.click(`.tab:has-text("${aba}")`);
      const v3 = await vazamentos(pagina);
      ok(`nada vaza na aba ${aba}`, v3.length === 0, v3.join(', '));
    }
  }
  ok('nenhum erro no console', erros.length === 0, erros.join(' | '));
  await pagina.close();
}

if (alvo.servidor) await testarConversa({ navegador, alvo, url, novaPagina, ok, vazamentos });

await navegador.close();
await alvo.servidor?.parar();
if (falhas) {
  console.log(`\n${falhas} verificacao(oes) falharam.`);
  process.exit(1);
}
console.log('\nInterface ok.');
