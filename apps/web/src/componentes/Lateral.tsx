import { useState } from 'react';
import Icone from './Icone';
import Pinhos from './Pinhos';
import type { Hrzz } from '../lib/useHrzz';
import type { TelaId } from '../tipos';
import './Lateral.css';

type Props = {
  h: Hrzz;
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

export default function Lateral({ h, tela, aoIr, rail, aoAlternar, aoBuscar }: Props) {
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState('');
  const [pasta, setPasta] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const salvarProjeto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    try {
      const p = await h.criarProjeto(nome.trim(), pasta.trim());
      setNome('');
      setPasta('');
      setCriando(false);
      setErro(null);
      aoIr('chat');
      h.novaConversa(p.id);
    } catch (e2) {
      setErro((e2 as Error).message);
    }
  };

  const abrir = (id: number) => {
    aoIr('chat');
    void h.abrirConversa(id);
  };

  const recentes = h.conversas.slice(0, 20);

  return (
    <nav className="cx lado" aria-label="Navegação">
      <div className="marca">
        <button
          className="ib envia nova"
          title="nova conversa"
          aria-label="Nova conversa"
          onClick={() => {
            aoIr('chat');
            h.novaConversa(null);
          }}
        >
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

      <div className="gr gr-com-botao">
        <span>projetos</span>
        <button className="ib mini-ib" title="novo projeto" aria-label="Novo projeto" onClick={() => setCriando((v) => !v)}>
          <Icone n={criando ? 'x' : 'plus'} />
        </button>
      </div>
      {criando && (
        <form className="novo-proj proj" onSubmit={salvarProjeto}>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="nome" aria-label="Nome do projeto" autoFocus />
          <input value={pasta} onChange={(e) => setPasta(e.target.value)} placeholder="pasta (vazio = criar uma)" aria-label="Pasta do projeto" />
          {erro && <div className="erro-lado">{erro}</div>}
          <button className="bt prim" type="submit" disabled={!nome.trim()}>
            criar
          </button>
        </form>
      )}
      {h.projetos.length === 0 && !criando && <div className="vazio-lado proj">nenhum projeto ainda</div>}
      {h.projetos.map((p) => (
        <button
          key={p.id}
          className={`nav proj item-proj${h.projetoNovo === p.id && h.atual === null ? ' on' : ''}`}
          title={`${p.nome}\n${p.pasta}\nclique pra começar uma conversa nele`}
          onClick={() => {
            aoIr('chat');
            h.novaConversa(p.id);
          }}
        >
          <Icone n="folder" />
          <span>{p.nome}</span>
        </button>
      ))}

      <div className="gr">recentes</div>
      {recentes.length === 0 && <div className="vazio-lado rec">nenhuma conversa ainda</div>}
      <div className="lista-rec rec">
        {recentes.map((c) => (
          <div key={c.id} className={`conv-item${h.atual === c.id && tela === 'chat' ? ' on' : ''}`}>
            <button className="nav conv-abrir" title={c.titulo} onClick={() => abrir(c.id)}>
              <Icone n="message" />
              <span>{c.titulo}</span>
            </button>
            <button
              className="conv-apagar"
              aria-label={`Apagar ${c.titulo}`}
              title="apagar conversa"
              onClick={() => {
                if (window.confirm(`apagar a conversa "${c.titulo}"?`)) void h.apagarConversa(c.id);
              }}
            >
              <Icone n="x" />
            </button>
          </div>
        ))}
      </div>

      <div className="folga">
        <Pinhos largura={25} linhas={7} semente={11} className="lbl" style={{ bottom: 6, left: 2 }} />
      </div>
      {ITENS.map((i) => (
        <button key={i.v} className={`nav${tela === i.v ? ' on' : ''}`} data-v={i.v} title={i.titulo} onClick={() => aoIr(i.v)}>
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
