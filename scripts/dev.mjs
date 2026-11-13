// npm run dev: sobe o servidor (7000) e o Vite (7001) juntos, na mesma janela.
// Ctrl+C derruba os dois. Sem dependencias extras: so node.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;

const processos = [
  { nome: 'servidor', cor: '\x1b[33m', cwd: join(raiz, 'apps', 'servidor'), args: [join(raiz, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'watch', 'src/index.ts'] },
  { nome: 'web', cor: '\x1b[36m', cwd: join(raiz, 'apps', 'web'), args: [join(raiz, 'node_modules', 'vite', 'bin', 'vite.js')] },
];

const filhos = [];
let saindo = false;

function encerrar(codigo = 0) {
  if (saindo) return;
  saindo = true;
  for (const f of filhos) {
    if (f.exitCode === null) f.kill();
  }
  setTimeout(() => process.exit(codigo), 300);
}

for (const p of processos) {
  const filho = spawn(node, p.args, { cwd: p.cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  filhos.push(filho);
  const prefixo = `${p.cor}[${p.nome}]\x1b[0m `;
  const escreve = (saida) => (dado) => {
    for (const linha of String(dado).split(/\r?\n/)) {
      if (linha.trim()) saida.write(prefixo + linha + '\n');
    }
  };
  filho.stdout.on('data', escreve(process.stdout));
  filho.stderr.on('data', escreve(process.stderr));
  filho.on('exit', (codigo) => {
    if (!saindo) {
      console.log(`${prefixo}parou (codigo ${codigo}). Encerrando o resto.`);
      encerrar(codigo ?? 1);
    }
  });
}

process.on('SIGINT', () => encerrar(0));
process.on('SIGTERM', () => encerrar(0));
console.log('HRZZ dev: servidor em http://127.0.0.1:7000, interface em http://localhost:7001 (Ctrl+C para parar)');
