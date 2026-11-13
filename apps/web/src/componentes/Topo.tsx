import Icone from './Icone';
import './Topo.css';

type Props = {
  aberto: string | null;
  aoAbrir: (id: string) => void;
  servidorFora: boolean;
};

// Faixa de cima: nome, uso das assinaturas, fila e estado do PC.
// Uso e fila ganham dados reais nas etapas 1 e 5.
export default function Topo({ aberto, aoAbrir, servidorFora }: Props) {
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
          <span className="mini am">
            <i style={{ width: '0%' }} />
          </span>
          <span>–</span>
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
          <div className="nota">o uso do Claude e do agy aparece aqui quando a conversa estiver ligada (etapa 1).</div>
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
