// Proxy reverso do preview: /preview/:porta/* -> servidor de dev do projeto (localhost:porta).
// A pagina do projeto fica na mesma origem do HRZZ (por isso o iframe pode ser editado por dentro) e
// recebe o script hrzz-preview.js no <head>.
//
// Problema classico de proxy com prefixo: servidores de dev (Vite, Astro) escrevem enderecos absolutos
// como /src/main.js e /@vite/client. Tratamos assim:
//   1. pedido cujo Referer e /preview/N/... vai pra porta N (e navegacao de pagina ganha o prefixo por redirecionamento);
//   2. pedido de modulo importado por outro modulo (Referer = /src/main.js, sem prefixo): cai no cookie
//      hrzz_prev=N, que o proxy grava ao servir a pagina, e so vale se o arquivo nao for do proprio HRZZ.
//   3. WebSocket do HMR e reescrito pelo hrzz-preview.js para passar por /preview/N/.
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import zlib from 'node:zlib';
import { existsSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';
import type { WebSocket } from 'ws';
import WebSocketCliente from 'ws';
import { lerCookie, NOME_COOKIE } from '../auth.js';

export const COOKIE_PREVIEW = 'hrzz_prev';
export const URL_SCRIPT = '/api/preview/hrzz-preview.js';

export function portaValida(p: unknown, proibidas: number[] = []): number | null {
  const n = Number(p);
  return Number.isInteger(n) && n >= 1024 && n <= 65535 && !proibidas.includes(n) ? n : null;
}

export type RotaPreview = { porta: number; caminho: string; redirecionar?: string };

const RE_PREFIXO = /^\/preview\/(\d{4,5})(\/.*)?$/;

function dividir(url: string): { caminho: string; busca: string } {
  const i = url.indexOf('?');
  return i < 0 ? { caminho: url, busca: '' } : { caminho: url.slice(0, i), busca: url.slice(i) };
}

function ehDocumento(req: IncomingMessage): boolean {
  const d = String(req.headers['sec-fetch-dest'] ?? '');
  return d === 'document' || d === 'iframe' || d === 'frame' || d === 'embed' || d === 'object';
}

// decide se este pedido e do preview e pra qual porta/caminho
export function rotaDePreview(req: IncomingMessage, opcoes: { webRaiz: string; proibidas: number[] }): RotaPreview | null {
  const url = req.url ?? '/';
  const { caminho, busca } = dividir(url);

  const direto = RE_PREFIXO.exec(caminho);
  if (direto) {
    const porta = portaValida(direto[1], opcoes.proibidas);
    if (!porta) return null;
    return { porta, caminho: (direto[2] || '/') + busca };
  }
  if (caminho.startsWith('/api/') || caminho.startsWith('/preview/')) return null;

  // 1. referer dentro do preview
  const ref = String(req.headers.referer ?? '');
  if (ref) {
    let caminhoRef = '';
    try {
      caminhoRef = new URL(ref).pathname;
    } catch {
      /* referer ilegivel */
    }
    const m = RE_PREFIXO.exec(caminhoRef);
    if (m) {
      const porta = portaValida(m[1], opcoes.proibidas);
      if (porta) {
        if (ehDocumento(req)) return { porta, caminho, redirecionar: `/preview/${porta}${caminho}${busca}` };
        return { porta, caminho: caminho + busca };
      }
    }
  }

  // 2. cookie do ultimo preview aberto, so pra recurso (nunca pagina) e so se o arquivo nao for do HRZZ
  if (!ehDocumento(req) && String(req.headers['sec-fetch-site'] ?? '') === 'same-origin') {
    const porta = portaValida(lerCookie(req.headers.cookie, COOKIE_PREVIEW), opcoes.proibidas);
    if (porta && !arquivoDoHrzz(opcoes.webRaiz, caminho)) return { porta, caminho: caminho + busca };
  }
  return null;
}

function arquivoDoHrzz(webRaiz: string, caminho: string): boolean {
  try {
    const rel = normalize(decodeURIComponent(caminho)).replace(/^([/\\])+/, '');
    if (rel.startsWith('..')) return true;
    const f = join(webRaiz, rel);
    return existsSync(f) && statSync(f).isFile();
  } catch {
    return true;
  }
}

function reescreverLocation(loc: string, porta: number): string {
  if (loc.startsWith('/') && !loc.startsWith('//')) return `/preview/${porta}${loc}`;
  const m = new RegExp(`^https?://(?:localhost|127\\.0\\.0\\.1|\\[::1\\]):${porta}(/.*)?$`).exec(loc);
  if (m) return `/preview/${porta}${m[1] || '/'}`;
  return loc;
}

function paginaDeErro(porta: number, mensagem: string): string {
  return `<!doctype html><meta charset="utf-8"><title>preview</title><body style="font:13px system-ui;background:#1C1917;color:#E8DFD1;padding:24px;line-height:1.5"><b>o servidor da porta ${porta} não responde</b><br><span style="color:#A8A29E">${mensagem.replace(/[<&]/g, '')}</span><br><br><span style="color:#A8A29E">suba o servidor do projeto (aba preview > iniciar) e recarregue.</span>`;
}

function descomprimir(buf: Buffer, codificacao: string): Buffer {
  try {
    if (codificacao === 'gzip' || codificacao === 'x-gzip') return zlib.gunzipSync(buf);
    if (codificacao === 'br') return zlib.brotliDecompressSync(buf);
    if (codificacao === 'deflate') return zlib.inflateSync(buf);
  } catch {
    /* devolve como veio */
  }
  return buf;
}

export function injetarScript(html: string): string {
  if (html.includes(URL_SCRIPT)) return html;
  const tag = `<script src="${URL_SCRIPT}"></script>`;
  const cabeca = /<head(\s[^>]*)?>/i.exec(html);
  if (cabeca) return html.slice(0, cabeca.index + cabeca[0].length) + tag + html.slice(cabeca.index + cabeca[0].length);
  const raiz = /<html(\s[^>]*)?>/i.exec(html);
  if (raiz) return html.slice(0, raiz.index + raiz[0].length) + tag + html.slice(raiz.index + raiz[0].length);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  if (doctype) return html.slice(0, doctype[0].length) + tag + html.slice(doctype[0].length);
  return tag + html;
}

export function proxiarHttp(req: IncomingMessage, res: ServerResponse, rota: RotaPreview): void {
  const { porta, caminho } = rota;
  const cab: http.OutgoingHttpHeaders = { ...req.headers };
  delete cab.connection;
  delete cab['proxy-connection'];
  cab.host = `localhost:${porta}`;
  cab['accept-encoding'] = 'identity';
  // o cookie do PIN nao sai do HRZZ
  if (typeof cab.cookie === 'string') {
    const resto = cab.cookie
      .split(';')
      .map((c) => c.trim())
      .filter((c) => c && !c.startsWith(NOME_COOKIE + '=') && !c.startsWith(COOKIE_PREVIEW + '='));
    if (resto.length) cab.cookie = resto.join('; ');
    else delete cab.cookie;
  }
  for (const nome of ['referer', 'origin'] as const) {
    const v = cab[nome];
    if (typeof v !== 'string') continue;
    try {
      const u = new URL(v);
      const m = RE_PREFIXO.exec(u.pathname);
      cab[nome] = nome === 'origin' ? `http://localhost:${porta}` : `http://localhost:${porta}${m ? m[2] || '/' : u.pathname}${u.search}`;
    } catch {
      delete cab[nome];
    }
  }

  const aoErro = (e: Error) => {
    if (res.headersSent) return res.destroy();
    const corpo = paginaDeErro(porta, (e as NodeJS.ErrnoException).code === 'ECONNREFUSED' ? 'ninguém está escutando nessa porta.' : e.message);
    res.writeHead(502, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(corpo), 'cache-control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : corpo);
  };

  const up = http.request({ host: 'localhost', port: porta, method: req.method, path: caminho, headers: cab }, (ur) => {
    const h: http.OutgoingHttpHeaders = { ...ur.headers };
    delete h['x-frame-options'];
    if (typeof h.location === 'string') h.location = reescreverLocation(h.location, porta);
    const tipo = String(ur.headers['content-type'] ?? '');
    const ehHtml = /text\/html/i.test(tipo) && req.method !== 'HEAD' && ur.statusCode !== 304 && ur.statusCode !== 204;
    if (!ehHtml) {
      res.writeHead(ur.statusCode ?? 502, h);
      ur.pipe(res);
      return;
    }
    const partes: Buffer[] = [];
    ur.on('data', (d: Buffer) => partes.push(d));
    ur.on('error', aoErro);
    ur.on('end', () => {
      const bruto = descomprimir(Buffer.concat(partes), String(ur.headers['content-encoding'] ?? '').toLowerCase());
      const charset = /charset=([\w-]+)/i.exec(tipo)?.[1]?.toLowerCase();
      const utf8 = !charset || charset === 'utf-8' || charset === 'utf8';
      const saida = utf8 ? Buffer.from(injetarScript(bruto.toString('utf8')), 'utf8') : bruto;
      delete h['content-encoding'];
      delete h['transfer-encoding'];
      delete h.etag;
      delete h['last-modified'];
      h['content-length'] = saida.length;
      h['cache-control'] = 'no-store';
      const marca = `${COOKIE_PREVIEW}=${porta}; Path=/; SameSite=Strict; Max-Age=${12 * 3600}`;
      const antigos = h['set-cookie'];
      h['set-cookie'] = Array.isArray(antigos) ? [...antigos, marca] : antigos ? [antigos, marca] : [marca];
      res.writeHead(ur.statusCode ?? 200, h);
      res.end(saida);
    });
  });
  up.on('error', aoErro);
  req.on('aborted', () => up.destroy());
  req.pipe(up);
}

// liga o WebSocket do navegador (ex.: HMR do Vite) ao do servidor de dev
export function proxiarWs(cliente: WebSocket, req: IncomingMessage, porta: number, caminho: string): void {
  const protos = String(req.headers['sec-websocket-protocol'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const upstream = new WebSocketCliente(`ws://localhost:${porta}${caminho}`, protos, { headers: { origin: `http://localhost:${porta}` } });
  const fila: { dados: WebSocketCliente.RawData; binario: boolean }[] = [];
  cliente.on('message', (dados, binario) => {
    if (upstream.readyState === 1) upstream.send(dados, { binary: binario });
    else fila.push({ dados, binario });
  });
  upstream.on('open', () => {
    for (const m of fila.splice(0)) upstream.send(m.dados, { binary: m.binario });
  });
  upstream.on('message', (dados, binario) => {
    if (cliente.readyState === 1) cliente.send(dados, { binary: binario });
  });
  const fechar = () => {
    try {
      cliente.close();
    } catch {
      /* ja fechado */
    }
    try {
      upstream.close();
    } catch {
      /* ja fechado */
    }
  };
  upstream.on('close', fechar);
  upstream.on('error', fechar);
  cliente.on('close', fechar);
  cliente.on('error', fechar);
}
