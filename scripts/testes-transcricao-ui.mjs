// Testes de interface da etapa 3 (tela de transcricao). Chamado pelo testar-interface.mjs com o servidor isolado
// que ja sobe o transcritor de teste (modelo tiny). Pula sozinho se o Python nao estiver instalado.
import { chromium } from 'playwright';
import { falaDeTeste } from './lib-teste.mjs';

export async function testarTranscricao({ alvo, url, novaPagina, ok, vazamentos }) {
  console.log('transcricao: tela, arquivo, fila, chat e galeria (1280 px)');
  const fala = falaDeTeste();
  if (!alvo.servidor?.transcritor || !fala) {
    console.log('  [~~] sem o ambiente Python ou sem voz sintetizada: teste da tela de transcricao pulado');
    return;
  }
  const erros = [];
  const p = await novaPagina({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  p.on('console', (m) => {
    // o 400 do link de teste ruim e de proposito: o navegador sempre registra resposta de erro
    if (m.type() === 'error' && !/status of 400/.test(m.text())) erros.push('console: ' + m.text());
  });
  p.on('dialog', (d) => d.accept());
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForSelector('.topo');
  await p.click('.lado button[data-v="tra"]');
  await p.waitForSelector('#v-tra.on .tr');

  ok('tres abas: arquivo, youtube e ao vivo', (await p.locator('#v-tra .tab').allInnerTexts()).join('|') === 'arquivo|youtube|ao vivo');
  ok('sem aviso de transcritor desligado', (await p.locator('#v-tra .erro-linha').count()) === 0);
  ok('a lista comeca vazia', await p.locator('#v-tra .vazio').isVisible());
  ok('o botao transcrever comeca desligado', await p.locator('#v-tra button:has-text("transcrever")').first().isDisabled());
  ok('idioma tem "automatico" e os 99 do Whisper', (await p.locator('#v-tra select[aria-label="idioma"] option').count()) === 100);

  // ---------- arquivo ----------
  await p.locator('#v-tra input[type=file]').setInputFiles(fala);
  ok('o arquivo escolhido aparece com o tamanho', (await p.locator('#v-tra .nota-tr', { hasText: 'hrzz-fala-pt.wav' }).count()) === 1);
  await p.selectOption('#v-tra select[aria-label="idioma"]', 'pt');
  await p.selectOption('#v-tra select[aria-label="modelo"]', 'tiny');
  await p.click('#v-tra button:has-text("transcrever")');
  await p.waitForSelector('#v-tra .tarefa', { timeout: 10000 });
  ok('a tarefa aparece na fila da tela', (await p.locator('#v-tra .tarefa').count()) >= 1);
  // a fila do topo mostra a tarefa enquanto ela roda
  const chipFila = p.locator('.topo .chip[title="fila de tarefas"]');
  let viuNaFila = false;
  for (let i = 0; i < 12 && !viuNaFila; i++) {
    viuNaFila = /^\s*[1-9]/.test((await chipFila.innerText()).trim());
    if (!viuNaFila) await p.waitForTimeout(150);
  }
  console.log(viuNaFila ? '  (a fila do topo contou a tarefa)' : '  (a tarefa terminou rapido demais pra ver a fila do topo)');

  await p.waitForSelector('#v-tra .item-tr', { timeout: 120000 });
  ok('a transcricao pronta entra na lista', (await p.locator('#v-tra .item-tr').count()) === 1);
  ok('o titulo vem do nome do arquivo', (await p.locator('#v-tra .nome-tr').first().innerText()) === 'hrzz-fala-pt');
  ok('links de .txt e .srt', (await p.locator('#v-tra .acoes-tr a[download]').evaluateAll((a) => a.map((x) => x.getAttribute('href').split('.').pop()))).join(',') === 'txt,srt');
  await p.locator('#v-tra .titulo-tr').first().click();
  await p.waitForSelector('#v-tra .texto-tr');
  ok('clicar no titulo mostra o texto', /bom dia/i.test(await p.locator('#v-tra .texto-tr').innerText()));
  await p.locator('#v-tra .titulo-tr').first().click();
  ok('clicar de novo esconde', (await p.locator('#v-tra .texto-tr').count()) === 0);

  // ---------- layout com a lista cheia ----------
  const v1 = await vazamentos(p);
  ok('nada vaza na tela de transcricao (1280 px)', v1.length === 0, v1.join(', '));

  // ---------- youtube: validacao ----------
  await p.click('#v-tra .tab:has-text("youtube")');
  ok('youtube: transcrever desligado sem link', await p.locator('#v-tra button:has-text("transcrever")').first().isDisabled());
  await p.fill('#v-tra input[aria-label="Link do vídeo"]', 'isto nao e um link');
  await p.click('#v-tra button:has-text("transcrever")');
  await p.waitForSelector('#v-tra .erro-linha');
  ok('youtube: link ruim mostra o motivo', /https/.test(await p.locator('#v-tra .erro-linha').innerText()));

  // ---------- mandar pro chat ----------
  await p.click('#v-tra .tab:has-text("arquivo")');
  await p.locator('#v-tra button[aria-label^="Mandar"]').first().click();
  await p.waitForSelector('#v-chat.on .chip-anexo', { timeout: 8000 });
  ok('mandar pro chat abre uma conversa nova com a transcricao anexada', /hrzz-fala-pt\.txt/.test(await p.locator('.chip-anexo').first().innerText()));
  ok('aparecem as 3 sugestoes (resumo, ata, topicos)', (await p.locator('.sugestoes .sugestao').allInnerTexts()).join('|') === 'resumo|ata|tópicos e encaminhamentos');
  await p.locator('.sugestoes .sugestao', { hasText: 'ata' }).click();
  ok('clicar numa sugestao preenche o campo', /ata da reuni/i.test(await p.locator('textarea[aria-label="Mensagem"]').inputValue()));

  // ---------- galeria ----------
  await p.click('.lado button[data-v="gal"]');
  await p.click('#v-gal .filtro:has-text("transcrições")');
  await p.waitForSelector('#v-gal .card-arquivo');
  ok('galeria: filtro "transcricoes" mostra a transcricao', (await p.locator('#v-gal .card-arquivo').count()) === 1 && /hrzz-fala-pt/.test(await p.locator('#v-gal .card-nome').innerText()));
  await p.locator('#v-gal .card-arquivo').first().click();
  await p.waitForSelector('.visor-janela');
  const apareceu = await p.waitForFunction(() => /bom dia/i.test(document.querySelector('.visor-janela')?.innerText ?? ''), null, { timeout: 8000 }).then(() => true, () => false);
  ok('galeria: abrir mostra o texto', apareceu, await p.locator('.visor-janela').innerText());
  await p.click('.visor-janela button[aria-label="Fechar"]');

  ok('nenhum erro no console (transcricao)', erros.length === 0, erros.join(' | '));
  await p.close();

  // ---------- ao vivo, com microfone de mentira (o proprio audio de teste) ----------
  console.log('transcricao: ao vivo no navegador (microfone de mentira)');
  const navegadorMic = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${fala}`] });
  try {
    const ctx = await navegadorMic.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['microphone'] });
    if (alvo.cookie) await ctx.addCookies([alvo.cookie]);
    const v = await ctx.newPage();
    const errosVivo = [];
    v.on('pageerror', (e) => errosVivo.push(e.message));
    await v.goto(url, { waitUntil: 'load' });
    await v.click('.lado button[data-v="tra"]');
    await v.click('#v-tra .tab:has-text("ao vivo")');
    await v.selectOption('#v-tra select[aria-label="Fonte do áudio"]', 'microfone');
    const opcaoPc = v.locator('#v-tra select[aria-label="Fonte do áudio"] option[value="pc"]');
    const pcLiberado = await v.waitForFunction(() => !document.querySelector('#v-tra select[aria-label="Fonte do áudio"] option[value="pc"]').disabled, null, { timeout: 10000 }).then(() => true, () => false);
    ok('ao vivo: "audio do PC" liberado no Windows', process.platform !== 'win32' || pcLiberado, String(await opcaoPc.isDisabled()));
    await v.selectOption('#v-tra select[aria-label="modelo"]', 'tiny');
    await v.selectOption('#v-tra select[aria-label="idioma"]', 'pt');
    await v.click('#v-tra button.gravar');
    await v.waitForSelector('#v-tra button.gravar.rec', { timeout: 60000 });
    ok('ao vivo: o botao vira "parar" gravando', /parar/.test(await v.locator('#v-tra button.gravar').innerText()));
    await v.waitForSelector('#v-tra .vivo .tm', { timeout: 40000 });
    ok('ao vivo: o texto parcial aparece com o tempo', (await v.locator('#v-tra .vivo .tm').count()) >= 1);
    await v.waitForTimeout(9000);
    ok('ao vivo: o relogio anda', (await v.locator('#v-tra .tempo').innerText()) !== '00:00');
    await v.click('#v-tra button.gravar');
    await v.waitForSelector('#v-tra button:has-text("refazer com o modelo grande")', { timeout: 90000 });
    ok('ao vivo: ao parar, salva e oferece refazer com o modelo grande', true);
    ok('ao vivo: a transcricao entra na lista', (await v.locator('#v-tra .sub-tr', { hasText: 'ao vivo' }).count()) === 1);
    ok('ao vivo: sem erro de pagina', errosVivo.length === 0, errosVivo.join(' | '));
    await ctx.close();
  } finally {
    await navegadorMic.close();
  }

  // ---------- layout em tela estreita, com a lista cheia ----------
  for (const largura of [960, 760, 620, 420, 360]) {
    const e = await novaPagina({ viewport: { width: largura, height: 800 } });
    await e.goto(url, { waitUntil: 'load' });
    await e.waitForSelector('.topo');
    if (largura <= 820) await e.click('button[title="abrir barra lateral"]');
    await e.click('.lado button[data-v="tra"]');
    await e.waitForSelector('#v-tra .item-tr');
    if (largura <= 820) await e.click('button[title="recolher barra lateral"]').catch(() => undefined);
    for (const aba of ['arquivo', 'youtube', 'ao vivo']) {
      await e.click(`#v-tra .tab:has-text("${aba}")`);
      const v = await vazamentos(e);
      ok(`nada vaza na transcricao, aba ${aba} (${largura} px)`, v.length === 0, v.join(', '));
    }
    await e.close();
  }
}
