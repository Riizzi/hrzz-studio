// Capturas do preview com o Chromium do Playwright: antes/depois e rabisco.
// O navegador sobe so na primeira captura e fecha sozinho depois de um tempo parado (economiza RAM).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

type Navegador = import('playwright').Browser;

export type OpcoesCaptura = { largura?: number; altura?: number; caminho?: string; rolagem?: number; rabisco?: Buffer };

export class Capturador {
  private nav: Navegador | null = null;
  private subindo: Promise<Navegador> | null = null;
  private ocioso: NodeJS.Timeout | null = null;
  private emUso = 0;

  private async navegador(): Promise<Navegador> {
    if (this.nav?.isConnected()) return this.nav;
    if (!this.subindo) {
      this.subindo = (async () => {
        const { chromium } = await import('playwright');
        const n = await chromium.launch({ headless: true });
        n.on('disconnected', () => {
          if (this.nav === n) this.nav = null;
        });
        this.nav = n;
        return n;
      })().finally(() => {
        this.subindo = null;
      });
    }
    return this.subindo;
  }

  // devolve o PNG da pagina em http://localhost:porta/caminho
  async capturar(porta: number, o: OpcoesCaptura = {}): Promise<Buffer> {
    const largura = Math.min(Math.max(Math.round(o.largura ?? 1280), 240), 2400);
    const altura = Math.min(Math.max(Math.round(o.altura ?? 800), 240), 2400);
    let nav: Navegador;
    try {
      nav = await this.navegador();
    } catch (e) {
      throw new Error('não consegui abrir o navegador das capturas (Chromium do Playwright): ' + (e as Error).message.split('\n')[0]);
    }
    this.emUso++;
    if (this.ocioso) clearTimeout(this.ocioso);
    const contexto = await nav.newContext({ viewport: { width: largura, height: altura }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    try {
      const pagina = await contexto.newPage();
      const caminho = (o.caminho ?? '/').startsWith('/') ? (o.caminho ?? '/') : '/' + o.caminho;
      await pagina.goto(`http://localhost:${porta}${caminho}`, { waitUntil: 'load', timeout: 20_000 });
      await pagina.waitForTimeout(350); // fontes e animacoes de entrada
      if (o.rolagem) await pagina.evaluate((y) => window.scrollTo(0, y), o.rolagem);
      if (o.rabisco) {
        // o desenho entra por cima da pagina, no mesmo tamanho da janela
        const b64 = o.rabisco.toString('base64');
        await pagina.evaluate((src) => {
          const img = document.createElement('img');
          img.src = 'data:image/png;base64,' + src;
          img.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none';
          document.body.appendChild(img);
          return img.decode();
        }, b64);
      }
      return await pagina.screenshot({ type: 'png' });
    } finally {
      await contexto.close().catch(() => undefined);
      this.emUso--;
      this.ocioso = setTimeout(() => void this.fechar(), 60_000);
    }
  }

  async capturarPara(destino: string, porta: number, o: OpcoesCaptura = {}): Promise<void> {
    const png = await this.capturar(porta, o);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, png);
  }

  async fechar(): Promise<void> {
    if (this.ocioso) clearTimeout(this.ocioso);
    if (this.emUso > 0) return;
    const n = this.nav;
    this.nav = null;
    await n?.close().catch(() => undefined);
  }
}
