import { useEffect, useState } from 'react';
import Icone from './Icone';
import Arquivos from './Arquivos';
import PainelPreview from './PainelPreview';
import Progresso from './Progresso';
import Terminal from './Terminal';
import { useTrabalho } from '../lib/useTrabalho';
import type { Hrzz } from '../lib/useHrzz';
import type { AbaPainel, EstadoPainel } from '../tipos';
import './Painel.css';
import './Preview.css';

type Props = {
  h: Hrzz;
  estado: EstadoPainel;
  aba: AbaPainel;
  aoTrocarAba: (a: AbaPainel) => void;
  aoMaximizar: () => void;
  aoMinimizar: () => void;
  // sobe a cada vez que o preview atualiza sozinho: a borda pisca em ambar uma vez
  piscar: number;
};

const ABAS: AbaPainel[] = ['preview', 'progresso', 'terminal', 'arquivos'];

// Painel da direita: preview, progresso, terminal e arquivos.
export default function Painel({ h, estado, aba, aoTrocarAba, aoMaximizar, aoMinimizar, piscar }: Props) {
  const max = estado === 'max';
  const t = useTrabalho(h);
  const [terminalVisitado, setTerminalVisitado] = useState(false);
  const [piscando, setPiscando] = useState(false);

  useEffect(() => {
    if (aba === 'terminal') setTerminalVisitado(true);
  }, [aba]);

  useEffect(() => {
    if (!piscar) return;
    setPiscando(false);
    const a = window.setTimeout(() => setPiscando(true), 20);
    const b = window.setTimeout(() => setPiscando(false), 1800);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [piscar]);

  return (
    <div className={`cx painel${piscando ? ' novo' : ''}`}>
      <div className="tabs" role="tablist">
        {ABAS.map((a) => (
          <button key={a} role="tab" aria-selected={aba === a} className={`tab${aba === a ? ' on' : ''}`} onClick={() => aoTrocarAba(a)}>
            {a}
          </button>
        ))}
        <span style={{ flex: 1, minWidth: 0 }} />
        <button
          className="ib maxim"
          title={max ? 'voltar pro chat' : 'abrir o painel por completo'}
          aria-label={max ? 'Voltar pro chat' : 'Abrir o painel por completo'}
          onClick={aoMaximizar}
        >
          <Icone n={max ? 'arrows-minimize' : 'arrows-maximize'} />
        </button>
        <button className="ib" title="fechar painel" aria-label="Fechar painel" onClick={aoMinimizar}>
          <Icone n="layout-sidebar-right-collapse" />
        </button>
      </div>

      <div className={`aba-corpo${aba === 'preview' ? ' on' : ''}`}>
        <PainelPreview h={h} t={t} />
      </div>

      {aba === 'progresso' && (
        <div className="pn">
          <Progresso h={h} />
        </div>
      )}

      {terminalVisitado && (
        <div className={`aba-corpo${aba === 'terminal' ? ' on' : ''}`}>
          <div className="pn pn-terminal">
            <Terminal key={h.alvoQuery ?? 'nenhum'} h={h} visivel={aba === 'terminal'} />
          </div>
        </div>
      )}

      <div className={`aba-corpo${aba === 'arquivos' ? ' on' : ''}`}>
        <div className="pn">
          <Arquivos h={h} visivel={aba === 'arquivos'} />
        </div>
      </div>
    </div>
  );
}
