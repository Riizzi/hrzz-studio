// Servidores de preview dos projetos: detecta e sobe o `npm run dev`, serve pasta estatica (index.html)
// ou usa uma porta que o joao ja deixou rodando. Um servidor por projeto, guardado em memoria.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { extname, join, normalize, resolve, sep } from 'node:path';

export type TipoPreview = 'npm' | 'estatico' | 'manual';

export type EstadoPreview = {
  rodando: boolean;
  porta?: number;
  tipo?: TipoPreview;
  comando?: string;
  subindo?: boolean;
  erro?: string;
  log?: string;
  // o que da pra fazer neste projeto
  opcoes: Deteccao;
};

export type Deteccao = { npm?: { script: string; comando: string }; estatico?: { arquivo: string } };

type Servidor = {
  porta: number;
  tipo: TipoPreview;
  comando?: string;
  filho?: ChildProcess;
  http?: http.Server;
  log: string[];
  subindo: boolean;
  erro?: string;
};

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.map': 'application/json',
};

const SEM_COR = /\x1b\[[0-9;?]*[A-Za-z]/g;
const RE_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0):(\d{2,5})/i;

export function detectar(pasta: string): Deteccao {
  const r: Deteccao = {};
  const pkg = join(pasta, 'package.json');
  if (existsSync(pkg)) {
    try {
      const scripts = (JSON.parse(readFileSync(pkg, 'utf8')).scripts ?? {}) as Record<string, string>;
      const script = scripts.dev ? 'dev' : scripts.start ? 'start' : scripts.serve ? 'serve' : undefined;
      if (script) r.npm = { script, comando: script === 'start' ? 'npm start' : `npm run ${script}` };
    } catch {
      /* package.json quebrado: segue sem npm */
    }
  }
  for (const nome of ['index.html', 'public/index.html', 'dist/index.html']) {
    if (existsSync(join(pasta, nome))) {
      r.estatico = { arquivo: nome };
      break;
    }
  }
  return r;
}

export function portaAberta(porta: number, host = '127.0.0.1', limiteMs = 800): Promise<boolean> {
  return new Promise((res) => {
    const s = net.connect({ port: porta, host });
    const fim = (v: boolean) => {
      s.destroy();
      res(v);
    };
    s.setTimeout(limiteMs, () => fim(false));
    s.once('connect', () => fim(true));
    s.once('error', () => fim(false));
  });
}

// aceita a porta em 127.0.0.1 ou em ::1 (alguns servidores so escutam num dos dois)
export async function portaResponde(porta: number): Promise<boolean> {
  return (await portaAberta(porta, '127.0.0.1')) || (await portaAberta(porta, '::1'));
}

function matarArvore(filho: ChildProcess): void {
  if (!filho.pid) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(filho.pid), '/T', '/F'], { windowsHide: true });
    else process.kill(-filho.pid, 'SIGTERM');
  } catch {
    try {
      filho.kill();
    } catch {
      /* ja saiu */
    }
  }
}

