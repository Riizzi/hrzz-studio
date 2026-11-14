import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import WebSocket, { WebSocketServer } from 'ws';
import { construirApp } from '../app.js';
import { lerConfig } from '../config.js';
import { abrirBanco } from '../db.js';
import { CaminhoInvalido, caminhoSeguro, lerCsv, tipoDe } from './arquivos.js';
import { acharETrocar, variantes } from './edicao.js';
import { injetarScript, rotaDePreview, URL_SCRIPT } from './proxy.js';

function temp(prefixo: string): string {
  return mkdtempSync(join(tmpdir(), prefixo));
}

// ---------- unidades ----------
test('caminhoSeguro bloqueia ../ e caminho absoluto fora da raiz', () => {
  const raiz = temp('hrzz-seg-');
  try {
    writeFileSync(join(raiz, 'a.txt'), 'x');
    assert.equal(caminhoSeguro(raiz, 'a.txt'), join(raiz, 'a.txt'));
    assert.throws(() => caminhoSeguro(raiz, '../fora.txt'), CaminhoInvalido);
    assert.throws(() => caminhoSeguro(raiz, '..\\..\\fora.txt'), CaminhoInvalido);
    assert.throws(() => caminhoSeguro(raiz, 'sub/../../fora'), CaminhoInvalido);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('tipoDe e leitor de csv', () => {
  assert.equal(tipoDe('foto.PNG'), 'imagem');
  assert.equal(tipoDe('a.xlsx'), 'planilha');
  assert.equal(tipoDe('a.docx'), 'documento');
  assert.equal(tipoDe('Menu.astro'), 'codigo');
  assert.deepEqual(lerCsv('a;b\n"x;y";2\n'), [['a', 'b'], ['x;y', '2']]);
});

test('editar texto: uma ocorrencia grava, varias ou nenhuma nao', async () => {
  const pasta = temp('hrzz-edit-');
  try {
    mkdirSync(join(pasta, 'src'));
    mkdirSync(join(pasta, 'node_modules'));
    writeFileSync(join(pasta, 'src', 'index.html'), '<h1>Enxergue bem</h1>\n<p>Rock &amp; Roll</p>\n<p>Contato</p>');
    writeFileSync(join(pasta, 'src', 'sobre.html'), '<p>Contato</p>');
    writeFileSync(join(pasta, 'node_modules', 'x.html'), '<h1>Enxergue bem</h1>');

    let pontos = 0;
    const ok = await acharETrocar(pasta, 'Enxergue bem', 'Veja melhor', async () => void pontos++);
    assert.deepEqual(ok, { ok: true, arquivo: 'src/index.html', antesDe: 'Enxergue bem' });
    assert.equal(pontos, 1, 'ponto de retorno antes de gravar');
    assert.match(readFileSync(join(pasta, 'src', 'index.html'), 'utf8'), /<h1>Veja melhor<\/h1>/);
    assert.equal(readFileSync(join(pasta, 'node_modules', 'x.html'), 'utf8'), '<h1>Enxergue bem</h1>', 'node_modules intocado');

    const amb = await acharETrocar(pasta, 'Contato', 'Fale conosco');
    assert.equal(amb.ok, false);
    assert.equal(amb.ok === false && amb.motivo, 'ambiguo');
    assert.match(readFileSync(join(pasta, 'src', 'sobre.html'), 'utf8'), /Contato/, 'ambiguo nao grava');

    const nada = await acharETrocar(pasta, 'texto que nao existe', 'x');
    assert.equal(nada.ok === false && nada.motivo, 'nao-achei');

    // o navegador mostra "Rock & Roll"; no arquivo esta escrito com entidade
    const ent = await acharETrocar(pasta, 'Rock & Roll', 'Rock & Blues');
    assert.equal(ent.ok, true);
    assert.match(readFileSync(join(pasta, 'src', 'index.html'), 'utf8'), /Rock &amp; Blues/);
    assert.equal(variantes('a', 'b').length, 1);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('injetarScript entra logo depois do <head> e nao duplica', () => {
  const html = '<!doctype html><html><head><meta charset="utf-8"></head><body>oi</body></html>';
  const novo = injetarScript(html);
  assert.ok(novo.indexOf(URL_SCRIPT) < novo.indexOf('<meta'));
  assert.equal(injetarScript(novo), novo);
  assert.ok(injetarScript('<!doctype html><p>sem head</p>').startsWith('<!doctype html><script'));
});

test('rotaDePreview: prefixo, referer, documento redireciona, cookie so pra recurso e nao pra arquivo do HRZZ', () => {
  const web = temp('hrzz-web-');
  try {
    mkdirSync(join(web, 'assets'));
    writeFileSync(join(web, 'assets', 'app.js'), 'x');
    const req = (url: string, headers: Record<string, string> = {}) => ({ url, headers }) as never;
    const o = { webRaiz: web, proibidas: [7000] };

    assert.deepEqual(rotaDePreview(req('/preview/5173/a?x=1'), o), { porta: 5173, caminho: '/a?x=1' });
    assert.deepEqual(rotaDePreview(req('/preview/5173'), o), { porta: 5173, caminho: '/' });
    assert.equal(rotaDePreview(req('/preview/7000/'), o), null, 'a porta do proprio HRZZ nao entra');
    assert.equal(rotaDePreview(req('/preview/80/'), o), null, 'porta baixa nao entra');
    assert.equal(rotaDePreview(req('/api/conversas'), o), null);
    assert.equal(rotaDePreview(req('/'), o), null);

    // recurso pedido na raiz por uma pagina do preview
    assert.deepEqual(rotaDePreview(req('/src/main.js', { referer: 'http://localhost:7000/preview/4321/' }), o), { porta: 4321, caminho: '/src/main.js' });
    // navegacao de pagina ganha o prefixo
    assert.equal(rotaDePreview(req('/sobre', { referer: 'http://localhost:7000/preview/4321/', 'sec-fetch-dest': 'iframe' }), o)?.redirecionar, '/preview/4321/sobre');
    // modulo importado por outro modulo: referer sem prefixo, vale o cookie
    const mod = { referer: 'http://localhost:7000/src/main.js', cookie: 'hrzz_prev=4321', 'sec-fetch-site': 'same-origin', 'sec-fetch-dest': 'script' };
    assert.deepEqual(rotaDePreview(req('/src/util.js', mod), o), { porta: 4321, caminho: '/src/util.js' });
    // mas os arquivos do proprio HRZZ nunca sao desviados, nem pagina com cookie
    assert.equal(rotaDePreview(req('/assets/app.js', mod), o), null);
    assert.equal(rotaDePreview(req('/src/util.js', { ...mod, 'sec-fetch-dest': 'document' }), o), null);
  } finally {
    rmSync(web, { recursive: true, force: true });
  }
});

// ---------- integracao: HRZZ de verdade numa porta, com PIN ----------
async function subir() {
  const base = temp('hrzz-int-');
  const config = lerConfig({ HRZZ_DADOS: join(base, 'dados'), HRZZ_WEB: join(base, 'sem-web'), HRZZ_SHELL: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh' });
  const app = await construirApp(config, { banco: abrirBanco(':memory:') });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const porta = (app.server.address() as import('node:net').AddressInfo).port;
  const url = `http://127.0.0.1:${porta}`;
  const def = await fetch(`${url}/api/auth/pin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: '1234' }) });
  const cookie = String(def.headers.get('set-cookie')).split(';')[0];
  const api = async (caminho: string, corpo?: unknown, metodo?: string) => {
    const r = await fetch(url + caminho, { method: metodo ?? (corpo === undefined ? 'GET' : 'POST'), headers: { cookie, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    const t = await r.text();
    let j: any = null;
    try {
      j = JSON.parse(t);
    } catch {
      /* nao json */
    }
    return { status: r.status, json: j, texto: t, headers: r.headers };
  };
  const projeto = join(base, 'site');
  mkdirSync(projeto);
  const p = (await api('/api/projetos', { nome: 'site', pasta: projeto })).json as { id: number };
  return {
    app, url, porta, cookie, api, projeto, projetoId: p.id, base,
    async parar() {
      await app.close();
      await new Promise((r) => setTimeout(r, 300)); // o shell do terminal ainda esta saindo da pasta
      try {
        rmSync(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      } catch {
        /* o Windows pode segurar a pasta por um instante: e temporaria mesmo */
      }
    },
  };
}

function servidorFalso(): Promise<{ porta: number; fechar: () => void; wss: WebSocketServer; pedidos: string[] }> {
  const pedidos: string[] = [];
  const srv = http.createServer((req, res) => {
    pedidos.push(`${req.method} ${req.url} cookie=${req.headers.cookie ?? ''}`);
    if (req.url === '/' || req.url === '/sobre') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return void res.end('<!doctype html><html><head><title>falso</title></head><body><h1>Olá falso</h1><script type="module" src="/src/main.js"></script></body></html>');
    }
    if (req.url === '/src/main.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      return void res.end('console.log("main")');
    }
    if (req.url === '/vai') {
      res.writeHead(302, { location: '/sobre' });
      return void res.end();
    }
    res.writeHead(404);
    res.end('nao');
  });
  const wss = new WebSocketServer({ server: srv });
  wss.on('connection', (ws) => ws.on('message', (m, bin) => ws.send(m, { binary: bin })));
  return new Promise((res) => srv.listen(0, '127.0.0.1', () => res({ porta: (srv.address() as import('node:net').AddressInfo).port, fechar: () => { wss.close(); srv.close(); srv.closeAllConnections(); }, wss, pedidos })));
}

test('proxy do preview: exige PIN, injeta o script, nao vaza o cookie, reescreve redirect e faz ponte de WebSocket', async () => {
  const s = await subir();
  const falso = await servidorFalso();
  try {
    // sem PIN
    assert.equal((await fetch(`${s.url}/preview/${falso.porta}/`)).status, 401);

    const r = await fetch(`${s.url}/preview/${falso.porta}/`, { headers: { cookie: s.cookie } });
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.ok(html.includes('Olá falso'));
    assert.ok(html.includes(URL_SCRIPT), 'script injetado');
    assert.match(String(r.headers.get('set-cookie')), new RegExp(`hrzz_prev=${falso.porta}`));
    assert.ok(!falso.pedidos.some((p) => p.includes('hrzz_sessao')), 'o cookie do PIN nao chega no servidor do projeto');

    // recurso absoluto pedido pela pagina
    const js = await fetch(`${s.url}/src/main.js`, { headers: { cookie: s.cookie, referer: `${s.url}/preview/${falso.porta}/` } });
    assert.equal(js.status, 200);
    assert.equal(await js.text(), 'console.log("main")');
    // o mesmo pedido sem referer nao e desviado (cai na interface/404 do HRZZ)
    assert.notEqual(await (await fetch(`${s.url}/src/main.js`, { headers: { cookie: s.cookie } })).text(), 'console.log("main")');

    // redirect do projeto ganha o prefixo
    const red = await fetch(`${s.url}/preview/${falso.porta}/vai`, { headers: { cookie: s.cookie }, redirect: 'manual' });
    assert.equal(red.status, 302);
    assert.equal(red.headers.get('location'), `/preview/${falso.porta}/sobre`);

    // porta sem ninguem escutando: 502 legivel
    const morta = await fetch(`${s.url}/preview/59999/`, { headers: { cookie: s.cookie } });
    assert.equal(morta.status, 502);
    assert.match(await morta.text(), /não responde/);

    // script servido
    const sc = await s.api('/api/preview/hrzz-preview.js');
    assert.equal(sc.status, 200);
    assert.match(sc.texto, /__hrzzPreview/);

    // WebSocket (HMR): sem PIN recusa, com PIN o eco passa
    await assert.rejects(new Promise((res, rej) => { const w = new WebSocket(`ws://127.0.0.1:${s.porta}/preview/${falso.porta}/hmr`); w.on('open', res); w.on('error', rej); }));
    const eco = await new Promise<string>((res, rej) => {
      const w = new WebSocket(`ws://127.0.0.1:${s.porta}/preview/${falso.porta}/hmr`, { headers: { cookie: s.cookie } });
      w.on('open', () => w.send('ping-hmr'));
      w.on('message', (m) => { res(m.toString()); w.close(); });
      w.on('error', rej);
      setTimeout(() => rej(new Error('sem eco')), 4000);
    });
    assert.equal(eco, 'ping-hmr');
  } finally {
    falso.fechar();
    await s.parar();
  }
});

test('preview: detecta e serve index.html, editar texto, salvar versao, desfazer', async () => {
  const s = await subir();
  try {
    writeFileSync(join(s.projeto, 'index.html'), '<!doctype html><html><head><title>t</title></head><body><h1 id="t">Titulo velho</h1></body></html>');
    const q = `projeto=${s.projetoId}`;

    const est = await s.api(`/api/preview/estado?${q}`);
    assert.equal(est.json.preview.rodando, false);
    assert.ok(est.json.preview.opcoes.estatico);
    assert.equal(est.json.podeDesfazer, false);

    const ini = await s.api('/api/preview/iniciar', { projeto: s.projetoId });
    assert.equal(ini.status, 200);
    assert.equal(ini.json.preview.rodando, true);
    assert.equal(ini.json.preview.tipo, 'estatico');
    const porta = ini.json.preview.porta as number;

    const pag = await fetch(`${s.url}/preview/${porta}/`, { headers: { cookie: s.cookie } });
    assert.match(await pag.text(), /Titulo velho/);

    // versao v1 (sem navegador de captura nao quebra)
    const v1 = await s.api('/api/versoes', { projeto: s.projetoId, nome: 'comeco' });
    assert.equal(v1.status, 200);
    assert.equal(v1.json.versao.n, 1);

    // editar texto direto
    const ed = await s.api('/api/preview/editar-texto', { projeto: s.projetoId, antes: 'Titulo velho', depois: 'Titulo novo' });
    assert.equal(ed.json.ok, true);
    assert.match(readFileSync(join(s.projeto, 'index.html'), 'utf8'), /Titulo novo/);
    assert.equal((await s.api(`/api/preview/estado?${q}`)).json.podeDesfazer, true);

    // desfazer devolve o texto velho
    const d = await s.api('/api/desfazer', { projeto: s.projetoId });
    assert.equal(d.json.ok, true);
    assert.match(readFileSync(join(s.projeto, 'index.html'), 'utf8'), /Titulo velho/);

    // restaurar v1 depois de mexer
    writeFileSync(join(s.projeto, 'index.html'), '<h1>outra coisa</h1>');
    const rv = await s.api('/api/versoes/restaurar', { projeto: s.projetoId, n: 1 });
    assert.equal(rv.status, 200);
    assert.match(readFileSync(join(s.projeto, 'index.html'), 'utf8'), /Titulo velho/);
    assert.equal((await s.api('/api/versoes/restaurar', { projeto: s.projetoId, n: 99 })).status, 404);

    // porta dos outros: nao aceita a do proprio HRZZ
    assert.equal((await s.api('/api/preview/porta', { projeto: s.projetoId, porta: 7000 })).status, 400);

    const p = await s.api('/api/preview/parar', { projeto: s.projetoId });
    assert.equal(p.json.preview.rodando, false);
    assert.equal(existsSync(join(s.projeto, '.git')), false, 'a pasta do projeto nao ganhou .git');
  } finally {
    await s.parar();
  }
});

test('arquivos: lista, previa de texto/csv, download e bloqueio de ../', async () => {
  const s = await subir();
  try {
    mkdirSync(join(s.projeto, 'src'));
    mkdirSync(join(s.projeto, 'node_modules'));
    writeFileSync(join(s.projeto, 'src', 'a.astro'), '<h1>oi</h1>');
    writeFileSync(join(s.projeto, 'dados.csv'), 'nome,valor\nlente,10\n');
    writeFileSync(join(s.projeto, 'foto.png'), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    writeFileSync(join(s.projeto, '..', 'segredo.txt'), 'fora do projeto');
    const raiz = `p:${s.projetoId}`;

    const l = await s.api(`/api/arquivos?raiz=${raiz}`);
    assert.deepEqual(l.json.map((x: { nome: string }) => x.nome), ['src', 'dados.csv', 'foto.png']);
    assert.equal((await s.api(`/api/arquivos?raiz=${raiz}&caminho=src`)).json[0].caminho, 'src/a.astro');

    const t = await s.api(`/api/arquivos/previa?raiz=${raiz}&caminho=src/a.astro`);
    assert.equal(t.json.tipo, 'texto');
    assert.equal(t.json.conteudo, '<h1>oi</h1>');
    const c = await s.api(`/api/arquivos/previa?raiz=${raiz}&caminho=dados.csv`);
    assert.equal(c.json.tipo, 'planilha');
    assert.deepEqual(c.json.abas[0].linhas, [['nome', 'valor'], ['lente', '10']]);

    // xlsx e docx de verdade (feitos aqui mesmo)
    const ExcelJS = (await import('exceljs')).default;
    const livro = new ExcelJS.Workbook();
    const aba = livro.addWorksheet('Vendas');
    aba.addRow(['item', 'total']);
    aba.addRow(['lente', { formula: 'SUM(1,2)', result: 3 }]);
    aba.addRow(['aro', { formula: 'B2*2' }]);
    await livro.xlsx.writeFile(join(s.projeto, 'vendas.xlsx'));
    const x = await s.api(`/api/arquivos/previa?raiz=${raiz}&caminho=vendas.xlsx`);
    assert.equal(x.json.tipo, 'planilha');
    assert.equal(x.json.abas[0].nome, 'Vendas');
    assert.deepEqual(x.json.abas[0].linhas, [['item', 'total'], ['lente', '3'], ['aro', '=B2*2']]);

    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Relatorio de teste</w:t></w:r></w:p></w:body></w:document>');
    writeFileSync(join(s.projeto, 'relatorio.docx'), await zip.generateAsync({ type: 'nodebuffer' }));
    const d = await s.api(`/api/arquivos/previa?raiz=${raiz}&caminho=relatorio.docx`);
    assert.equal(d.json.tipo, 'documento');
    assert.match(d.json.html, /Relatorio de teste/);

    const pdf = await s.api(`/api/arquivos/previa?raiz=${raiz}&caminho=foto.png`);
    assert.equal(pdf.json.tipo, 'imagem');

    const img = await s.api(`/api/arquivos/baixar?raiz=${raiz}&caminho=foto.png`);
    assert.equal(img.headers.get('content-type'), 'image/png');

    for (const ruim of ['../segredo.txt', '..%2Fsegredo.txt', '..\\segredo.txt']) {
      const r = await s.api(`/api/arquivos/baixar?raiz=${raiz}&caminho=${ruim}`);
      assert.ok(r.status === 403 || r.status === 404, `bloqueou ${ruim} (${r.status})`);
      assert.ok(!r.texto.includes('fora do projeto'));
    }
    assert.equal((await s.api('/api/arquivos?raiz=p:999')).status, 404);

    const g = await s.api('/api/galeria?atualizar=1');
    assert.ok(g.json.some((x: { nome: string; tipo: string }) => x.nome === 'foto.png' && x.tipo === 'imagem'));
    assert.ok(g.json.some((x: { nome: string; tipo: string }) => x.nome === 'dados.csv' && x.tipo === 'planilha'));
    assert.ok(!g.json.some((x: { nome: string }) => x.nome === 'a.astro'), 'codigo fica fora da galeria');
  } finally {
    await s.parar();
  }
});

test('terminal: abre o shell na pasta do projeto, roda comando e mantem a sessao', async () => {
  const s = await subir();
  try {
    const abrir = () =>
      new Promise<{ ws: WebSocket; saida: () => string }>((res, rej) => {
        const ws = new WebSocket(`ws://127.0.0.1:${s.porta}/api/term?projeto=${s.projetoId}&cols=100&rows=30`, { headers: { cookie: s.cookie } });
        let acumulado = '';
        ws.on('message', (m) => {
          const d = JSON.parse(m.toString());
          if (d.t === 'o') acumulado += d.d;
        });
        ws.on('open', () => res({ ws, saida: () => acumulado }));
        ws.on('error', rej);
      });
    const esperar = async (f: () => boolean, ms = 8000) => {
      const fim = Date.now() + ms;
      while (!f()) {
        if (Date.now() > fim) throw new Error('tempo esgotado');
        await new Promise((r) => setTimeout(r, 100));
      }
    };
    // sem PIN nao abre
    await assert.rejects(new Promise((res, rej) => { const w = new WebSocket(`ws://127.0.0.1:${s.porta}/api/term?projeto=${s.projetoId}`); w.on('open', res); w.on('error', rej); }));

    const a = await abrir();
    a.ws.send(JSON.stringify({ t: 'd', d: process.platform === 'win32' ? 'echo hrzz-%CD%\r' : 'echo hrzz-$PWD\r' }));
    await esperar(() => a.saida().includes('hrzz-') && a.saida().toLowerCase().includes('site'));
    a.ws.close();

    // reabrir (troca de aba): a sessao continua e o historico volta
    const b = await abrir();
    await esperar(() => b.saida().includes('hrzz-'));
    b.ws.close();
  } finally {
    await s.parar();
  }
});
