import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal as Xterm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { Hrzz } from '../lib/useHrzz';

// Terminal na pasta do projeto: xterm.js ligado ao pty do servidor por WebSocket (/api/term).
// O componente fica montado depois da primeira visita (a sessao do shell continua viva ao trocar de aba).
export default function Terminal({ h, visivel }: { h: Hrzz; visivel: boolean }) {
  const q = h.alvoQuery;
  const no = useRef<HTMLDivElement>(null);
  const termRef = useRef<Xterm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [estado, setEstado] = useState<'conectando' | 'ligado' | 'fechado'>('conectando');
  const [tentativa, setTentativa] = useState(0);

  const ajustar = useCallback(() => {
    const el = no.current;
    if (!el || el.clientWidth < 40 || el.clientHeight < 20) return; // aba escondida
    try {
      fitRef.current?.fit();
    } catch {
      /* ainda sem tamanho */
    }
  }, []);

  useEffect(() => {
    if (!q || !no.current) return;
    const term = new Xterm({
      fontFamily: "'Space Mono', monospace",
      fontSize: 12,
      lineHeight: 1.25,
      cursorBlink: true,
      scrollback: 4000,
      allowProposedApi: false,
      theme: { background: '#1C1917', foreground: '#E8DFD1', cursor: '#D9B26F', cursorAccent: '#1C1917', selectionBackground: '#3B3122', black: '#24201C', brightBlack: '#78716C', red: '#C99A8A', green: '#7FA8A0', yellow: '#D9B26F', blue: '#8FB0C9', magenta: '#B79AB8', cyan: '#7FA8A0', white: '#E8DFD1', brightWhite: '#FFFFFF' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(no.current);
    termRef.current = term;
    fitRef.current = fit;
    ajustar();

    let vivo = true;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/api/term?${q}&cols=${term.cols || 80}&rows=${term.rows || 24}`);
    wsRef.current = ws;
    setEstado('conectando');
    ws.onopen = () => {
      setEstado('ligado');
      ws.send(JSON.stringify({ t: 'tam', cols: term.cols, rows: term.rows }));
    };
    ws.onmessage = (m) => {
      let d: { t: string; d?: string; codigo?: number };
      try {
        d = JSON.parse(m.data);
      } catch {
        return;
      }
      if (d.t === 'o' && d.d) term.write(d.d);
      if (d.t === 'fim') term.write('\r\n\x1b[90m[o terminal fechou]\x1b[0m\r\n');
    };
    ws.onclose = () => vivo && setEstado('fechado');
    const entrada = term.onData((dado) => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'd', d: dado }));
    });
    const tamanho = term.onResize(({ cols, rows }) => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'tam', cols, rows }));
    });
    const obs = new ResizeObserver(() => ajustar());
    obs.observe(no.current);

    return () => {
      vivo = false;
      obs.disconnect();
      entrada.dispose();
      tamanho.dispose();
      ws.close();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      wsRef.current = null;
    };
  }, [q, tentativa, ajustar]);

  // ao voltar pra aba, ajusta o tamanho e devolve o foco
  useEffect(() => {
    if (!visivel) return;
    const t = window.setTimeout(() => {
      ajustar();
      termRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(t);
  }, [visivel, ajustar]);

  if (!q) return <div className="vazio">abra uma conversa pra abrir o terminal na pasta dela.</div>;

  return (
    <div className="terminal-caixa">
      <div className="terminal-no" ref={no} role="application" aria-label="Terminal do projeto" />
      {estado === 'fechado' && (
        <div className="terminal-aviso">
          <span>conexão com o terminal fechada.</span>
          <button className="bt" onClick={() => setTentativa((n) => n + 1)}>
            reconectar
          </button>
        </div>
      )}
    </div>
  );
}
