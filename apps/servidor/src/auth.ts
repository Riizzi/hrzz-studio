// PIN e cookie de sessao. O PIN nunca e guardado em texto: so o hash (scrypt) em dados/segredos/pin.json.
// O cookie e assinado (HMAC) com a chave dados/segredos/sessao.key, gerada na primeira execucao.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

export const NOME_COOKIE = 'hrzz_sessao';

type PinGuardado = { sal: string; hash: string };

export class Autenticacao {
  private arquivoPin: string;
  private arquivoChave: string;
  private chave: Buffer;
  private falhas = 0;
  private bloqueadoAte = 0;

  constructor(
    pastaSegredos: string,
    private diasLembrar: number,
  ) {
    mkdirSync(pastaSegredos, { recursive: true });
    this.arquivoPin = join(pastaSegredos, 'pin.json');
    this.arquivoChave = join(pastaSegredos, 'sessao.key');
    if (!existsSync(this.arquivoChave)) {
      writeFileSync(this.arquivoChave, randomBytes(32).toString('hex'));
      try {
        chmodSync(this.arquivoChave, 0o600);
      } catch {
        /* windows: sem efeito */
      }
    }
    this.chave = Buffer.from(readFileSync(this.arquivoChave, 'utf8').trim(), 'hex');
  }

  temPin(): boolean {
    return existsSync(this.arquivoPin);
  }

  private lerPin(): PinGuardado | null {
    if (!this.temPin()) return null;
    try {
      return JSON.parse(readFileSync(this.arquivoPin, 'utf8')) as PinGuardado;
    } catch {
      return null;
    }
  }

  static pinValido(pin: unknown): pin is string {
    return typeof pin === 'string' && /^[0-9]{4,12}$/.test(pin);
  }

  definirPin(pin: string): void {
    const sal = randomBytes(16).toString('hex');
    const hash = scryptSync(pin, sal, 32).toString('hex');
    writeFileSync(this.arquivoPin, JSON.stringify({ sal, hash }));
    try {
      chmodSync(this.arquivoPin, 0o600);
    } catch {
      /* windows: sem efeito */
    }
  }

  // devolve 'ok', 'errado' ou o numero de segundos de espera (bloqueio depois de varias tentativas erradas)
  conferirPin(pin: string): 'ok' | 'errado' | number {
    const agora = Date.now();
    if (agora < this.bloqueadoAte) return Math.ceil((this.bloqueadoAte - agora) / 1000);
    const g = this.lerPin();
    if (!g) return 'errado';
    const tentativa = scryptSync(pin, g.sal, 32);
    const certo = Buffer.from(g.hash, 'hex');
    if (tentativa.length === certo.length && timingSafeEqual(tentativa, certo)) {
      this.falhas = 0;
      return 'ok';
    }
    this.falhas += 1;
    if (this.falhas >= 5) {
      this.bloqueadoAte = agora + Math.min(300, 15 * 2 ** (this.falhas - 5)) * 1000;
    }
    return 'errado';
  }

  // "versao" do PIN: trocar o PIN derruba todas as sessoes antigas
  private versao(): string {
    return (this.lerPin()?.hash ?? '').slice(0, 8);
  }

  private assinar(dados: string): string {
    return createHmac('sha256', this.chave).update(dados).digest('base64url');
  }

  criarToken(): string {
    const exp = Date.now() + this.diasLembrar * 24 * 3600 * 1000;
    const corpo = Buffer.from(JSON.stringify({ exp, v: this.versao() })).toString('base64url');
    return `${corpo}.${this.assinar(corpo)}`;
  }

  tokenValido(token: string | undefined): boolean {
    if (!token) return false;
    const [corpo, assinatura] = token.split('.');
    if (!corpo || !assinatura) return false;
    const esperada = this.assinar(corpo);
    const a = Buffer.from(assinatura);
    const b = Buffer.from(esperada);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    try {
      const { exp, v } = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')) as { exp: number; v: string };
      return typeof exp === 'number' && exp > Date.now() && v === this.versao();
    } catch {
      return false;
    }
  }

  cookie(token: string): string {
    const segundos = this.diasLembrar * 24 * 3600;
    return `${NOME_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${segundos}`;
  }

  cookieLimpo(): string {
    return `${NOME_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
  }
}

export function lerCookie(cabecalho: string | undefined, nome: string): string | undefined {
  if (!cabecalho) return undefined;
  for (const parte of cabecalho.split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nome) return parte.slice(i + 1).trim();
  }
  return undefined;
}