// servidor estatico minimo: serve a pasta como um site (index.html na raiz ou na subpasta indicada)
export function servirPasta(raiz: string, base: string): Promise<{ servidor: http.Server; porta: number }> {
  const pasta = resolve(raiz, base);
  const servidor = http.createServer((req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      if (rel.startsWith('..')) throw new Error('fora');
      let arq = resolve(pasta, rel);
      if (arq !== pasta && !arq.startsWith(pasta + sep)) throw new Error('fora');
      if (existsSync(arq) && statSync(arq).isDirectory()) arq = join(arq, 'index.html');
      if (!existsSync(arq) || !statSync(arq).isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        return void res.end('não achei ' + url.pathname);
      }
      res.writeHead(200, { 'content-type': MIME[extname(arq).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      createReadStream(arq).pipe(res);
    } catch {
      res.writeHead(400);
      res.end();
    }
  });
  return new Promise((res, rej) => {
    servidor.once('error', rej);
    servidor.listen(0, '127.0.0.1', () => res({ servidor, porta: (servidor.address() as net.AddressInfo).port }));
  });
}

export class GerenciadorPreview {
  private servidores = new Map<string, Servidor>();

  constructor(
    private aoMudar: (chave: string) => void = () => undefined,
    private proibidas: number[] = [],
  ) {}

  estado(chave: string, pasta: string): EstadoPreview {
    const s = this.servidores.get(chave);
    const opcoes = detectar(pasta);
    if (!s) return { rodando: false, opcoes };
    return { rodando: !s.subindo && !s.erro, subindo: s.subindo, porta: s.porta || undefined, tipo: s.tipo, comando: s.comando, erro: s.erro, log: s.log.slice(-12).join('\n'), opcoes };
  }

  portaDe(chave: string): number | null {
    const s = this.servidores.get(chave);
    return s && !s.subindo && !s.erro && s.porta ? s.porta : null;
  }

  parar(chave: string): void {
    const s = this.servidores.get(chave);
    if (!s) return;
    this.servidores.delete(chave);
    if (s.filho) matarArvore(s.filho);
    s.http?.close();
    this.aoMudar(chave);
  }

  pararTodos(): void {
    for (const k of [...this.servidores.keys()]) this.parar(k);
  }

  // abre um servidor ja existente numa porta
  async usarPorta(chave: string, porta: number): Promise<EstadoPreview> {
    this.parar(chave);
    if (this.proibidas.includes(porta)) throw new Error('essa porta é do próprio HRZZ');
    if (!(await portaResponde(porta))) throw new Error(`nada está escutando na porta ${porta}`);
    this.servidores.set(chave, { porta, tipo: 'manual', log: [], subindo: false });
    this.aoMudar(chave);
    return { rodando: true, porta, tipo: 'manual', opcoes: {} };
  }

  async iniciar(chave: string, pasta: string, como?: 'npm' | 'estatico'): Promise<EstadoPreview> {
    const atual = this.servidores.get(chave);
    if (atual && !atual.subindo && !atual.erro && (await portaResponde(atual.porta))) return this.estado(chave, pasta);
    this.parar(chave);
    const op = detectar(pasta);
    const usar = como ?? (op.npm ? 'npm' : op.estatico ? 'estatico' : undefined);
    if (usar === 'estatico' && op.estatico) {
      const base = op.estatico.arquivo.includes('/') ? op.estatico.arquivo.slice(0, op.estatico.arquivo.lastIndexOf('/')) : '.';
      const { servidor, porta } = await servirPasta(pasta, base);
      this.servidores.set(chave, { porta, tipo: 'estatico', http: servidor, log: [], subindo: false, comando: base === '.' ? 'pasta do projeto' : base });
      this.aoMudar(chave);
      return this.estado(chave, pasta);
    }
    if (usar === 'npm' && op.npm) return this.subirNpm(chave, pasta, op.npm.comando);
    throw new Error('não achei como subir esse projeto: sem script "dev" no package.json e sem index.html');
  }

  private async subirNpm(chave: string, pasta: string, comando: string): Promise<EstadoPreview> {
    if (!existsSync(join(pasta, 'node_modules'))) {
      // sem dependencias instaladas o dev nao sobe: avisa em vez de ficar esperando
      const s: Servidor = { porta: 0, tipo: 'npm', comando, log: [], subindo: false, erro: 'faltam as dependências: rode npm install na pasta do projeto (aba terminal)' };
      this.servidores.set(chave, s);
      this.aoMudar(chave);
      return this.estado(chave, pasta);
    }
    const env: NodeJS.ProcessEnv = { ...process.env, BROWSER: 'none', FORCE_COLOR: '0', NO_COLOR: '1' };
    delete env.ANTHROPIC_API_KEY; // regra 2: nunca repassar a chave pro que roda no projeto
    const filho = spawn(comando, { cwd: pasta, shell: true, env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    const s: Servidor = { porta: 0, tipo: 'npm', comando, filho, log: [], subindo: true };
    this.servidores.set(chave, s);
    this.aoMudar(chave);

    let achou: (p: number) => void = () => undefined;
    const porta = new Promise<number>((res) => (achou = res));
    const ler = (d: Buffer) => {
      const texto = d.toString('utf8').replace(SEM_COR, '');
      for (const linha of texto.split(/\r?\n/)) {
        if (!linha.trim()) continue;
        s.log.push(linha.slice(0, 300));
        if (s.log.length > 200) s.log.shift();
        const m = RE_URL.exec(linha);
        if (m && !s.porta) achou(Number(m[1]));
      }
    };
    filho.stdout?.on('data', ler);
    filho.stderr?.on('data', ler);
    const saiu = new Promise<'saiu'>((res) => filho.once('exit', () => res('saiu')));
    filho.on('error', (e) => {
      s.erro = e.message;
    });

    const resultado = await Promise.race([porta, saiu, new Promise<'tempo'>((res) => setTimeout(() => res('tempo'), 90_000))]);
    if (typeof resultado !== 'number') {
      s.subindo = false;
      s.erro = resultado === 'saiu' ? 'o servidor do projeto fechou antes de subir. Veja o log abaixo.' : 'o servidor do projeto não disse em que porta subiu (90 s).';
      if (resultado === 'tempo') matarArvore(filho);
      this.aoMudar(chave);
      return this.estado(chave, pasta);
    }
    // espera a porta aceitar conexao
    for (let i = 0; i < 60 && !(await portaResponde(resultado)); i++) await new Promise((r) => setTimeout(r, 250));
    s.porta = resultado;
    s.subindo = false;
    filho.once('exit', () => {
      if (this.servidores.get(chave) === s) {
        this.servidores.delete(chave);
        this.aoMudar(chave);
      }
    });
    this.aoMudar(chave);
    return this.estado(chave, pasta);
  }
}
