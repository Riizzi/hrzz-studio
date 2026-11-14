// Terminal na pasta do projeto: pty (@lydell/node-pty, com binarios prontos pro Windows) ligado ao xterm.js
// da interface por WebSocket. Cada projeto tem uma sessao que continua viva quando a aba troca.
// Pelo caminho da Cloudflare o terminal fica bloqueado (docs/05-acesso-e-seguranca.md).
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { WebSocket } from 'ws';

type Pty = import('@lydell/node-pty').IPty;

type Sessao = {
  pty: Pty;
  pasta: string;
  buffer: string;
  ouvintes: Set<WebSocket>;
  fechada: boolean;
};

const LIMITE_BUFFER = 120_000;

function acharNoPath(nomes: string[]): string | null {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const n of nomes) {
      const f = join(dir, n);
      if (dir && existsSync(f)) return f;
    }
  }
  return null;
}

// PowerShell 7 se existir, senao o do Windows; o perfil NAO e pulado (e onde mora o prompt do Illuminati)
export function descobrirShell(): { arquivo: string; args: string[] } {
  if (process.env.HRZZ_SHELL) return { arquivo: process.env.HRZZ_SHELL, args: [] };
  if (process.platform === 'win32') {
    const pwsh = acharNoPath(['pwsh.exe']);
    return { arquivo: pwsh ?? 'powershell.exe', args: ['-NoLogo'] };
  }
  return { arquivo: process.env.SHELL || '/bin/bash', args: [] };
}

export class Terminais {
  private sessoes = new Map<string, Sessao>();

  async anexar(chave: string, pasta: string, socket: WebSocket, tam: { cols: number; rows: number }): Promise<void> {
    let s = this.sessoes.get(chave);
    if (s && s.fechada) {
      this.sessoes.delete(chave);
      s = undefined;
    }
    if (!s) s = await this.criar(chave, pasta, tam);
    const sessao = s;
    sessao.ouvintes.add(socket);
    if (sessao.buffer) socket.send(JSON.stringify({ t: 'o', d: sessao.buffer }));
    try {
      sessao.pty.resize(tam.cols, tam.rows);
    } catch {
      /* sessao encerrando */
    }

    socket.on('message', (bruto: Buffer) => {
      let m: { t?: string; d?: string; cols?: number; rows?: number };
      try {
        m = JSON.parse(bruto.toString());
      } catch {
        return;
      }
      if (m.t === 'd' && typeof m.d === 'string') sessao.pty.write(m.d);
      else if (m.t === 'tam' && Number.isFinite(m.cols) && Number.isFinite(m.rows)) {
        try {
          sessao.pty.resize(Math.min(Math.max(Math.round(m.cols!), 10), 400), Math.min(Math.max(Math.round(m.rows!), 3), 200));
        } catch {
          /* sessao encerrando */
        }
      }
    });
    socket.on('close', () => sessao.ouvintes.delete(socket));
  }

  private async criar(chave: string, pasta: string, tam: { cols: number; rows: number }): Promise<Sessao> {
    const nodePty = await import('@lydell/node-pty');
    const { arquivo, args } = descobrirShell();
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (typeof v === 'string' && k !== 'ANTHROPIC_API_KEY') env[k] = v; // regra 2
    env.TERM = 'xterm-256color';
    env.HRZZ_TERMINAL = '1';
    const pty = nodePty.spawn(arquivo, args, { name: 'xterm-256color', cols: tam.cols, rows: tam.rows, cwd: pasta, env });
    const s: Sessao = { pty, pasta, buffer: '', ouvintes: new Set(), fechada: false };
    pty.onData((d) => {
      s.buffer = (s.buffer + d).slice(-LIMITE_BUFFER);
      const msg = JSON.stringify({ t: 'o', d });
      for (const o of s.ouvintes) if (o.readyState === 1) o.send(msg);
    });
    pty.onExit(({ exitCode }) => {
      s.fechada = true;
      const msg = JSON.stringify({ t: 'fim', codigo: exitCode });
      for (const o of s.ouvintes) if (o.readyState === 1) o.send(msg);
      if (this.sessoes.get(chave) === s) this.sessoes.delete(chave);
    });
    this.sessoes.set(chave, s);
    return s;
  }

  encerrar(chave: string): void {
    const s = this.sessoes.get(chave);
    if (!s) return;
    this.sessoes.delete(chave);
    try {
      s.pty.kill();
    } catch {
      /* ja saiu */
    }
  }

  encerrarTodos(): void {
    for (const k of [...this.sessoes.keys()]) this.encerrar(k);
  }

  existe(chave: string): boolean {
    const s = this.sessoes.get(chave);
    return !!s && !s.fechada;
  }
}
