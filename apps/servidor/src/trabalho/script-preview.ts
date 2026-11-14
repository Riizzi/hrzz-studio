// hrzz-preview.js: o script que o proxy injeta no <head> de toda pagina do preview.
// Serve pra: (1) fazer o WebSocket de HMR passar pelo prefixo /preview/N, (2) editar texto direto na pagina,
// (3) avisar a interface por postMessage. Escrito em JS puro, sem backticks nem ${ } (e uma string do servidor).
export const SCRIPT_PREVIEW = String.raw`(function () {
  if (window.__hrzzPreview) return;
  window.__hrzzPreview = true;
  var m = /^\/preview\/(\d+)(\/|$)/.exec(location.pathname);
  var prefixo = m ? '/preview/' + m[1] : '';
  var pai = window.parent !== window ? window.parent : null;
  function avisar(msg) {
    if (!pai) return;
    msg.hrzz = msg.hrzz || 'preview';
    try { pai.postMessage(msg, location.origin); } catch (e) {}
  }

  // 1. WebSocket do servidor de dev (HMR) passa pelo proxy
  if (prefixo && window.WebSocket) {
    var Original = window.WebSocket;
    var Novo = function (url, protocolos) {
      try {
        var u = new URL(url, location.href);
        if (u.host === location.host && u.pathname.indexOf(prefixo + '/') !== 0 && u.pathname !== prefixo) {
          u.pathname = prefixo + u.pathname;
          url = u.href;
        }
      } catch (e) {}
      return protocolos === undefined ? new Original(url) : new Original(url, protocolos);
    };
    Novo.prototype = Original.prototype;
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k) { Novo[k] = Original[k]; });
    window.WebSocket = Novo;
  }

  // 2. caminho atual (inclui navegacao sem recarregar)
  function caminhoAtual() {
    var p = location.pathname;
    if (prefixo && p.indexOf(prefixo) === 0) p = p.slice(prefixo.length) || '/';
    return p + location.search + location.hash;
  }
  function avisarCaminho() { avisar({ hrzz: 'caminho', caminho: caminhoAtual(), titulo: document.title }); }
  ['pushState', 'replaceState'].forEach(function (k) {
    var f = history[k];
    history[k] = function () { var r = f.apply(this, arguments); setTimeout(avisarCaminho, 0); return r; };
  });
  window.addEventListener('popstate', avisarCaminho);
  window.addEventListener('hashchange', avisarCaminho);
  window.addEventListener('load', avisarCaminho);

  // 3. editar texto: clique num texto simples, escreva por cima, Enter ou clicar fora confirma, Esc cancela
  var editando = false;
  var estilo = null;
  var atual = null;
  var original = '';

  function folha(el) {
    if (!el || el === document.body || el === document.documentElement) return null;
    if (/^(SCRIPT|STYLE|HTML|BODY|INPUT|TEXTAREA|SELECT|SVG|CANVAS|VIDEO|AUDIO|IMG|IFRAME)$/i.test(el.tagName)) return null;
    if (el.children.length > 0) return null;
    return el.textContent && el.textContent.trim() ? el : null;
  }
  function ligarEstilo() {
    if (estilo) return;
    estilo = document.createElement('style');
    estilo.textContent = '[data-hrzz-edit]{outline:1.5px dashed #D9B26F !important;outline-offset:2px;cursor:text !important}' +
      '[data-hrzz-hover]{outline:1px dashed rgba(217,178,111,.6) !important;outline-offset:2px;cursor:text !important}';
    document.head.appendChild(estilo);
  }
  function terminar(confirmar) {
    if (!atual) return;
    var el = atual;
    atual = null;
    el.removeAttribute('contenteditable');
    el.removeAttribute('data-hrzz-edit');
    var depois = el.textContent.replace(/\s+/g, ' ').trim();
    var antes = original.replace(/\s+/g, ' ').trim();
    if (!confirmar) {
      el.textContent = original;
    } else if (depois && depois !== antes) {
      avisar({ hrzz: 'texto-editado', antes: antes, depois: depois, antesBruto: original.trim(), depoisBruto: el.textContent.trim() });
    }
  }
  function aoPassar(e) {
    if (!editando) return;
    var el = folha(e.target);
    var velho = document.querySelector('[data-hrzz-hover]');
    if (velho && velho !== el) velho.removeAttribute('data-hrzz-hover');
    if (el && el !== atual) el.setAttribute('data-hrzz-hover', '');
  }
  function aoClicar(e) {
    if (!editando) return;
    var el = folha(e.target);
    if (!el) { if (atual) terminar(true); return; }
    e.preventDefault();
    e.stopPropagation();
    if (el === atual) return;
    if (atual) terminar(true);
    atual = el;
    original = el.textContent;
    el.removeAttribute('data-hrzz-hover');
    el.setAttribute('data-hrzz-edit', '');
    el.setAttribute('contenteditable', 'plaintext-only');
    el.focus();
    var r = document.createRange();
    r.selectNodeContents(el);
    var s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }
  function aoTeclar(e) {
    if (!editando || !atual) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); terminar(true); }
    else if (e.key === 'Escape') { e.preventDefault(); terminar(false); }
  }
  function aoSair(e) {
    if (atual && e.target === atual) terminar(true);
  }
  function definirEdicao(ligado) {
    editando = !!ligado;
    if (editando) {
      ligarEstilo();
      document.addEventListener('mouseover', aoPassar, true);
      document.addEventListener('click', aoClicar, true);
      document.addEventListener('keydown', aoTeclar, true);
      document.addEventListener('focusout', aoSair, true);
    } else {
      if (atual) terminar(true);
      document.removeEventListener('mouseover', aoPassar, true);
      document.removeEventListener('click', aoClicar, true);
      document.removeEventListener('keydown', aoTeclar, true);
      document.removeEventListener('focusout', aoSair, true);
      var h = document.querySelector('[data-hrzz-hover]');
      if (h) h.removeAttribute('data-hrzz-hover');
    }
  }
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || typeof e.data !== 'object') return;
    if (e.data.hrzz === 'editar') definirEdicao(e.data.ligado);
  });
  avisar({ hrzz: 'pronto' });
})();
`;
