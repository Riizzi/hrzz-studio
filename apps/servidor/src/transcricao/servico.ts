// Ponte com o servico de transcricao (Python, porta 7100). A interface nunca fala com ele direto:
// tudo passa por /api/transcricao/*, depois do PIN. O servico so aceita chamadas com o token abaixo.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config.js';
import { caminhosDados } from '../config.js';

export class Transcritor {
  private tokenCache: string | undefined;

  constructor(private config: Config) {}

  get url(): string {
    return this.config.transcritorUrl;
  }

  get urlWs(): string {
    return this.config.transcritorUrl.replace(/^http/, 'ws');
  }

  // token: variavel de ambiente ou dados/segredos/transcritor.token (criado pelos scripts que sobem o servico)
  get token(): string {
    if (this.config.transcritorToken) return this.config.transcritorToken;
    if (this.tokenCache) return this.tokenCache;
    const arq = join(caminhosDados(this.config).segredos, 'transcritor.token');
    if (existsSync(arq)) {
      this.tokenCache = readFileSync(arq, 'utf8').trim();
      return this.tokenCache;
    }
    return '';
  }

  cabecalhos(extra: Record<string, string> = {}): Record<string, string> {
    const t = this.token;
    return t ? { ...extra, 'x-hrzz-token': t } : extra;
  }

  async json<T = unknown>(caminho: string, init: RequestInit = {}): Promise<T> {
    const r = await fetch(this.url + caminho, { ...init, headers: this.cabecalhos((init.headers as Record<string, string>) ?? {}), signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`transcritor respondeu ${r.status}`);
    return (await r.json()) as T;
  }

  async ligado(): Promise<boolean> {
    try {
      const r = await fetch(this.url + '/saude', { signal: AbortSignal.timeout(2500) });
      return r.ok;
    } catch {
      return false;
    }
  }
}
