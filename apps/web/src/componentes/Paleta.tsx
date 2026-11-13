import { useEffect, useRef, useState } from 'react';
import { api, type ResultadoBusca } from '../lib/api';
import './Paleta.css';

export type AcaoPaleta = { id: string; rotulo: string; atalho?: string; executar: () => void };

type Props = { acoes: AcaoPaleta[]; aoAbrirConversa: (id: number) => void; aoFechar: () => void };

// Busca rapida (ctrl+k): acoes da interface e texto das conversas.
export default function Paleta({ acoes, aoAbrirConversa, aoFechar }: Props) {
  const [texto, setTexto] = useState('');
  const [achadas, setAchadas] = useState<ResultadoBusca[]>([]);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    campo.current?.focus();
  }, []);

  const q = texto.trim().toLowerCase();
  const lista = acoes.filter((a) => a.rotulo.toLowerCase().includes(q));

  useEffect(() => {
    if (q.length < 2) {
      setAchadas([]);
      return;
    }
    let vivo = true;
    const t = window.setTimeout(() => {
      api<ResultadoBusca[]>(`/api/busca?q=${encodeURIComponent(q)}`)
        .then((r) => vivo && setAchadas(r))
        .catch(() => vivo && setAchadas([]));
    }, 180);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [q]);

  const abrir = (id: number) => {
    aoAbrirConversa(id);
    aoFechar();
  };

  return (
    <div className="paleta" onClick={aoFechar} role="dialog" aria-label="Buscar">
      <div className="cx paleta-caixa" onClick={(e) => e.stopPropagation()}>
        <div className="campo paleta-campo">
          <input
            ref={campo}
            className="txt mono"
            value={texto}
            placeholder="buscar ações e conversas"
            aria-label="Buscar"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (achadas[0]) abrir(achadas[0].conversaId);
                else if (lista[0]) {
                  lista[0].executar();
                  aoFechar();
                }
              }
            }}
          />
        </div>
        {achadas.length > 0 && <div className="gr">conversas</div>}
        {achadas.map((c) => (
          <button key={c.conversaId} className="lin clicavel paleta-linha" onClick={() => abrir(c.conversaId)}>
            <span>{c.titulo}</span>
            {c.trecho && <span className="tag mono trecho">{c.trecho}</span>}
          </button>
        ))}
        <div className="gr">ações</div>
        {lista.length === 0 && achadas.length === 0 && <div className="vazio">nada encontrado.</div>}
        {lista.map((a) => (
          <button
            key={a.id}
            className="lin clicavel paleta-linha"
            onClick={() => {
              a.executar();
              aoFechar();
            }}
          >
            <span>{a.rotulo}</span>
            {a.atalho && <span className="tag mono">{a.atalho}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
