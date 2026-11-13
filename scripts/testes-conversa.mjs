// Testes de interface da etapa 1 (PIN, conversa, progresso, projetos, busca, ajustes).
// Chamado pelo testar-interface.mjs com o servidor isolado (claude de mentira).

export async function testarConversa({ navegador, alvo, url, novaPagina, ok, vazamentos }) {
  console.log('conversa (1280 px)');

  // PIN: sem cookie cai na tela de entrada
  {
    const ctx = await navegador.newContext({ viewport: { width: 1280, height: 760 } });
    const p = await ctx.newPage();
    await p.goto(url, { waitUntil: 'load' });
    await p.waitForSelector('form[aria-label="Entrar com o PIN"]');
    ok('sem cookie aparece a tela do PIN', true);
    ok('a tela do PIN nao mostra a interface', (await p.locator('.topo').count()) === 0);
    await p.fill('input[aria-label="PIN"]', '1111');
    await p.click('button[type=submit]');
    await p.waitForSelector('.entrada-erro');
    ok('PIN errado mostra o erro', /PIN errado/.test(await p.locator('.entrada-erro').innerText()));
    await p.fill('input[aria-label="PIN"]', alvo.servidor.pin);
    await p.click('button[type=submit]');
    await p.waitForSelector('.topo');
    ok('PIN certo entra no HRZZ', true);
    await ctx.close();
  }

  const erros = [];
  const p = await novaPagina({ viewport: { width: 1280, height: 760 } });
  p.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  p.on('console', (m) => {
    if (m.type() === 'error') erros.push('console: ' + m.text());
  });
  p.on('dialog', (d) => d.accept());
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForSelector('.topo');

  ok('conversa de exemplo aparece em recentes', (await p.locator('.conv-abrir').count()) >= 1);
  await p.click('button[aria-label="Nova conversa"]');
  ok('conversa nova abre vazia', (await p.locator('.msg').count()) === 0);

  await p.fill('textarea[aria-label="Mensagem"]', 'oi, tudo bem?');
  await p.press('textarea[aria-label="Mensagem"]', 'Enter');
  ok('mensagem do usuario aparece na hora', (await p.locator('.msg.eu', { hasText: 'oi, tudo bem?' }).count()) === 1);
  await p.waitForSelector('.msg.ia .md', { timeout: 15000 });
  await p.waitForSelector('button[aria-label="Enviar"]', { timeout: 15000 });
  await p.waitForTimeout(600);
  ok('resposta em markdown (lista e tabela)', (await p.locator('.msg.ia .md li').count()) >= 3 && (await p.locator('.msg.ia .md table').count()) === 1);
  ok('blocos <progresso> e <pergunta> ficam escondidos', !(await p.locator('.msg.ia').innerText()).includes('<progresso>'));
  ok('uso de ferramenta visivel', (await p.locator('.ferr').count()) >= 2);
  ok('pensamento recolhido ("pensou por N s")', /pensou por \d+ s/.test(await p.locator('.pens').first().innerText()));
  ok('pensamento comeca fechado', (await p.locator('.pens-texto').count()) === 0);
  await p.click('.pens');
  ok('clicar abre o pensamento', (await p.locator('.pens-texto').count()) === 1);
  ok('"oi" escolhe o Sonnet sozinho', /Sonnet 5\.5/.test(await p.locator('.mod .nm').innerText()));
  ok('nome da conversa vem da primeira mensagem', /oi, tudo bem/.test(await p.locator('.hd .tt').innerText()));
  ok('chip de progresso mostra 1/3', /1\/3/.test(await p.locator('.prog-chip').innerText()));
  ok('chip de uso mostra 42%', /42%/.test(await p.locator('.topo .chip').first().innerText()));
  ok('nada vaza com a conversa aberta', (await vazamentos(p)).length === 0, (await vazamentos(p)).join(', '));

  // pergunta de multipla escolha
  await p.click('.pergunta button:has-text("pin")');
  await p.waitForSelector('.msg.eu:has-text("pin")');
  await p.waitForFunction(() => document.querySelectorAll('.msg.ia').length >= 2, null, { timeout: 15000 });
  ok('botao da pergunta manda a opcao como mensagem', (await p.locator('.msg.eu', { hasText: /^pin$/ }).count()) === 1);
  await p.waitForSelector('button[aria-label="Enviar"]', { timeout: 15000 });

  // progresso
  await p.click('.prog-chip');
  ok('chip abre a aba progresso', (await p.locator('.tab.on', { hasText: 'progresso' }).count()) === 1);
  ok('progresso: tres grupos (fazendo, a fazer, feito)', (await p.locator('.grupo').count()) === 3);
  ok('progresso: legenda com a contagem', /1\s*feitas/.test(await p.locator('.leg-prog').innerText()));
  await p.fill('.novo-it input', 'tarefa minha');
  await p.press('.novo-it input', 'Enter');
  await p.waitForSelector('.it2:has-text("tarefa minha")');
  ok('adicionar tarefa mostra a tag "voce"', /você/.test(await p.locator('.it2', { hasText: 'tarefa minha' }).innerText()));
  await p.click('.it2:has-text("tarefa minha") .ck');
  await p.waitForSelector('.it2.feito:has-text("tarefa minha")');
  ok('clicar na bolinha marca como feito', true);
  ok('nada vaza na aba progresso com itens', (await vazamentos(p)).length === 0, (await vazamentos(p)).join(', '));

  // modo e modelo
  await p.click('.modo');
  await p.click('.pop-modo .it:has-text("intern")');
  await p.waitForTimeout(200);
  ok('troca de modo vale pra conversa', /intern/.test(await p.locator('.modo').innerText()));
  await p.click('.mod');
  ok('seletor de modelo mostra Anthropic e Google', (await p.locator('.pop-modelo .emp').count()) === 2);
  ok('seletor tem a opcao automatico', (await p.locator('.pop-modelo .it', { hasText: 'automático' }).count()) === 1);
  await p.click('.pop-modelo .it:has-text("Haiku 5.5")');
  ok('trocar de modelo muda o botao', /Haiku 5\.5/.test(await p.locator('.mod .nm').innerText()));

  // anexo
  await p.setInputFiles('input[type=file]', { name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('texto de teste') });
  await p.waitForSelector('.chip-anexo');
  ok('anexo aparece como chip', /nota\.txt/.test(await p.locator('.chip-anexo').innerText()));

  // permissao negada
  await p.fill('textarea[aria-label="Mensagem"]', 'quero apagar a pasta dist');
  await p.press('textarea[aria-label="Mensagem"]', 'Enter');
  await p.waitForSelector('.perm', { timeout: 15000 });
  ok('pedido negado vira cartao de permissao', /apagar/.test(await p.locator('.perm').innerText()));
  await p.waitForSelector('button[aria-label="Enviar"]');
  await p.click('.perm button:has-text("pode sempre nesta conversa")');
  await p.waitForSelector('.perm-resp', { timeout: 15000 });
  ok('"pode sempre" fica registrado no cartao', /liberado nesta conversa/.test(await p.locator('.perm-resp').first().innerText()));
  await p.waitForSelector('button[aria-label="Enviar"]', { timeout: 15000 });

  // busca (ctrl+k) acha texto de dentro da conversa
  await p.keyboard.press('Control+k');
  await p.fill('input[aria-label="Buscar"]', 'menu do celular');
  await p.waitForSelector('.paleta-linha:has-text("crie um site")', { timeout: 5000 }).catch(() => {});
  ok('busca ctrl+k acha conversa pelo texto', (await p.locator('.paleta-linha:has-text("crie um site")').count()) >= 1);
  await p.keyboard.press('Escape');

  // projeto novo
  await p.click('button[aria-label="Novo projeto"]');
  await p.fill('input[aria-label="Nome do projeto"]', 'Meu Site');
  await p.click('.novo-proj button[type=submit]');
  await p.waitForSelector('.item-proj:has-text("Meu Site")');
  ok('projeto novo aparece na barra lateral', true);
  ok('conversa nova abre dentro do projeto', /Meu Site/.test(await p.locator('.vazio-titulo').innerText()));

  // ajustes: PIN e atualizacao
  await p.click('button[data-v="cfg"]');
  ok('ajustes: botao de trocar PIN', (await p.locator('button:has-text("trocar")').count()) === 1);
  ok('ajustes: atualizar e voltar versao', (await p.locator('.lin', { hasText: 'atualizações' }).count()) === 1 && (await p.locator('.lin', { hasText: 'voltar versão' }).count()) === 1);
  ok('ajustes: sair deste aparelho', (await p.locator('button:has-text("sair")').count()) === 1);

  // apagar conversa
  await p.click('button[data-v="dia"]');
  const antes = await p.locator('.conv-item').count();
  await p.locator('.conv-item').first().hover();
  await p.locator('.conv-apagar').first().click({ force: true });
  await p.waitForTimeout(500);
  ok('apagar conversa tira da lista', (await p.locator('.conv-item').count()) === antes - 1);

  ok('nenhum erro no console (conversa)', erros.length === 0, erros.join(' | '));
  await p.close();
}
