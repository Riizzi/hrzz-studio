// Auditoria com um clique (docs/07-etapas.md, etapa 5): abre o site do preview no Chromium (Playwright) e confere
//   1. estouro: nada passa da lateral (360 e 1280 px)
//   2. alvos de toque: botoes e links com menos de 44 x 44 px no celular
//   3. acessibilidade: axe-core (WCAG 2.2 AA e boas praticas), menos o contraste
//   4. contraste: a regra de contraste do axe, separada
// O resultado vira uma lista curta; "pedir pro Claude corrigir" monta o pedido a partir dela (montarPedidoCorrecao).
type Pagina = import('playwright').Page;
type Navegador = import('playwright').Browser;

export type ItemAuditoria = { onde: string; detalhe: string; texto?: string };
export type VerificacaoAuditoria = {
  id: 'estouro' | 'alvos' | 'acessibilidade' | 'contraste';
  titulo: string;
  ok: boolean;
  total: number; // quantos problemas existem (a lista traz so os primeiros)
  itens: ItemAuditoria[];
};
export type ResultadoAuditoria = {
  quando: string;
  porta: number;
  caminho: string;
  larguras: number[];
  verificacoes: VerificacaoAuditoria[];
  problemas: number;
};

export const LARGURAS_AUDITORIA = { celular: 360, desktop: 1280 };
const MAX_ITENS = 25;

// ---------- scripts que rodam dentro da pagina (texto puro: o servidor nao tem os tipos do DOM) ----------
const DESCREVER = `
const desc = (el) => {
  let s = el.tagName.toLowerCase();
  if (el.id) return s + '#' + el.id;
  const c = (typeof el.className === 'string' ? el.className : '').trim().split(/\\s+/).filter(Boolean).slice(0, 2);
  if (c.length) s += '.' + c.join('.');
  return s;
};
const visivel = (el) => {
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};
const rolavel = (el) => {
  for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
    const o = getComputedStyle(p);
    if (/(auto|scroll|hidden|clip)/.test(o.overflowX)) return true;
  }
  return false;
};
const recorte = (t) => String(t || '').replace(/\\s+/g, ' ').trim().slice(0, 60);
`;

export const SCRIPT_ESTOURO = `(() => {
${DESCREVER}
const vw = document.documentElement.clientWidth;
const doc = document.documentElement.scrollWidth;
const achados = [];
const marcados = new Set();
for (const el of document.body.querySelectorAll('*')) {
  if (!visivel(el)) continue;
  const r = el.getBoundingClientRect();
  if (r.right <= vw + 1 || rolavel(el)) continue;
  if (el.parentElement && marcados.has(el.parentElement)) continue; // so o de fora: o resto vai junto
  marcados.add(el);
  achados.push({ onde: desc(el), detalhe: 'vai até ' + Math.round(r.right) + ' px numa tela de ' + vw + ' px', texto: recorte(el.textContent) });
}
return { vw, doc, rola: doc > vw + 1, achados };
})()`;

export const SCRIPT_ALVOS = `(() => {
${DESCREVER}
const seletor = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [onclick]';
const achados = [];
const vistos = new Set();
for (const el of document.querySelectorAll(seletor)) {
  if (el.disabled || !visivel(el)) continue;
  const r = el.getBoundingClientRect();
  if (r.width >= 44 && r.height >= 44) continue;
  // link no meio de um paragrafo: a regra de alvo de toque abre excecao
  if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') {
    const pai = el.parentElement;
    if (pai && (pai.textContent || '').trim().length > (el.textContent || '').trim().length + 20) continue;
  }
  // caixa de marcar dentro de um rotulo grande: o rotulo e o alvo
  const rot = el.closest && el.closest('label');
  if (rot) { const rr = rot.getBoundingClientRect(); if (rr.width >= 44 && rr.height >= 44) continue; }
  const chave = desc(el) + Math.round(r.width) + 'x' + Math.round(r.height);
  if (vistos.has(chave)) continue;
  vistos.add(chave);
  achados.push({ onde: desc(el), detalhe: 'mede ' + Math.round(r.width) + ' x ' + Math.round(r.height) + ' px (o mínimo é 44 x 44)', texto: recorte(el.textContent || el.getAttribute('aria-label') || el.getAttribute('title')) });
}
return achados;
})()`;

type NoAxe = { target?: unknown[]; html?: string; any?: { data?: { contrastRatio?: number; expectedContrastRatio?: string } }[] };
type ViolacaoAxe = { id: string; impact?: string | null; help: string; nodes: NoAxe[] };

function alvoDoNo(n: NoAxe): string {
  const t = (n.target ?? []).map((x) => (Array.isArray(x) ? x.join(' ') : String(x)));
  return t.join(' ') || '(sem seletor)';
}

export function itensDeAxe(violacoes: ViolacaoAxe[], max = MAX_ITENS): { total: number; itens: ItemAuditoria[] } {
  const itens: ItemAuditoria[] = [];
  let total = 0;
  for (const v of violacoes) {
    for (const n of v.nodes) {
      total++;
      if (itens.length >= max) continue;
      const dado = v.id === 'color-contrast' ? n.any?.find((a) => a.data?.contrastRatio)?.data : undefined;
      itens.push({
        onde: alvoDoNo(n),
        detalhe: dado ? `contraste ${Number(dado.contrastRatio).toFixed(2)}:1 (o mínimo é ${dado.expectedContrastRatio ?? '4.5:1'})` : `${v.help} [${v.id}${v.impact ? ', ' + v.impact : ''}]`,
        texto: (n.html ?? '').replace(/\s+/g, ' ').slice(0, 110),
      });
    }
  }
  return { total, itens };
}

