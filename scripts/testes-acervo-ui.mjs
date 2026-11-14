// Testes de interface da etapa 4 (memoria, skills, comandos e modelos de projeto). Chamado pelo testar-interface.mjs
// com o servidor isolado (claude de mentira e pasta .claude de mentira, so com skills).
export async function testarAcervo({ alvo, url, novaPagina, ok, vazamentos }) {
  console.log('acervo: memoria, skills, comandos e modelos (1280 px)');
  if (!alvo.servidor) {
    console.log('  [~~] sem servidor isolado: teste do acervo pulado');
    return;
  }
  const erros = [];
  const p = await novaPagina({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  p.on('console', (m) => {
    // 503 = o transcritor (Python) nao esta ligado neste teste; a interface da transcricao ja trata isso
    if (m.type() === 'error' && !/status of 503/.test(m.text())) erros.push('console: ' + m.text());
  });
  p.on('dialog', (d) => d.accept());
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForSelector('.topo');

  // ---------- memoria ----------
  await p.click('.lado button[data-v="mem"]');
  await p.waitForSelector('#v-mem.on .grade-acervo');
  await p.waitForSelector('#v-mem .linha-botao');
  ok('memoria: lista o arquivo inicial (preferencias)', (await p.locator('#v-mem .linha-botao', { hasText: 'preferencias' }).count()) === 1);
  ok('memoria: mostra quantos caracteres a IA le', await p.locator('#v-mem .nota-acervo', { hasText: 'caracteres que a IA lê' }).isVisible());
  ok('memoria: sem arquivo aberto, o salvar nao existe', (await p.locator('#v-mem textarea').count()) === 0);

  await p.click('#v-mem .linha-botao:has-text("preferencias")');
  await p.waitForSelector('#v-mem textarea[aria-label="Conteúdo de preferencias"]');
  const original = await p.inputValue('#v-mem textarea');
  ok('memoria: abre o arquivo no editor', original.includes('português'));
  ok('memoria: salvar comeca desligado', await p.locator('#v-mem button:has-text("salvar")').isDisabled());
  await p.fill('#v-mem textarea', original + '\n- gosto de cafe sem acucar\n');
  ok('memoria: editar liga o salvar e marca o arquivo como alterado', (await p.locator('#v-mem button:has-text("salvar")').isEnabled()) && (await p.locator('#v-mem .rotulo-editor').innerText()).includes('•'));
  await p.click('#v-mem button:has-text("salvar")');
  await p.waitForSelector('#v-mem .aviso-acervo.ok');
  const gravado = await (await fetch(`${alvo.url}/api/memoria/arquivo?nome=preferencias`, { headers: { cookie: alvo.servidor.cabecalhoCookie } })).json();
  ok('memoria: salvou de verdade no servidor', gravado.conteudo.includes('cafe sem acucar'));

  await p.click('#v-mem button:has-text("novo arquivo")');
  await p.fill('#v-mem input[aria-label="Nome do arquivo"]', 'nome ruim/../x');
  await p.click('#v-mem .form-acervo button:has-text("criar")');
  ok('memoria: nome invalido mostra o erro e nao cria', await p.locator('#v-mem .aviso-acervo.erro').isVisible());
  await p.fill('#v-mem input[aria-label="Nome do arquivo"]', 'areas/hrzz');
  await p.click('#v-mem .form-acervo button:has-text("criar")');
  await p.waitForSelector('#v-mem textarea[aria-label="Conteúdo de areas/hrzz"]');
  ok('memoria: arquivo novo em subpasta abre no editor', (await p.locator('#v-mem .linha-botao', { hasText: 'areas/hrzz' }).count()) === 1);
  await p.fill('#v-mem textarea', 'o HRZZ usa o estilo Retro Ledger');
  await p.click('#v-mem button:has-text("salvar")');
  await p.waitForSelector('#v-mem .aviso-acervo.ok');

  await p.click('#v-mem button:has-text("importar do claude.ai")');
  await p.fill('#v-mem textarea[aria-label="Texto da memória do claude.ai"]', '## Trabalho\nAnalista técnico.\n\n## Pessoal\nMora em BH.');
  await p.click('#v-mem .acoes-editor button.prim:has-text("importar")');
  await p.waitForSelector('#v-mem .linha-botao:has-text("claude-ai/trabalho")');
  ok('memoria: importar do claude.ai divide por titulo', (await p.locator('#v-mem .linha-botao', { hasText: 'claude-ai/' }).count()) === 2);

  const v1 = await vazamentos(p);
  ok('memoria: nada vaza em 1280 px', v1.length === 0, v1.join(', '));

  await p.click('#v-mem .linha-botao:has-text("claude-ai/pessoal")');
  await p.click('#v-mem button:has-text("apagar")');
  await p.waitForFunction(() => document.querySelectorAll('#v-mem .linha-botao').length === 3);
  ok('memoria: apagar tira o arquivo da lista', (await p.locator('#v-mem .linha-botao', { hasText: 'claude-ai/pessoal' }).count()) === 0);

  // ---------- skills ----------
  await p.click('.lado button[data-v="skl"]');
  await p.waitForSelector('#v-skl.on .linha-skill');
  const nomes = await p.locator('#v-skl .skill-nome').allInnerTexts();
  ok('skills: lista as da maquina (docx, xlsx, estilo-joao-pedro)', ['docx', 'xlsx', 'estilo-joao-pedro'].every((n) => nomes.includes(n)), nomes.join(','));
  ok('skills: as da anthropic ficam separadas', await p.locator('#v-skl .gr', { hasText: 'da anthropic' }).isVisible());
  const botaoDocx = p.locator('#v-skl .linha-skill', { hasText: /^docx/ }).locator('.chave');
  ok('skills: comecam ligadas', (await botaoDocx.getAttribute('aria-pressed')) === 'true');
  await botaoDocx.click();
  ok('skills: desligar muda o botao', (await botaoDocx.getAttribute('aria-pressed')) === 'false' && (await botaoDocx.innerText()) === 'desligada');

  // o projeto de exemplo (criado pelo prepararAlvo) tem as suas proprias chaves
  const opcoes = await p.locator('#escopo-skills option').allInnerTexts();
  ok('skills: o "vale para" lista os projetos', opcoes.length >= 2 && opcoes[0] === 'conversas sem projeto', opcoes.join('|'));
  await p.selectOption('#escopo-skills', { index: 1 });
  await p.waitForFunction(() => [...document.querySelectorAll('#v-skl .linha-skill')].find((l) => /^docx/.test(l.innerText))?.querySelector('.chave')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5000 }).catch(() => {});
  ok('skills: no projeto a docx continua ligada', (await p.locator('#v-skl .linha-skill', { hasText: /^docx/ }).locator('.chave').getAttribute('aria-pressed')) === 'true');
  await p.selectOption('#escopo-skills', { index: 0 });
  await p.waitForTimeout(250);
  ok('skills: de volta a "sem projeto", docx segue desligada', (await p.locator('#v-skl .linha-skill', { hasText: /^docx/ }).locator('.chave').getAttribute('aria-pressed')) === 'false');
  await p.reload({ waitUntil: 'load' });
  await p.click('.lado button[data-v="skl"]');
  await p.waitForSelector('#v-skl.on .linha-skill');
  ok('skills: a escolha fica gravada depois de recarregar', (await p.locator('#v-skl .linha-skill', { hasText: /^docx/ }).locator('.chave').getAttribute('aria-pressed')) === 'false');
  await p.locator('#v-skl .linha-skill', { hasText: /^docx/ }).locator('.chave').click();

  await p.click('#v-skl button:has-text("nova skill")');
  await p.fill('#v-skl input[aria-label="Nome"]', 'tom-de-oficio');
  await p.fill('#v-skl input[aria-label="Quando usar"]', 'ao redigir oficios formais');
  await p.fill('#v-skl textarea[aria-label="Instruções"]', 'Escreva em tom formal e impessoal.');
  await p.click('#v-skl form button:has-text("salvar")');
  await p.waitForSelector('#v-skl .skill-nome:has-text("tom-de-oficio")');
  ok('skills: skill nova aparece na lista, com botao editar', (await p.locator('#v-skl .linha-skill', { hasText: 'tom-de-oficio' }).locator('button:has-text("editar")').count()) === 1);
  await p.locator('#v-skl .linha-skill', { hasText: 'tom-de-oficio' }).locator('button:has-text("editar")').click();
  ok('skills: editar traz o texto de volta', (await p.inputValue('#v-skl textarea[aria-label="Instruções"]')).includes('impessoal'));
  await p.click('#v-skl form button:has-text("apagar")');
  await p.waitForFunction(() => !document.querySelector('#v-skl .skill-nome[title*="oficios"]'));
  ok('skills: apagar remove a skill', (await p.locator('#v-skl .skill-nome', { hasText: 'tom-de-oficio' }).count()) === 0);

  // ---------- comandos ----------
  const cmds = await p.locator('#v-skl .linha-botao .mono').allInnerTexts();
  ok('comandos: ata, grillme, revisar e site-loja', cmds.join(',') === '/ata,/grillme,/revisar,/site-loja', cmds.join(','));
  ok('comandos: /ata aparece como embutido e nao abre editor', (await p.locator('#v-skl .linha-botao:has-text("/ata")').isDisabled()));
  await p.click('#v-skl button:has-text("novo comando")');
  await p.fill('#v-skl input[aria-label="Nome"]', 'resumo');
  await p.fill('#v-skl input[aria-label="Descrição"]', 'resume em tres linhas');
  await p.fill('#v-skl textarea[aria-label="Pedido"]', 'Resuma em tres linhas: {{texto}}');
  await p.click('#v-skl form button:has-text("salvar")');
  await p.waitForSelector('#v-skl .linha-botao:has-text("/resumo")');
  ok('comandos: comando novo aparece na lista', true);

  const v2 = await vazamentos(p);
  ok('skills: nada vaza em 1280 px', v2.length === 0, v2.join(', '));

  // ---------- menu "/" no chat ----------
  await p.click('.lado .nova');
  const campo = p.locator('textarea[aria-label="Mensagem"]');
  await campo.click();
  await campo.fill('/');
  await p.waitForSelector('.menu-comandos');
  const itens = await p.locator('.menu-comandos .nome-cmd').allInnerTexts();
  ok('chat: "/" abre o menu com os comandos', itens.join(',') === '/ata,/grillme,/resumo,/revisar,/site-loja', itens.join(','));
  await campo.fill('/re');
  ok('chat: digitar filtra o menu', (await p.locator('.menu-comandos .nome-cmd').allInnerTexts()).join(',') === '/resumo,/revisar');
  await p.keyboard.press('ArrowDown');
  ok('chat: seta pra baixo muda o item marcado', (await p.locator('.menu-comandos .it.ativo .nome-cmd').innerText()) === '/revisar');
  await p.keyboard.press('Enter');
  ok('chat: enter escolhe o comando (e nao envia)', (await campo.inputValue()) === '/revisar ' && (await p.locator('.menu-comandos').count()) === 0);
  await campo.fill('/gr');
  await p.keyboard.press('Tab');
  ok('chat: tab completa', (await campo.inputValue()) === '/grillme ');
  await campo.fill('/ata');
  await p.keyboard.press('Escape');
  ok('chat: esc fecha o menu', (await p.locator('.menu-comandos').count()) === 0);
  await campo.fill('/s');
  await p.locator('.menu-comandos .it', { hasText: '/site-loja' }).click();
  ok('chat: clicar escolhe o comando', (await campo.inputValue()) === '/site-loja ');
  await campo.fill('texto normal /com barra no meio');
  ok('chat: "/" no meio do texto nao abre o menu', (await p.locator('.menu-comandos').count()) === 0);
  await campo.fill('/resumo a reuniao de ontem');
  ok('chat: depois do espaco o menu fecha', (await p.locator('.menu-comandos').count()) === 0);
  await p.keyboard.press('Enter');
  await p.waitForSelector('.msg.eu, .mensagem.eu, .eu', { timeout: 5000 }).catch(() => {});
  await p.waitForFunction(() => document.body.innerText.includes('Resuma em tres linhas: a reuniao de ontem'), null, { timeout: 8000 }).catch(() => {});
  ok('chat: enviar "/resumo texto" manda o pedido do comando', (await p.locator('body').innerText()).includes('Resuma em tres linhas: a reuniao de ontem'));
  await p.waitForSelector('button[aria-label="Enviar"], button[aria-label="Parar"]');

  // ---------- modelos de projeto ----------
  await p.click('.lado button[data-v="skl"]');
  await p.click('#v-skl .linha-botao:has-text("relatório institucional")');
  ok('modelos: abre o formulario do modelo', await p.locator('#v-skl input[aria-label="Nome do projeto"]').isVisible());
  ok('modelos: criar comeca desligado sem nome', await p.locator('#v-skl button:has-text("criar projeto")').isDisabled());
  await p.fill('#v-skl input[aria-label="Nome do projeto"]', 'Relatorio de novembro');
  await p.click('#v-skl button:has-text("criar projeto")');
  await p.waitForSelector('#v-chat.on');
  await p.waitForSelector('.sugestao');
  ok('modelos: abre o chat com o pedido pronto pra completar', (await p.locator('.sugestao').innerText()) === 'pedido do modelo');
  await p.click('.sugestao');
  ok('modelos: o pedido vai pro campo de texto', (await p.locator('textarea[aria-label="Mensagem"]').inputValue()).includes('[assunto]'));
  ok('modelos: o projeto novo aparece na barra lateral', (await p.locator('.lado', { hasText: 'Relatorio de novembro' }).count()) >= 1);

  // ---------- telas estreitas, com editor aberto ----------
  for (const largura of [960, 620, 420, 360]) {
    await p.setViewportSize({ width: largura, height: 800 });
    await p.waitForTimeout(250);
    await p.click(largura <= 820 ? 'button[title="abrir barra lateral"], .lado button[data-v="mem"]' : '.lado button[data-v="mem"]').catch(() => {});
    await p.evaluate(() => document.querySelector('.lado button[data-v="mem"]')?.click());
    await p.waitForSelector('#v-mem.on');
    await p.waitForSelector('#v-mem .linha-botao');
    await p.click('#v-mem .linha-botao >> nth=0');
    await p.click('#v-mem button:has-text("importar do claude.ai")');
    const a = await vazamentos(p);
    ok(`memoria: nada vaza em ${largura} px (editor e importacao abertos)`, a.length === 0, a.join(', '));
    await p.evaluate(() => document.querySelector('.lado button[data-v="skl"]')?.click());
    await p.waitForSelector('#v-skl.on .linha-skill');
    await p.click('#v-skl button:has-text("novo comando")');
    const b = await vazamentos(p);
    ok(`skills: nada vaza em ${largura} px (editor aberto)`, b.length === 0, b.join(', '));
  }

  ok('acervo: nenhum erro no console', erros.length === 0, erros.join(' | '));
  await p.close();
}
