// So a parte de interface do acervo (a mesma que o testar-interface roda no fim), pra iterar rapido.
//   npm run testar:acervo-ui
import { chromium } from 'playwright';
import { prepararAlvo } from './lib-teste.mjs';
import { testarAcervo } from './testes-acervo-ui.mjs';

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  if (condicao) console.log(`  [ok] ${nome}`);
  else {
    console.log(`  [--] ${nome}${detalhe ? ': ' + detalhe : ''}`);
    falhas++;
  }
}

async function vazamentos(pagina) {
  return pagina.evaluate(() => {
    const ignorar = (el) => el.closest('[data-ignorar-layout], .floresta, .pinhos, svg');
    const recorta = (el) => {
      let p = el.parentElement;
      while (p && p !== document.body) {
        if (getComputedStyle(p).overflowX !== 'visible') return p;
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
      const pai = recorta(el);
      const pcs = getComputedStyle(pai);
      if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll') continue;
      const caixa = pai.getBoundingClientRect();
      if (r.right > caixa.right + 1.5 || r.left < caixa.left - 1.5) saida.push(el.tagName.toLowerCase() + (typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : ''));
    }
    if (document.documentElement.scrollWidth > window.innerWidth) saida.push('rolagem horizontal na pagina');
    return [...new Set(saida)].slice(0, 10);
  });
}

const alvo = await prepararAlvo(null, { porta: 7097 });
const navegador = await chromium.launch();
async function novaPagina(opcoes) {
  const contexto = await navegador.newContext(opcoes);
  if (alvo.cookie) await contexto.addCookies([alvo.cookie]);
  return contexto.newPage();
}
try {
  await testarAcervo({ navegador, alvo, url: alvo.url, novaPagina, ok, vazamentos });
} catch (e) {
  console.log('  [--] erro inesperado:', e.message);
  falhas++;
} finally {
  await navegador.close();
  await alvo.servidor?.parar();
}
console.log(falhas ? `\n${falhas} verificacao(oes) falharam.` : '\nInterface do acervo ok.');
process.exit(falhas ? 1 : 0);
