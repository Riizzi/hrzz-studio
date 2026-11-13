import { useState } from 'react';
import Icone from './Icone';
import Pinhos from './Pinhos';
import type { AbaPainel, EstadoPainel } from '../tipos';
import './Painel.css';

type Props = {
  estado: EstadoPainel;
  aba: AbaPainel;
  aoTrocarAba: (a: AbaPainel) => void;
  aoMaximizar: () => void;
  aoMinimizar: () => void;
};

const ABAS: AbaPainel[] = ['preview', 'progresso', 'terminal', 'arquivos'];

// Painel da direita: preview, progresso, terminal e arquivos. Cada aba ganha vida numa etapa.
export default function Painel({ estado, aba, aoTrocarAba, aoMaximizar, aoMinimizar }: Props) {
  const [escopo, setEscopo] = useState<'conversa' | 'projeto'>('conversa');
  const max = estado === 'max';
  return (
    <div className="cx painel">
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

      {aba === 'preview' && (
        <div className="pn">
          <div className="vazio">nenhum preview aberto. Quando um projeto tiver um site rodando, ele aparece aqui (etapa 2).</div>
        </div>
      )}

      {aba === 'progresso' && (
        <div className="pn">
          <div className="prog">
            <div className="prog-top">
              <span className="tt2">sem conversa aberta</span>
              <span className="seg">
                <button className={escopo === 'conversa' ? 'on' : ''} onClick={() => setEscopo('conversa')}>
                  conversa
                </button>
                <button className={escopo === 'projeto' ? 'on' : ''} onClick={() => setEscopo('projeto')}>
                  projeto
                </button>
              </span>
            </div>
            <div className="barra-prog" aria-hidden="true">
              <span className="f" style={{ width: '0%' }} />
              <span className="a" style={{ width: '0%' }} />
            </div>
            <div className="leg-prog">
              <span><b>0</b> feitas</span>
              <span><b>0</b> em andamento</span>
              <span><b>0</b> a fazer</span>
              <span style={{ marginLeft: 'auto' }}>0%</span>
            </div>
            <div className="vazio">a lista aparece quando a IA começar a trabalhar, e você também poderá adicionar itens (etapa 1).</div>
          </div>
        </div>
      )}

      {aba === 'terminal' && (
        <div className="pn">
          <div className="vazio">o terminal na pasta do projeto chega na etapa 2.</div>
        </div>
      )}

      {aba === 'arquivos' && (
        <div className="pn">
          <div className="vazio">a árvore de arquivos do projeto chega na etapa 2.</div>
          <Pinhos largura={18} linhas={6} semente={23} style={{ bottom: 10, right: 12 }} />
        </div>
      )}
    </div>
  );
}
