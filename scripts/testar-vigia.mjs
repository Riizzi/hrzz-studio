// Testa o vigia de verdade: sobe, derruba o servidor e confere que ele volta sozinho.
// Usa pasta de dados temporaria e a porta 7092. Precisa do build feito (npm run build).
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const pasta = mkdtempSync(join(tmpdir(), 'hrzz-vigia-'));
const porta = 7092;
const url = `http://127.0.0.1:${porta}`;
let falhas = 0;
const ok = (nome, cond, detalhe = '') => {
  console.log(`  [${cond ? 'ok' : '--'}] ${nome}${cond || !detalhe ? '' : ': ' + detalhe}`);
  if (!cond) falhas++;
};
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

async function saude() {
  try {
    const r = await fetch(`${url}/api/saude`);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
async function esperar(cond, ms = 20000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    const v = await cond();
    if (v) return v;
    await dorme(200);
  }
  return null;
}

const vigia = spawn(process.execPath, [join(raiz, 'scripts', 'vigia.mjs')], {
  cwd: raiz,
  env: { ...process.env, HRZZ_PORTA: String(porta), HRZZ_DADOS: pasta, HRZZ_RAIZ: raiz },
  stdio: 'ignore',
});

console.log('vigia');
const subiu = await esperar(saude);
ok('o vigia sobe o servidor', !!subiu);
const pid1 = Number(readFileSync(join(pasta, 'logs', 'servidor.pid'), 'utf8'));
ok('o pid do servidor fica gravado', pid1 > 0);

process.kill(pid1);
await esperar(async () => !(await saude()), 8000);
const voltou = await esperar(async () => {
  const s = await saude();
  const pid = Number(readFileSync(join(pasta, 'logs', 'servidor.pid'), 'utf8'));
  return s && pid !== pid1 ? pid : null;
}, 25000);
ok('servidor derrubado volta sozinho', !!voltou);

vigia.kill();
await dorme(800);
const aindaVivo = await saude();
if (aindaVivo) {
  // o servidor filho pode ficar no ar no Windows se o vigia for morto a forca; derruba pelo pid gravado
  try {
    process.kill(Number(readFileSync(join(pasta, 'logs', 'servidor.pid'), 'utf8')));
  } catch {
    /* ja saiu */
  }
}
await dorme(500);
try {
  rmSync(pasta, { recursive: true, force: true });
} catch {
  /* o Windows pode segurar o banco por um instante */
}
if (falhas) {
  console.log(`\n${falhas} verificacao(oes) falharam.`);
  process.exit(1);
}
console.log('\nVigia ok.');
