// Roda um programa externo (claude ou agy) e entrega o fluxo de linhas pro leitor.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { LeitorDeFluxo } from './stream.js';
import type { Evento, TurnoEmAndamento } from './tipos.js';

// Acha o programa: caminho completo, PATH, ou a pasta extra (ex.: %LOCALAPPDATA%\agy\bin).
export function acharPrograma(nome: string, pastaExtra?: string, env: NodeJS.ProcessEnv = process.env): string {
  if (/[\\/]/.test(nome)) return nome;
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  const pastas = (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean);
  if (pastaExtra) pastas.push(pastaExtra);
  for (const p of pastas) {
    for (const e of exts) {
      const c = join(p, nome + e);
      if (existsSync(c)) return c;
    }
  }
  return nome;
}

// O HRZZ nunca define ANTHROPIC_API_KEY. Se ela existir no ambiente, o claude cobraria pela API em vez de
// usar a assinatura, entao ela e retirada do ambiente do processo filho.
export function ambienteLimpo(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra };
  delete env.ANTHROPIC_API_KEY;
  return env;
}

export function matarArvore(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).on('error', () => {});
  } else {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* ja saiu */
    }
  }
}

export function rodarComFluxo(config: {
  programa: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  entrada?: string; // texto mandado pela entrada padrao (o prompt)
  nomeMotor: string;
  mostrarPensamento: boolean;
  aoEvento: (e: Evento) => void;
}): TurnoEmAndamento {
  const leitor = new LeitorDeFluxo(config.aoEvento, { cwd: config.cwd, mostrarPensamento: config.mostrarPensamento });
  let parado = false;
  const filho = spawn(config.programa, config.args, {
    cwd: config.cwd,
    env: config.env,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    // .cmd/.bat no Windows precisam de shell; .exe nao
    shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(config.programa),
  });

  let restoSaida = '';
  let erroSaida = '';
  filho.stdout.setEncoding('utf8');
  filho.stdout.on('data', (pedaco: string) => {
    restoSaida += pedaco;
    let i: number;
    while ((i = restoSaida.indexOf('\n')) >= 0) {
      leitor.linha(restoSaida.slice(0, i));
      restoSaida = restoSaida.slice(i + 1);
    }
  });
  filho.stderr.setEncoding('utf8');
  filho.stderr.on('data', (p: string) => {
    erroSaida = (erroSaida + p).slice(-2000);
  });
  // o filho pode fechar a entrada antes da gente terminar de escrever; nao e erro nosso
  filho.stdin.on('error', () => {});
  filho.stdin.end(config.entrada ?? '');

  const terminou = new Promise<ReturnType<LeitorDeFluxo['resultadoFinal']> & { parado?: boolean }>((resolve) => {
    let resolvido = false;
    const fim = (erro?: string) => {
      if (resolvido) return;
      resolvido = true;
      if (restoSaida.trim()) leitor.linha(restoSaida);
      if (erro && !leitor.erro) {
        leitor.erro = erro;
        leitor.blocos.push({ tipo: 'erro', texto: erro });
        config.aoEvento({ t: 'erro', mensagem: erro });
      }
      if (!leitor.terminou && !erro) config.aoEvento({ t: 'fim' });
      resolve({ ...leitor.resultadoFinal(), parado });
    };
    filho.on('error', (e: NodeJS.ErrnoException) => {
      fim(
        e.code === 'ENOENT'
          ? `não achei o programa "${config.nomeMotor}" no PC. Rode npm run checar pra ver o que falta.`
          : `não consegui rodar o ${config.nomeMotor}: ${e.message}`,
      );
    });
    filho.on('close', (codigo) => {
      if (parado) return fim();
      if (codigo !== 0 && !leitor.terminou) {
        const detalhe = erroSaida.trim().split(/\r?\n/).slice(-3).join(' ') || `código ${codigo}`;
        return fim(`o ${config.nomeMotor} parou antes de responder: ${detalhe}`);
      }
      fim();
    });
  });

  return {
    parar: () => {
      parado = true;
      matarArvore(filho.pid);
    },
    terminou,
  };
}
