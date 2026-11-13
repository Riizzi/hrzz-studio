import { useState } from 'react';
import Icone, { Braco } from './Icone';
import Floresta from './Floresta';
import type { Modo } from '../tipos';
import './Chat.css';

type Props = {
  aberto: string | null;
  aoAbrir: (id: string) => void;
  florestaLigada: boolean;
  painelAberto: boolean;
  aoAlternarPainel: () => void;
  aoAbrirProgresso: () => void;
};

const MODOS: { id: Modo; icone: string; descricao: string }[] = [
  { id: 'yolo', icone: 'bolt', descricao: 'faz tudo, até push. só apagar e sair da pasta perguntam' },
  { id: 'mid', icone: 'shield-half', descricao: 'faz tudo, menos apagar, sair da pasta e push' },
  { id: 'intern', icone: 'shield-check', descricao: 'pergunta antes de cada edição e comando' },
];

const NOMES_PENSAR = ['desligado', 'ligado', 'profundo'];
const NOMES_ESFORCO = ['leve', 'médio', 'máximo'];

// Chat: cabecalho, conversa e campo de texto. As mensagens de verdade chegam na etapa 1.
export default function Chat({ aberto, aoAbrir, florestaLigada, painelAberto, aoAlternarPainel, aoAbrirProgresso }: Props) {
  const [modo, setModo] = useState<Modo>('mid');
  const [dueto, setDueto] = useState(false);
  const [duelo, setDuelo] = useState(false);
  const [pensar, setPensar] = useState<0 | 1 | 2>(1);
  const [esforco, setEsforco] = useState<0 | 1 | 2>(1);
  const [web, setWeb] = useState(true);
  const [modelo, setModelo] = useState('Opus 5.5');
  const [legenda, setLegenda] = useState('');

  const abre = (id: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    aoAbrir(id);
  };
  const avisa = (texto: string) => {
    setLegenda(texto);
    window.setTimeout(() => setLegenda(''), 1600);
  };
  const modoAtual = MODOS.find((m) => m.id === modo)!;

  return (
    <div className="cx chatbox">
      {florestaLigada && <Floresta />}
      <div className="hd">
        <span className="tt">nova conversa</span>
        <button className="chip prog-chip" title="progresso desta conversa" onClick={(e) => { e.stopPropagation(); aoAbrirProgresso(); }}>
          <span className="mini">
            <i style={{ width: '0%' }} />
          </span>
          <span className="mono">0/0</span>
        </button>
        <button className={`modo ${modo === 'mid' ? '' : modo}`} title="modo de permissão" onClick={abre('modo')}>
          <Icone n={modoAtual.icone} />
          <span>{modo}</span>
        </button>
        <button
          className={`ib${dueto ? ' on' : ''}`}
          title="dueto: Claude e Gemini trabalham juntos"
          aria-label="Modo dueto"
          aria-pressed={dueto}
          onClick={() => {
            setDueto(!dueto);
            setDuelo(false);
          }}
        >
          <Icone n="users" />
        </button>
        <button
          className={`ib${duelo ? ' on' : ''}`}
          title="duelo: os dois respondem e você escolhe"
          aria-label="Modo duelo"
          aria-pressed={duelo}
          onClick={() => {
            setDuelo(!duelo);
            setDueto(false);
          }}
        >
          <Icone n="swords" />
        </button>
        <span className="sep" style={{ margin: '0 3px' }} />
        <button
          className={`ib${painelAberto ? ' on' : ''}`}
          title="painel lateral (ctrl+\)"
          aria-label="Abrir ou fechar o painel"
          onClick={aoAlternarPainel}
        >
          <Icone n="layout-sidebar-right" />
        </button>
      </div>

      {aberto === 'modo' && (
        <div className="pop pop-modo" role="menu" aria-label="Modo de permissão">
          {MODOS.map((m) => (
            <div key={m.id} className={`it${m.id === modo ? ' sel' : ''}`} role="menuitem" onClick={() => setModo(m.id)}>
              <span>
                <b className={`nome-modo ${m.id}`}>{m.id}</b>
              </span>
              <span className="ds">{m.descricao}</span>
            </div>
          ))}
        </div>
      )}

      <div className="conv">
        {(dueto || duelo) && (
          <div className="aviso-modo">
            {dueto
              ? 'dueto ligado: o Claude coordena e passa partes do trabalho pro Gemini (etapa 5)'
              : 'duelo ligado: os dois respondem e você escolhe (etapa 5)'}
          </div>
        )}
        <div className="vazio-chat">
          <div className="mono vazio-titulo">nova conversa</div>
          <div>a conversa com o Claude e com o Gemini liga na etapa 1. Por enquanto esta tela só mostra o layout.</div>
        </div>
      </div>

      <div className="comp">
        <div className="campo">
          <button className="ib" title="anexar (etapa 1)" aria-label="Anexar" disabled>
            <Icone n="paperclip" />
          </button>
          <input className="txt" type="text" placeholder="pergunte, peça um site, uma planilha... / pra comandos" aria-label="Mensagem" />
          <button className="ib" title="ditado por voz (etapa 7)" aria-label="Ditado por voz" disabled>
            <Icone n="microphone" />
          </button>
          <button className="ib envia" title="enviar (etapa 1)" aria-label="Enviar" disabled>
            <Icone n="arrow-up" />
          </button>
        </div>
        <div className="barra">
          <button className="mod" aria-label="Escolher modelo" onClick={abre('modelo')}>
            <span className="pt cl" />
            <span className="nm">{modelo}</span>
            <Icone n="chevron-down" />
          </button>
          <span className="sep" />
          <button
            className={`ib${pensar === 0 ? ' dim' : ''}${pensar === 2 ? ' on brilho' : ''}`}
            aria-label="Pensamento"
            title={`pensamento: ${NOMES_PENSAR[pensar]}`}
            onClick={() => {
              const n = ((pensar + 1) % 3) as 0 | 1 | 2;
              setPensar(n);
              avisa(`pensamento ${NOMES_PENSAR[n]}`);
            }}
          >
            <Icone n={pensar === 0 ? 'bulb-off' : 'bulb'} />
          </button>
          <button
            className={`ib${esforco === 0 ? ' dim' : ''}${esforco === 2 ? ' on' : ''}`}
            aria-label="Esforço"
            title={`esforço: ${NOMES_ESFORCO[esforco]}`}
            onClick={() => {
              const n = ((esforco + 1) % 3) as 0 | 1 | 2;
              setEsforco(n);
              avisa(`esforço ${NOMES_ESFORCO[n]}`);
            }}
          >
            <Braco nivel={esforco} />
          </button>
          <button
            className={`ib${web ? ' on' : ' dim'}`}
            aria-label="Pesquisa na web"
            title={`pesquisa na web: ${web ? 'ligada' : 'desligada'}`}
            onClick={() => {
              setWeb(!web);
              avisa(`web ${!web ? 'ligada' : 'desligada'}`);
            }}
          >
            <Icone n="world" />
            <span className="badge" />
          </button>
          <span className="leg">{legenda}</span>
        </div>
        {aberto === 'modelo' && (
          <div className="pop pop-modelo" role="menu" aria-label="Modelo">
            <div className="emp">
              <span className="pt cl" />
              Anthropic<small>sua assinatura</small>
            </div>
            {['Opus 5.5', 'Sonnet 5.5', 'Haiku 5.5'].map((m) => (
              <div key={m} className={`it${m === modelo ? ' sel' : ''}`} role="menuitem" onClick={() => setModelo(m)}>
                <span>{m}</span>
                <span className="ds">{m.startsWith('Opus') ? 'mais capaz' : m.startsWith('Sonnet') ? 'equilibrado' : 'rápido'}</span>
              </div>
            ))}
            <div className="divi" />
            <div className="emp">
              <span className="pt gm" />
              Google<small>via agy</small>
            </div>
            <div className="nota">a lista de modelos vem do próprio agy (etapa 1).</div>
          </div>
        )}
      </div>
    </div>
  );
}
