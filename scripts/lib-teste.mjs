// Sobe um HRZZ isolado so pros testes: pasta de dados temporaria, porta 7090 e um "claude" de mentira
// (scripts/claude-falso.mjs), pra nao mexer nos dados do Joao nem gastar a assinatura.
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const PIN = '2468';

function garantirBuild() {
  const pronto = existsSync(join(raiz, 'apps', 'servidor', 'dist', 'index.js')) && existsSync(join(raiz, 'apps', 'web', 'dist', 'index.html'));
  if (pronto && !process.env.HRZZ_REFAZER_BUILD) return;
  console.log('compilando (npm run build)...');
  const r = spawnSync('npm', ['run', 'build'], { cwd: raiz, stdio: 'inherit', shell: true });
  if (r.status !== 0) throw new Error('o build falhou');
}

function criarFalso(pasta) {
  const script = join(raiz, 'scripts', 'claude-falso.mjs');
  if (process.platform === 'win32') {
    const cmd = join(pasta, 'claude-falso.cmd');
    writeFileSync(cmd, `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`);
    return cmd;
  }
  const sh = join(pasta, 'claude-falso.sh');
  writeFileSync(sh, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
  chmodSync(sh, 0o755);
  return sh;
}

export async function subirServidorDeTeste({ porta = 7090 } = {}) {
  garantirBuild();
  const pasta = mkdtempSync(join(tmpdir(), 'hrzz-ui-'));
  const filho = spawn(process.execPath, [join(raiz, 'apps', 'servidor', 'dist', 'index.js')], {
    cwd: raiz,
    env: { ...process.env, HRZZ_PORTA: String(porta), HRZZ_DADOS: pasta, HRZZ_CLAUDE: criarFalso(pasta), HRZZ_AGY: join(pasta, 'agy-que-nao-existe') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let saida = '';
  filho.stdout.on('data', (d) => (saida += d));
  filho.stderr.on('data', (d) => (saida += d));
  const url = `http://127.0.0.1:${porta}`;
  const inicio = Date.now();
  for (;;) {
    try {
      const r = await fetch(`${url}/api/saude`);
      if (r.ok) break;
    } catch {
      /* ainda subindo */
    }
    if (Date.now() - inicio > 15000) {
      filho.kill();
      throw new Error('o servidor de teste nao subiu: ' + saida);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  const def = await fetch(`${url}/api/auth/pin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: PIN }) });
  const cookie = String(def.headers.get('set-cookie')).split(';')[0];
  const [nome, valor] = [cookie.slice(0, cookie.indexOf('=')), cookie.slice(cookie.indexOf('=') + 1)];

  return {
    url,
    pin: PIN,
    cookie: { name: nome, value: valor, url },
    cabecalhoCookie: cookie,
    async parar() {
      filho.kill();
      await new Promise((r) => setTimeout(r, 300));
      try {
        rmSync(pasta, { recursive: true, force: true });
      } catch {
        /* o Windows pode segurar o arquivo do banco por um instante */
      }
    },
  };
}

// manda uma mensagem pelo WebSocket e espera a resposta terminar (usa o pacote ws, que ja vem com o servidor)
export async function conversarPeloWs({ url, cabecalhoCookie }, mensagem) {
  const { default: WebSocket } = await import('ws');
  const ws = new WebSocket(url.replace('http', 'ws') + '/api/ws', { headers: { cookie: cabecalhoCookie } });
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  const fim = new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('a conversa de teste nao terminou')), 20000);
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.tipo === 'fim') {
        clearTimeout(t);
        res(m);
      }
    });
  });
  ws.send(JSON.stringify({ tipo: 'enviar', modo: 'mid', modelo: 'auto', ...mensagem }));
  const r = await fim;
  ws.close();
  return r;
}

// Entra num HRZZ que ja esta rodando (ex.: o dev em 7001) usando o PIN de HRZZ_PIN.
export async function cookieDeLogin(url, pin) {
  const r = await fetch(`${url}/api/auth/entrar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) });
  if (!r.ok) throw new Error(`nao consegui entrar com o PIN (HRZZ_PIN): ${r.status}`);
  const c = String(r.headers.get('set-cookie')).split(';')[0];
  return { name: c.slice(0, c.indexOf('=')), value: c.slice(c.indexOf('=') + 1), url };
}

// Prepara o alvo dos testes: por padrao sobe o servidor isolado; com uma url, usa o app que ja esta rodando.
export async function prepararAlvo(urlInformada) {
  if (urlInformada) {
    const cookie = process.env.HRZZ_PIN ? await cookieDeLogin(urlInformada, process.env.HRZZ_PIN) : null;
    return { url: urlInformada, cookie, servidor: null };
  }
  const servidor = await subirServidorDeTeste();
  await conversarPeloWs(servidor, { texto: 'crie um site de loja e confira o menu do celular' });
  return { url: servidor.url, cookie: servidor.cookie, servidor };
}