function verificacao(id: VerificacaoAuditoria['id'], titulo: string, total: number, itens: ItemAuditoria[]): VerificacaoAuditoria {
  return { id, titulo, ok: total === 0, total, itens: itens.slice(0, MAX_ITENS) };
}

export async function auditarNoNavegador(nav: Navegador, porta: number, caminho = '/'): Promise<ResultadoAuditoria> {
  const rota = caminho.startsWith('/') ? caminho : '/' + caminho;
  const abrir = async (largura: number, altura: number): Promise<{ pagina: Pagina; fechar: () => Promise<void> }> => {
    const contexto = await nav.newContext({ viewport: { width: largura, height: altura }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    const pagina = await contexto.newPage();
    await pagina.goto(`http://localhost:${porta}${rota}`, { waitUntil: 'load', timeout: 20_000 });
    await pagina.waitForTimeout(400);
    return { pagina, fechar: () => contexto.close().catch(() => undefined) };
  };

  type Estouro = { vw: number; doc: number; rola: boolean; achados: ItemAuditoria[] };
  const estouroItens: ItemAuditoria[] = [];
  let estouroTotal = 0;
  for (const [nome, larg] of [['celular', LARGURAS_AUDITORIA.celular], ['desktop', LARGURAS_AUDITORIA.desktop]] as const) {
    const { pagina, fechar } = await abrir(larg, nome === 'celular' ? 740 : 800);
    try {
      const e = (await pagina.evaluate(SCRIPT_ESTOURO)) as Estouro;
      estouroTotal += e.achados.length;
      if (e.rola && e.achados.length === 0) {
        estouroTotal++;
        estouroItens.push({ onde: 'página', detalhe: `a página rola de lado em ${larg} px (largura ${e.doc} px)` });
      }
      for (const a of e.achados) estouroItens.push({ ...a, detalhe: `${larg} px: ${a.detalhe}` });
    } finally {
      await fechar();
    }
  }

  const mobile = await abrir(LARGURAS_AUDITORIA.celular, 740);
  try {
    const alvos = (await mobile.pagina.evaluate(SCRIPT_ALVOS)) as ItemAuditoria[];
    const mod = (await import('@axe-core/playwright')) as unknown as { AxeBuilder?: new (o: { page: Pagina }) => AxeConstrutor; default?: new (o: { page: Pagina }) => AxeConstrutor };
    const AxeBuilder = mod.AxeBuilder ?? mod.default!;
    const etiquetas = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
    const geral = await new AxeBuilder({ page: mobile.pagina }).withTags(etiquetas).disableRules(['color-contrast']).analyze();
    const contraste = await new AxeBuilder({ page: mobile.pagina }).withRules(['color-contrast']).analyze();
    const a = itensDeAxe(geral.violations as ViolacaoAxe[]);
    const c = itensDeAxe(contraste.violations as ViolacaoAxe[]);
    const verificacoes = [
      verificacao('estouro', 'nada passa da lateral (360 e 1280 px)', estouroTotal, estouroItens),
      verificacao('alvos', 'alvos de toque de 44 px (celular)', alvos.length, alvos),
      verificacao('acessibilidade', 'acessibilidade (axe, WCAG 2.2 AA)', a.total, a.itens),
      verificacao('contraste', 'contraste do texto', c.total, c.itens),
    ];
    return {
      quando: new Date().toISOString(),
      porta,
      caminho: rota,
      larguras: [LARGURAS_AUDITORIA.celular, LARGURAS_AUDITORIA.desktop],
      verificacoes,
      problemas: verificacoes.reduce((s, v) => s + v.total, 0),
    };
  } finally {
    await mobile.fechar();
  }
}

type AxeConstrutor = {
  withTags(t: string[]): AxeConstrutor;
  withRules(r: string[]): AxeConstrutor;
  disableRules(r: string[]): AxeConstrutor;
  analyze(): Promise<{ violations: unknown[] }>;
};

// O pedido que o botao "pedir pro Claude corrigir" manda (montado no servidor pra testar sem navegador)
export function montarPedidoCorrecao(r: ResultadoAuditoria): string {
  const comProblema = r.verificacoes.filter((v) => !v.ok);
  if (comProblema.length === 0) return 'A auditoria do preview não achou problemas.';
  const partes = [`Rodei a auditoria do preview (página ${r.caminho}) e ela achou ${r.problemas} problema${r.problemas === 1 ? '' : 's'}. Corrija no código, sem mudar o visual do que já está certo:`];
  for (const v of comProblema) {
    partes.push(`\n${v.titulo}: ${v.total} problema${v.total === 1 ? '' : 's'}`);
    for (const i of v.itens.slice(0, 12)) partes.push(`- ${i.onde}: ${i.detalhe}${i.texto ? ` ("${i.texto.slice(0, 50)}")` : ''}`);
    if (v.total > Math.min(v.itens.length, 12)) partes.push(`- ...e mais ${v.total - Math.min(v.itens.length, 12)}`);
  }
  partes.push('\nDepois de corrigir, confira de novo em 360 px e em 1280 px e me diga o que mudou.');
  return partes.join('\n');
}
