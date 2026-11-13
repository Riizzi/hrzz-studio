import { useEffect, useRef, useState } from 'react';
import './Paleta.css';

export type AcaoPaleta = { id: string; rotulo: string; atalho?: string; executar: () => void };

type Props = { acoes: AcaoPaleta[]; aoFechar: () => void };

// Busca rapida (ctrl+k). Conversas entram na etapa 1; por enquanto so as acoes da interface.
export default function Paleta({ acoes, aoFechar }: Props) {
  const [texto, setTexto] = useState('');
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    campo.current?.focus();
  }, []);

  const q = texto.trim().toLowerCase();
  const lista = acoes.filter((a) => a.rotulo.toLowerCase().includes(q));

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
              if (e.key === 'Enter' && lista[0]) {
                lista[0].executar();
                aoFechar();
              }
            }}
          />
        </div>
        <div className="gr">ações</div>
        {lista.length === 0 && <div className="vazio">nada encontrado. A busca nas conversas liga na etapa 1.</div>}
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
