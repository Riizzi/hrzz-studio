import Icone from './Icone';
import type { TarefaFila, TarefaTranscricao, Uso } from '../lib/api';
import './Topo.css';

type Props = {
  aberto: string | null;
  aoAbrir: (id: string) => void;
  servidorFora: boolean;
  uso: Uso;
  aoUsarHaiku: () => void;
  aoVoltarModelo: () => void;
  fila: TarefaTranscricao[];
  aoVerTranscricao: () => void;
  // etapa 5: tarefas em segundo plano
  tarefas: TarefaFila[];
  aoAbrirConversa: (id: number) => void;
  aoCancelarTarefa: (id: number) => void;
  aoGerenciarFila: () => void;
};

const ROTULO_ESTADO: Record<TarefaFila['estado'], string> = { fila: 'na fila', rodando: 'rodando', pronta: 'pronta', erro: 'erro', cancelada: 'cancelada' };

function renova(epoch?: number): string {
  if (!epoch) return '';
  const min = Math.max(0, Math.round((epoch * 1000 - Date.now()) / 60000));
  if (min < 60) return `renova em ${min} min`;
  return `renova em ${Math.floor(min / 60)} h ${min % 60} min`;
}

// Faixa de cima: nome, uso das assinaturas, fila e estado do PC.
// Uso e fila ganham dados reais nas etapas 1 e 5.
export default function Topo({ aberto, aoAbrir, servidorFora, uso, aoUsarHaiku, aoVoltarModelo, fila, aoVerTranscricao, tarefas, aoAbrirConversa, aoCancelarTarefa, aoGerenciarFila }: Props) {
  const pct = uso.cincoHoras;
  const abertas = tarefas.filter((t) => t.estado === 'fila' || t.estado === 'rodando');
  const recentes = tarefas.filter((t) => t.estado !== 'fila' && t.estado !== 'rodando').slice(0, 5);
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
          <Icone n="list-check" />{fila.length + abertas.length}<span className="lbl"> na fila</span>
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
          {alto && !uso.haikuAte && (
            <button className="bt prim" onClick={aoUsarHaiku}>
              usar o Haiku 5.5 até renovar
            </button>
          )}
          {uso.haikuAte && (
            <>
              <div className="nota">usando o Haiku 5.5 até renovar a janela de 5 h.</div>
              <button className="bt" onClick={aoVoltarModelo}>
                voltar ao modelo normal
              </button>
            </>
          )}
          <div className="uso-lin"><span className="pt gm" />Gemini (agy)<b className="mono">–</b></div>
          <div className="nota">o uso do agy não é lido ainda: o agy não informa a cota no fluxo.</div>
        </div>
      )}
      {aberto === 'fila' && (
        <div className="pop pop-fila" role="dialog" aria-label="Fila de tarefas">
          {fila.length === 0 && abertas.length === 0 && recentes.length === 0 && (
            <div className="nota">fila vazia. Transcrições longas e tarefas em segundo plano aparecem aqui. Mande uma mensagem pra fila pelo relógio ao lado do campo de texto.</div>
          )}
          {abertas.map((t) => (
            <div key={t.id} className="it-fila-lin">
              <button className="it-fila" onClick={() => t.conversaId && aoAbrirConversa(t.conversaId)} title={t.pedido}>
                <span className="it-fila-nome">{t.origem === 'agenda' ? 'agendada: ' : ''}{t.titulo}</span>
                <span className={`tag${t.estado === 'rodando' ? ' am' : ''}`}>{ROTULO_ESTADO[t.estado]}</span>
              </button>
              <button className="ib" aria-label={`Cancelar ${t.titulo}`} title="cancelar" onClick={() => aoCancelarTarefa(t.id)}>
                <Icone n="x" />
              </button>
            </div>
          ))}
          {recentes.map((t) => (
            <div key={t.id} className="it-fila-lin">
              <button className="it-fila" onClick={() => t.conversaId && aoAbrirConversa(t.conversaId)} title={t.erro ?? t.pedido}>
                <span className="it-fila-nome">{t.titulo}</span>
                <span className={`tag${t.estado === 'erro' ? ' am' : ''}`}>{ROTULO_ESTADO[t.estado]}</span>
              </button>
            </div>
          ))}
          {fila.map((t) => (
            <button key={t.id} className="it-fila" onClick={aoVerTranscricao}>
              <span className="it-fila-nome">transcrição: {t.titulo}</span>
              <span className="tag">{t.status === 'fila' ? 'na fila' : `${Math.round(t.pct)}%`}</span>
            </button>
          ))}
          <button className="bt fila-gerenciar" onClick={aoGerenciarFila}>
            agendamentos
          </button>
        </div>
      )}
    </>
  );
}
