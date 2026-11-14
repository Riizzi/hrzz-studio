// Testes de interface da etapa 2 (preview, versoes, editar texto, rabisco, antes/depois, terminal, arquivos, galeria).
// Chamado pelo testar-interface.mjs com o servidor isolado (claude de mentira que escreve um index.html de verdade).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function testarTrabalho({ navegador, alvo, url, novaPagina, ok, vazamentos }) {
  console.log('trabalho: preview, versoes, terminal e arquivos (1280 px)');
  const servidor = alvo.servidor;
  const pasta = join(servidor.pasta, 'projeto-exemplo');
  const arquivo = join(pasta, 'index.html');
  const lerSite = () => readFileSync(arquivo, 'utf8');

  const erros = [];
  const p = await novaPagina({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  p.on('console', (m) => {
    if (m.type() === 'error') erros.push('console: ' + m.text());
  });
  p.on('dialog', (d) => d.accept());
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForSelector('.topo');

  // abre a conversa que esta dentro do projeto
  await p.locator('.conv-abrir', { hasText: 'criar-site' }).first().evaluate((e) => e.click());
  await p.waitForSelector('.msg.ia');
  await p.click('.tab:has-text("preview")');

  // ---------- servidor do preview ----------
  await p.waitForSelector('button:has-text("abrir o site (index.html)")', { timeout: 8000 });
  ok('sem servidor: oferece abrir o index.html', await p.locator('button:has-text("abrir o site (index.html)")').isVisible());
  ok('faixa mostra "sem servidor"', (await p.locator('.faixa .url').innerText()).includes('sem servidor'));
  await p.click('button:has-text("abrir o site (index.html)")');
  await p.waitForSelector('iframe.quadro', { timeout: 10000 });
  ok('faixa mostra a porta do servidor', /^:\d+$/.test((await p.locator('.faixa .url').innerText()).trim()));
  const quadro = p.frameLocator('iframe.quadro');
  await quadro.locator('h1').waitFor({ timeout: 10000 });
  ok('o site aparece no iframe (pelo proxy /preview/porta)', (await quadro.locator('h1').innerText()).includes('Enxergue bem'));
  const frame = p.frames().find((f) => f.url().includes('/preview/'));
  ok('o hrzz-preview.js foi injetado na pagina', frame ? await frame.evaluate(() => window.__hrzzPreview === true) : false);
  ok('a pagina do preview esta na mesma origem do HRZZ', frame ? new URL(frame.url()).origin === new URL(url).origin : false);
  ok('botao "abrir por completo" aponta pra /preview/porta', /\/preview\/\d+\//.test((await p.locator('a[aria-label^="Abrir por completo"]').getAttribute('href')) ?? ''));

  // ---------- celular ----------
  await p.click('button[aria-label="Ver no celular"]');
  await p.waitForTimeout(450);
  ok('ver no celular deixa o site com 360 px', Math.round(await p.locator('.site').evaluate((e) => e.getBoundingClientRect().width)) === 360);
  await p.click('button[aria-label="Ver no celular"]');
  await p.waitForTimeout(450);

  // ---------- editar texto ----------
  await p.click('button[aria-label="Editar texto"]');
  await p.waitForTimeout(200);
  await quadro.locator('h1').click();
  await p.keyboard.press('Control+A');
  await p.keyboard.type('Veja melhor, com estilo.');
  await p.keyboard.press('Enter');
  await p.waitForSelector('.dica:has-text("gravei em index.html")', { timeout: 8000 });
  ok('texto simples grava direto no arquivo-fonte', lerSite().includes('<h1>Veja melhor, com estilo.</h1>'));
  ok('o botao "desfazer" liga depois da edicao', await p.locator('button[aria-label="Desfazer última mudança"]').isEnabled());

  // texto que aparece em dois lugares vai pro Claude (o modo editar continua ligado)
  await quadro.locator('.cartao span').first().click();
  await p.keyboard.press('Control+A');
  await p.keyboard.type('Saber mais');
  await p.keyboard.press('Enter');
  await p.waitForSelector('button:has-text("mandar pro Claude")', { timeout: 8000 });
  ok('texto repetido nao grava e oferece mandar pro Claude', !lerSite().includes('Saber mais') && (await p.locator('.dica').innerText()).includes('2 lugares'));
  await p.click('button:has-text("deixar")');

  // ---------- desfazer ----------
  if (await p.locator('button[aria-label="Editar texto"][aria-pressed="true"]').count()) await p.click('button[aria-label="Editar texto"]');
  await p.click('button[aria-label="Desfazer última mudança"]');
  await p.waitForSelector('.dica:has-text("voltei")', { timeout: 8000 });
  ok('desfazer devolve o texto de antes', lerSite().includes('<h1>Enxergue bem, com estilo.</h1>'));
  await p.waitForTimeout(600);
  ok('o preview recarrega com o texto de antes', (await quadro.locator('h1').innerText()).includes('Enxergue bem'));

  // ---------- versoes ----------
  await p.click('button[aria-label="Salvar versão"]');
  await p.fill('input[aria-label="Nome da versão"]', 'primeira tela');
  await p.click('button:has-text("salvar versão")');
  await p.waitForSelector('.dica:has-text("v1 salva")', { timeout: 15000 });
  ok('salvar versao cria a v1 (com captura da tela)', /v1/.test(await p.locator('.faixa .com-texto').innerText()) && !(await p.locator('.dica').innerText()).includes('sem captura'));

  // muda o site pra ter o que comparar
  await p.click('button[aria-label="Editar texto"]');
  await p.waitForTimeout(200);
  await quadro.locator('h1').click();
  await p.keyboard.press('Control+A');
  await p.keyboard.type('Segunda tela');
  await p.keyboard.press('Enter');
  await p.waitForSelector('.dica:has-text("gravei em index.html")', { timeout: 8000 });
  await p.click('button[aria-label="Editar texto"]');
  await p.click('button[aria-label="Versões salvas"]');
  ok('lista de versoes mostra a v1 com o nome', (await p.locator('.pop-versoes').innerText()).includes('primeira tela'));
  await p.click('.pop-versoes button:has-text("comparar")');

  // ---------- antes e depois ----------
  await p.waitForSelector('.site img.cap.depois', { timeout: 20000 });
  await p.waitForSelector('.cap-velho img.cap', { timeout: 20000 });
  ok('antes e depois mostra as duas capturas', (await p.locator('.site img.cap').count()) === 2);
  await p.locator('input[aria-label="Antes e depois"]').fill('20');
  ok('o controle desliza a divisa', /inset\(0px 80%/.test((await p.locator('.cap-velho').getAttribute('style')) ?? '') || /80%/.test((await p.locator('.cap-velho').getAttribute('style')) ?? ''));
  await p.click('button[aria-label="Antes e depois"]');

  // ---------- rabiscar ----------
  await p.click('button[aria-label="Rabiscar"]');
  const caixa = await p.locator('canvas.tela').boundingBox();
  await p.mouse.move(caixa.x + 40, caixa.y + 40);
  await p.mouse.down();
  await p.mouse.move(caixa.x + 120, caixa.y + 90, { steps: 6 });
  await p.mouse.move(caixa.x + 60, caixa.y + 130, { steps: 6 });
  await p.mouse.up();
  await p.click('button:has-text("anexar")');
  await p.waitForSelector('.chip-anexo', { timeout: 20000 });
  ok('o rabisco vira anexo da proxima mensagem', /rabisco-/.test(await p.locator('.chip-anexo').innerText()));
  await p.click('.chip-anexo .x');

  // ---------- o painel abre sozinho quando a IA mexe no projeto ----------
  await p.click('button[aria-label="Fechar painel"]');
  ok('painel fechado', !(await p.locator('.painel').isVisible()));
  await p.fill('textarea[aria-label="Mensagem"]', 'criar-site de novo');
  await p.press('textarea[aria-label="Mensagem"]', 'Enter');
  await p.waitForSelector('.painel', { state: 'visible', timeout: 15000 });
  ok('o painel abre sozinho quando a IA mexe nos arquivos', await p.locator('.painel').isVisible());
  ok('a aba preview fica na frente', (await p.locator('.painel .tab.on').innerText()).trim() === 'preview');
  await p.waitForSelector('button[aria-label="Enviar"]', { timeout: 15000 });
  await p.waitForTimeout(500);
  // desligado nos ajustes, nao abre
  await p.click('button[aria-label="Fechar painel"]');
  await p.click('.lado button[data-v="cfg"]');
  await p.click('button:has-text("abrir o painel sozinho")');
  ok('ajuste "abrir o painel sozinho" desliga', (await p.locator('button:has-text("abrir o painel sozinho") .tag').innerText()) === 'desligado');
  await p.click('button:has-text("abrir o painel sozinho")');
  await p.locator('.conv-abrir', { hasText: 'criar-site' }).first().evaluate((e) => e.click());
  await p.waitForSelector('.msg.ia');

  // ---------- terminal ----------
  await p.keyboard.press('Control+\\');
  await p.click('.tab:has-text("terminal")');
  await p.waitForSelector('.xterm', { timeout: 10000 });
  await p.waitForTimeout(1200);
  await p.locator('.xterm').click();
  await p.keyboard.type(process.platform === 'win32' ? 'echo oi-%CD%' : 'echo oi-$PWD');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.querySelector('.xterm-rows')?.textContent?.includes('projeto-exemplo'), null, { timeout: 10000 });
  ok('terminal roda na pasta do projeto', true);
  await p.click('.tab:has-text("preview")');
  await p.click('.tab:has-text("terminal")');
  await p.waitForTimeout(300);
  ok('a sessao do terminal continua ao trocar de aba', (await p.locator('.xterm-rows').innerText()).includes('projeto-exemplo'));

  // ---------- arquivos ----------
  await p.click('.tab:has-text("arquivos")');
  await p.waitForSelector('.arq-linha:has-text("index.html")', { timeout: 8000 });
  ok('arvore mostra os arquivos do projeto', (await p.locator('.arq-linha').count()) >= 3);
  ok('arquivo mexido agora leva a etiqueta "editado"', (await p.locator('.arq-linha:has-text("index.html") .tag.am').count()) === 1);
  await p.click('.arq-linha:has-text("dados.csv")');
  await p.waitForSelector('.tabela-visor', { timeout: 8000 });
  ok('planilha csv abre em tabela', (await p.locator('.tabela-visor').innerText()).includes('lente'));
  await p.click('.visor-topo button');
  await p.click('.arq-linha:has-text("index.html")');
  await p.waitForSelector('.visor-texto');
  ok('arquivo de texto abre na pre-visualizacao', (await p.locator('.visor-texto').innerText()).includes('<h1>'));
  await p.click('.visor-topo button');
  await p.click('.arq-linha:has-text("fachada.png")');
  await p.waitForSelector('.visor-img');
  ok('imagem abre na pre-visualizacao', await p.locator('.visor-img').evaluate((i) => i.complete && i.naturalWidth > 0));

  // ---------- galeria ----------
  await p.click('.lado button[data-v="gal"]');
  await p.waitForSelector('.card-arquivo', { timeout: 8000 });
  ok('galeria lista os arquivos dos projetos', (await p.locator('.card-arquivo').count()) >= 3);
  await p.click('.filtro:has-text("planilhas")');
  ok('filtro "planilhas" mostra so planilhas', (await p.locator('.card-arquivo').count()) === 1 && (await p.locator('.card-arquivo').innerText()).includes('dados.csv'));
  await p.click('.filtro:has-text("artes")');
  ok('filtro "artes" mostra so imagens, com miniatura', (await p.locator('.card-arquivo').count()) >= 1 && (await p.locator('.card-arquivo').count()) === (await p.locator('.card-arquivo .thumb img').count()));
  await p.click('.card-arquivo');
  await p.waitForSelector('.visor-janela .visor-img');
  ok('clicar num card abre a pre-visualizacao', true);
  const vGal = await vazamentos(p);
  ok('nada vaza na galeria com a janela aberta', vGal.length === 0, vGal.join(', '));
  await p.click('.visor-janela button[aria-label="Fechar"]');
  await p.click('.filtro:has-text("todos")');

  ok('nenhum erro no console (trabalho)', erros.length === 0, erros.join(' | '));
  await p.close();

  // ---------- nada vaza pelas laterais, em todas as abas e ferramentas ----------
  for (const largura of [1280, 960, 760, 620, 420, 360]) {
    console.log(`trabalho (${largura} px)`);
    const q = await novaPagina({ viewport: { width: largura, height: 780 } });
    const errosQ = [];
    q.on('pageerror', (e) => errosQ.push('pageerror: ' + e.message));
    await q.goto(url, { waitUntil: 'load' });
    await q.waitForSelector('.topo');
    if (largura <= 820) {
      await q.click('button[title="abrir barra lateral"]');
      await q.waitForTimeout(300);
    }
    await q.locator('.conv-abrir', { hasText: 'criar-site' }).first().evaluate((e) => e.click());
    await q.waitForSelector('.msg.ia');
    if (largura <= 820) {
      await q.click('button[title="recolher barra lateral"]').catch(() => {});
      await q.waitForTimeout(300);
    }
    if (!(await q.locator('.painel').isVisible())) {
      await q.click('button[aria-label="Abrir ou fechar o painel"]');
      await q.waitForTimeout(200);
    }
    await q.click('.tab:has-text("preview")');
    const olha = async (nome) => {
      const v = await vazamentos(q);
      ok(`nada vaza: ${nome}`, v.length === 0, v.join(', '));
    };
    await q.waitForSelector('iframe.quadro, button:has-text("abrir o site (index.html)")', { timeout: 10000 });
    if (!(await q.locator('iframe.quadro').count())) {
      await olha('preview sem servidor');
      await q.click('button:has-text("abrir o site (index.html)")');
    }
    await q.waitForSelector('iframe.quadro', { timeout: 10000 });
    await olha('preview com o site');
    await q.click('button[aria-label="Ver no celular"]');
    await q.waitForTimeout(400);
    await olha('preview em modo celular');
    await q.click('button[aria-label="Ver no celular"]');
    await q.click('button[aria-label="Versões salvas"]');
    await olha('lista de versoes aberta');
    await q.click('button[aria-label="Versões salvas"]');
    await q.click('button[aria-label="Salvar versão"]');
    await olha('campo de nome da versao');
    await q.click('button:has-text("cancelar")');
    await q.click('button[aria-label="Rabiscar"]');
    await olha('rabiscar');
    await q.click('button[aria-label="Rabiscar"]');
    await q.click('button[aria-label="Editar texto"]');
    await olha('editar texto');
    await q.click('button[aria-label="Editar texto"]');
    for (const aba of ['terminal', 'arquivos']) {
      await q.click(`.tab:has-text("${aba}")`);
      await q.waitForTimeout(aba === 'terminal' ? 900 : 300);
      await olha(`aba ${aba}`);
    }
    await q.click('.arq-linha:has-text("dados.csv")');
    await q.waitForSelector('.tabela-visor');
    await olha('planilha aberta na aba arquivos');
    await q.click('.tab:has-text("preview")');
    await q.click('button:has-text("desligar servidor")');
    await q.close();
    ok(`sem erro de script (${largura} px)`, errosQ.length === 0, errosQ.join(' | '));
  }
}
