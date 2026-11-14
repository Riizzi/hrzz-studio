// Vigia do HRZZ: sobe o servidor compilado (127.0.0.1:7000) e sobe de novo se ele cair ou pedir reinicio
// (codigo de saida 75, usado depois de "atualizar" e "voltar versao"). E o que o Windows abre no login
// (scripts/iniciar.ps1 -Instalar). Logs em dados/logs/. Sem dependencias: so node.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, statSync, truncateSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(process.env.HRZZ_RAIZ ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const dados = resolve(process.env.HRZZ_DADOS ?? join(raiz, 'dados'));
const pastaLogs = join(dados, 'logs');
mkdirSync(pastaLogs, { recursive: true });
const arquivoLog = join(pastaLogs, 'vigia.log');
const arquivoPid = join(pastaLogs, 'servidor.pid');
const CODIGO_REINICIAR = 75;

try {
  if (existsSync(arquivoLog) && statSync(arquivoLog).size > 5 * 1024 * 1024) truncateSync(arquivoLog, 0);
} catch {
  /* sem problema: o log so cresce um pouco mais */
}

function log(texto) {
  const linha = `${new Date().toISOString()} ${texto}\n`;
  try {
    appendFileSync(arquivoLog, linha);
  } catch {
    /* sem log */
  }
  if (process.stdout.isTTY) process.stdout.write(linha);
}

function garantirBuild() {
  const servidor = join(raiz, 'apps', 'servidor', 'dist', 'index.js');
  const web = join(raiz, 'apps', 'web', 'dist', 'index.html');
  if (existsSync(servidor) && existsSync(web)) return true;
  log('build nao encontrado: rodando npm run build');
  const r = spawnSync('npm', ['run', 'build'], { cwd: raiz, shell: true, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) {
    log(`o build falhou: ${(r.stdout ?? '') + (r.stderr ?? '')}`.slice(0, 2000));
    return false;
  }
  return true;
}

let filho = null;
let encerrando = false;
let falhasSeguidas = 0;

function subir() {
  if (encerrando) return;
  if (!garantirBuild()) {
    setTimeout(subir, 30000);
    return;
  }
  const inicio = Date.now();
  filho = spawn(process.execPath, [join(raiz, 'apps', 'servidor', 'dist', 'index.js')], {
    cwd: raiz,
    env: { ...process.env, HRZZ_VIGIA: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  writeFileSync(arquivoPid, String(filho.pid));
  log(`servidor no ar (pid ${filho.pid})`);
  const arquivoServidor = join(pastaLogs, 'servidor.log');
  const escreve = (d) => {
    try {
      appendFileSync(arquivoServidor, d);
    } catch {
      /* sem log */
    }
  };
  filho.stdout.on('data', escreve);
  filho.stderr.on('data', escreve);
  filho.on('exit', (codigo, sinal) => {
    if (encerrando) return;
    const viveu = Date.now() - inicio;
    if (codigo === CODIGO_REINICIAR) {
      falhasSeguidas = 0;
      log('reinicio pedido pelo servidor');
      return setTimeout(subir, 500);
    }
    falhasSeguidas = viveu < 10000 ? falhasSeguidas + 1 : 0;
    // espera mais a cada queda seguida (ate 1 min), pra nao ficar num laco apertado
    const espera = Math.min(60000, 1000 * 2 ** Math.min(falhasSeguidas, 6));
    log(`servidor parou (codigo ${codigo ?? sinal}); subindo de novo em ${Math.round(espera / 1000)} s`);
    setTimeout(subir, espera);
  });
}

function parar() {
  if (encerrando) return;
  encerrando = true;
  log('vigia encerrando');
  if (filho && filho.exitCode === null) filho.kill();
  setTimeout(() => process.exit(0), 400);
}
process.on('SIGINT', parar);
process.on('SIGTERM', parar);

log(`vigia iniciado (raiz ${raiz})`);
subir();
