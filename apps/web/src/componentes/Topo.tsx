import Icone from './Icone';
import type { Uso } from '../lib/api';
import './Topo.css';

type Props = {
  aberto: string | null;
  aoAbrir: (id: string) => void;
  servidorFora: boolean;
  uso: Uso;
  aoUsarHaiku: () => void;
};

function renova(epoch?: number): string {
  if (!epoch) return '';
  const min = Math.max(0, Math.round((epoch * 1000 - Date.now()) / 60000));
  if (min < 60) return `renova em ${min} min`;
  return `renova em ${Math.floor(min / 60)} h ${min % 60} min`;
}

// Faixa de cima: nome, uso das assinaturas, fila e estado do PC.
// Uso e fila ganham dados reais nas etapas 1 e 5.
export default function Topo({ aberto, aoAbrir, servidorFora, uso, aoUsarHaiku }: Props) {
  const pct = uso.cincoHoras;
  const alto = (pct ?? 0) >= 80;
  const abre = (id: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    aoAbrir(id);
  };
  return (
    <>
      <div className="topo">
        <span className="nome">
          HRZZ<span className="sub"> STUDIO</span>
        </span>
        <button className="chip" title="uso das assinaturas" onClick={abre('uso')}>
          <span className="pt cl" />
          <span className={"mini" + (alto ? ' am' : '')}>
            <i style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
          </span>
          <span>{pct === undefined ? '–' : `${Math.round(pct)}%`}</span>
          <span className="sep" style={{ margin: '0 2px', height: 10 }} />
          <span className="pt gm" />
          <span className="mini">
            <i style={{ width: '0%' }} />
          </span>
          <span>–</span>
        </button>
        <span style={{ flex: 1, minWidth: 0 }} />
        <button className="chip" title="fila de tarefas" onClick={abre('fila')}>
          <Icone n="list-check" />0<span className="lbl"> na fila</span>
        </button>
        <span className="chip" title={servidorFora ? 'o servidor não responde' : 'o servidor responde'}>
          <span className={`dot${servidorFora ? ' fora' : ''}`} />
          <span className="lbl">{servidorFora ? 'sem servidor' : 'pc ligado'}</span>
        </span>
      </div>
      {aberto === 'uso' && (
        <div className="pop pop-uso" role="dialog" aria-label="Uso das assinaturas">
          <div className="uso-lin"><span className="pt cl" />Claude, janela de 5 h<b className="mono">{pct === undefined ? '–' : `${Math.round(pct)}%`}</b></div>
          <div className="uso-lin"><span className="pt cl" />Claude, semana<b className="mono">{uso.seteDias === undefined ? '–' : `${Math.round(uso.seteDias)}%`}</b></div>
          {uso.renovaEm && <div className="nota">{renova(uso.renovaEm)}</div>}
          {pct === undefined && <div className="nota">o uso aparece depois da primeira resposta do Claude.</div>}
          {alto && (
            <button className="bt prim" onClick={aoUsarHaiku}>
              usar o Haiku 5.5 até renovar
            </button>
          )}
          <div className="uso-lin"><span className="pt gm" />Gemini (agy)<b className="mono">–</b></div>
          <div className="nota">o uso do agy não é lido ainda: o agy não informa a cota no fluxo.</div>
        </div>
      )}
      {aberto === 'fila' && (
        <div className="pop pop-fila" role="dialog" aria-label="Fila de tarefas">
          <div className="nota">fila vazia. Tarefas em segundo plano e agendamentos aparecem aqui (etapa 5).</div>
        </div>
      )}
    </>
  );
}
