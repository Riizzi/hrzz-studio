// Sobe o servico de transcricao (servicos/transcritor, Python) e sobe de novo se ele cair.
// Usado pelo npm run dev, pelo vigia e por "npm run transcritor". So node, sem dependencias.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raizPadrao = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));

export function pythonDoTranscritor(raiz) {
  const venv = join(raiz, 'servicos', 'transcritor', '.venv');
  return process.platform === 'win32' ? join(venv, 'Scripts', 'python.exe') : join(venv, 'bin', 'python');
}

// a chave que so o servidor do HRZZ e o transcritor conhecem (dados/segredos/transcritor.token)
export function tokenDoTranscritor(dados) {
  const pasta = join(dados, 'segredos');
  const arq = join(pasta, 'transcritor.token');
  if (existsSync(arq)) {
    const t = readFileSync(arq, 'utf8').trim();
    if (t) return t;
  }
  mkdirSync(pasta, { recursive: true });
  const t = randomBytes(24).toString('hex');
  writeFileSync(arq, t);
  try {
    chmodSync(arq, 0o600);
  } catch {
    /* windows: sem efeito */
  }
  return t;
}

// confere o ambiente Python; se faltar, roda uv sync. Devolve { ok, motivo }
export function prepararTranscritor(raiz, log) {
  const cwd = join(raiz, 'servicos', 'transcritor');
  if (existsSync(pythonDoTranscritor(raiz))) return { ok: true };
  log('transcritor: ambiente Python nao existe; rodando uv sync (pode demorar uns minutos)');
  const r = spawnSync('uv', ['sync'], { cwd, encoding: 'utf8', shell: process.platform === 'win32', windowsHide: true, timeout: 15 * 60 * 1000 });
  if (r.error || r.status !== 0) {
    return { ok: false, motivo: `uv sync falhou: ${r.error?.message ?? (r.stderr || r.stdout || '').slice(-300)}` };
  }
  return existsSync(pythonDoTranscritor(raiz)) ? { ok: true } : { ok: false, motivo: 'uv sync terminou mas o Python nao apareceu' };
}

// sobe e mantem de pe. Devolve { parar() }.
export function subirTranscritor({ raiz = raizPadrao, dados, log = () => {}, aoSaida = null } = {}) {
  const pastaDados = resolve(dados ?? process.env.HRZZ_DADOS ?? join(raiz, 'dados'));
  const pastaLogs = join(pastaDados, 'logs');
  mkdirSync(pastaLogs, { recursive: true });
  const arqLog = join(pastaLogs, 'transcritor.log');
  let filho = null;
  let encerrando = false;
  let falhas = 0;
  let timer = null;

  const escreve = (d) => {
    try {
      appendFileSync(arqLog, d);
    } catch {
      /* sem log */
    }
    if (aoSaida) aoSaida(String(d));
  };

  function subir() {
    if (encerrando) return;
    const prep = prepararTranscritor(raiz, log);
    if (!prep.ok) {
      log(`transcritor desligado: ${prep.motivo}`);
      escreve(`${new Date().toISOString()} desligado: ${prep.motivo}\n`);
      return; // sem Python o resto do HRZZ segue funcionando
    }
    const inicio = Date.now();
    filho = spawn(pythonDoTranscritor(raiz), ['server.py'], {
      cwd: join(raiz, 'servicos', 'transcritor'),
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONUNBUFFERED: '1',
        HF_HUB_DISABLE_SYMLINKS_WARNING: '1',
        TRANSCRITOR_TOKEN: process.env.TRANSCRITOR_TOKEN ?? tokenDoTranscritor(pastaDados),
        TRANSCRITOR_DADOS: process.env.TRANSCRITOR_DADOS ?? join(pastaDados, 'transcricoes'),
        TRANSCRITOR_TMP: process.env.TRANSCRITOR_TMP ?? join(pastaDados, 'transcricoes-tmp'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    filho.stdout.on('data', escreve);
    filho.stderr.on('data', escreve);
    filho.on('error', (e) => log(`transcritor: ${e.message}`));
    filho.on('exit', (codigo, sinal) => {
      if (encerrando) return;
      falhas = Date.now() - inicio < 15000 ? falhas + 1 : 0;
      const espera = Math.min(60000, 2000 * 2 ** Math.min(falhas, 5));
      log(`transcritor parou (${codigo ?? sinal}); subindo de novo em ${Math.round(espera / 1000)} s`);
      timer = setTimeout(subir, espera);
    });
  }
  subir();

  return {
    parar() {
      encerrando = true;
      if (timer) clearTimeout(timer);
      if (filho && filho.exitCode === null) filho.kill();
    },
  };
}

// npm run transcritor: roda so o servico, no terminal
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const c = subirTranscritor({ log: (t) => console.log(t), aoSaida: (t) => process.stdout.write(t) });
  const sair = () => {
    c.parar();
    setTimeout(() => process.exit(0), 300);
  };
  process.on('SIGINT', sair);
  process.on('SIGTERM', sair);
}
