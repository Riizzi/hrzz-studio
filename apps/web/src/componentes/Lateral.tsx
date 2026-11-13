import Icone from './Icone';
import Pinhos from './Pinhos';
import type { TelaId } from '../tipos';
import './Lateral.css';

type Props = {
  tela: TelaId;
  aoIr: (t: TelaId) => void;
  rail: boolean;
  aoAlternar: () => void;
  aoBuscar: () => void;
};

const ITENS: { v: TelaId; icone: string; rotulo: string; titulo: string }[] = [
  { v: 'dia', icone: 'sun-high', rotulo: 'painel do dia', titulo: 'painel do dia' },
  { v: 'tra', icone: 'microphone-2', rotulo: 'transcrição', titulo: 'transcrição' },
  { v: 'gal', icone: 'layout-grid', rotulo: 'galeria', titulo: 'galeria' },
  { v: 'mem', icone: 'brain', rotulo: 'memória', titulo: 'memória' },
  { v: 'skl', icone: 'sparkles', rotulo: 'skills e comandos', titulo: 'skills e comandos' },
  { v: 'con', icone: 'plug', rotulo: 'conectores', titulo: 'conectores' },
  { v: 'cfg', icone: 'settings', rotulo: 'acesso e ajustes', titulo: 'acesso e ajustes' },
];

export default function Lateral({ tela, aoIr, rail, aoAlternar, aoBuscar }: Props) {
  return (
    <nav className="cx lado" aria-label="Navegação">
      <div className="marca">
        <button className="ib envia nova" title="nova conversa" aria-label="Nova conversa" onClick={() => aoIr('chat')}>
          <Icone n="plus" />
        </button>
      </div>
      <button
        className="mono busca"
        onClick={(e) => {
          e.stopPropagation();
          aoBuscar();
        }}
      >
        <Icone n="search" />
        <span className="lbl">buscar ctrl+k</span>
      </button>
      <button
        className={`nav so-rail${tela === 'chat' ? ' on' : ''}`}
        data-v="chat"
        title="conversa atual"
        style={{ marginTop: 6 }}
        onClick={() => aoIr('chat')}
      >
        <Icone n="message" />
      </button>
      <div className="gr">projetos</div>
      <div className="vazio-lado proj">nenhum projeto ainda</div>
      <div className="gr">recentes</div>
      <div className="vazio-lado rec">nenhuma conversa ainda</div>
      <div className="folga">
        <Pinhos largura={25} linhas={7} semente={11} className="lbl" style={{ bottom: 6, left: 2 }} />
      </div>
      {ITENS.map((i) => (
        <button
          key={i.v}
          className={`nav${tela === i.v ? ' on' : ''}`}
          data-v={i.v}
          title={i.titulo}
          onClick={() => aoIr(i.v)}
        >
          <Icone n={i.icone} />
          <span className="lbl">{i.rotulo}</span>
        </button>
      ))}
      <div className="div-lado" />
      <button
        className="nav"
        title={rail ? 'abrir barra lateral' : 'recolher barra lateral'}
        onClick={(e) => {
          e.stopPropagation();
          aoAlternar();
        }}
      >
        <Icone n={rail ? 'layout-sidebar-left-expand' : 'layout-sidebar-left-collapse'} />
        <span className="lbl">recolher</span>
      </button>
    </nav>
  );
}
