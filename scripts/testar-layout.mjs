// Testa se alguma coisa vaza pelas laterais em varias larguras de tela.
// Uso:
//   npm run testar:layout                    -> testa http://localhost:7001
//   npm run testar:layout -- <url>           -> testa outra url
//   npm run testar:layout -- --prototipo     -> testa docs/prototipo.html
//
// Regras pra interface passar no teste:
// - itens de navegacao com atributo data-v="<tela>" (o teste clica em cada um)
// - elementos decorativos que podem vazar de proposito (floresta, pinheiros)
//   levam o atributo data-ignorar-layout ou as classes .floresta / .pinhos
// Capturas ficam em dados/testes-layout/.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
let url = 'http://localhost:7001';
if (args.includes('--prototipo')) url = pathToFileURL(resolve('docs/prototipo.html')).href;
else if (args[0]) url = args[0];

const larguras = [1280, 960, 760, 620, 420, 360];
const pastaCapturas = join('dados', 'testes-layout');
mkdirSync(pastaCapturas, { recursive: true });

const navegador = await chromium.launch();
let problemas = 0;

for (const largura of larguras) {
  const pagina = await navegador.newPage({ viewport: { width: largura, height: 760 } });
  const erros = [];
  pagina.on('pageerror', (e) => erros.push(e.message));
  await pagina.goto(url, { waitUntil: 'load' });
  await pagina.waitForTimeout(400);
  if (erros.length) {
    console.log(`[${largura}px] erro de script na pagina: ${erros.join(' | ')}`);
    problemas++;
  }

  const telas = await pagina.$$eval('[data-v]', (els) => [...new Set(els.map((e) => e.getAttribute('data-v')))]);
  const lista = telas.length ? telas : [null];

  for (const tela of lista) {
    if (tela) {
      await pagina.evaluate((t) => {
        const alvo = [...document.querySelectorAll(`[data-v="${t}"]`)].find((e) => e.offsetParent !== null);
        if (alvo) alvo.click();
      }, tela);
      await pagina.waitForTimeout(150);
    }
    const achados = await pagina.evaluate(() => {
      const ignorar = (el) => el.closest('[data-ignorar-layout], .floresta, .pinhos, svg');
      const recorta = (el) => {
        let p = el.parentElement;
        while (p && p !== document.body) {
          const cs = getComputedStyle(p);
          if (cs.overflowX !== 'visible') return p;
          p = p.parentElement;
        }
        return document.documentElement;
      };
      const saida = [];
      for (const el of document.querySelectorAll('body *')) {
        if (ignorar(el)) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const caixa = recorta(el).getBoundingClientRect();
        const ccs = getComputedStyle(recorta(el));
        if (ccs.overflowX === 'auto' || ccs.overflowX === 'scroll') continue;
        if (r.right > caixa.right + 1.5 || r.left < caixa.left - 1.5) {
          const nome = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
            (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '');
          saida.push(`${nome} (${Math.round(r.left)} a ${Math.round(r.right)}, cabe em ${Math.round(caixa.left)} a ${Math.round(caixa.right)})`);
        }
      }
      if (document.documentElement.scrollWidth > window.innerWidth) saida.push('a pagina inteira tem rolagem horizontal');
      return [...new Set(saida)].slice(0, 15);
    });
    if (achados.length) {
      problemas += achados.length;
      console.log(`[${largura}px] tela ${tela ?? '(unica)'}:`);
      for (const a of achados) console.log('   - ' + a);
    }
    await pagina.screenshot({ path: join(pastaCapturas, `${largura}-${tela ?? 'pagina'}.png`) });
  }
  await pagina.close();
}

await navegador.close();
if (problemas) {
  console.log(`\n${problemas} problema(s). Capturas em ${pastaCapturas}`);
  process.exit(1);
}
console.log(`Tudo dentro das bordas em ${larguras.join(', ')} px. Capturas em ${pastaCapturas}`);
