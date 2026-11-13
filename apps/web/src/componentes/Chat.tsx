import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icone, { Braco } from './Icone';
import Floresta from './Floresta';
import Mensagens from './Mensagens';
import { api, nomeDoModelo, type Anexo } from '../lib/api';
import type { Hrzz } from '../lib/useHrzz';
import type { Modo } from '../tipos';
import './Chat.css';

type Props = {
  h: Hrzz;
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

export default function Chat({ h, aberto, aoAbrir, florestaLigada, painelAberto, aoAlternarPainel, aoAbrirProgresso }: Props) {
  const [dueto, setDueto] = useState(false);
  const [duelo, setDuelo] = useState(false);
  const [legenda, setLegenda] = useState('');
  const [texto, setTexto] = useState('');
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [enviandoArquivo, setEnviandoArquivo] = useState(0);
  const [avisoAnexo, setAvisoAnexo] = useState<string | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const seguirFim = useRef(true);
  const arquivoInput = useRef<HTMLInputElement>(null);

  const o = h.efetivas;
  const abre = (id: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    aoAbrir(id);
  };
  const avisa = (t: string) => {
    setLegenda(t);
    window.setTimeout(() => setLegenda(''), 1600);
  };
  const modoAtual = MODOS.find((m) => m.id === o.modo)!;

  const conversa = h.conversaAtual;
  const titulo = conversa?.titulo ?? 'nova conversa';
  const feitas = h.progresso.filter((i) => i.estado === 'feito').length;
  const total = h.progresso.length;
  const nomeModelo = nomeDoModelo(o.modelo === 'auto' ? null : o.modelo, h.modelos);
  const ehGoogle = !!h.modelos?.google.some((m) => m.id === o.modelo);
  const vazio = h.mensagens.length === 0 && !h.turno && !h.rodandoAtual;

  // campo cresce com o texto, ate 6 linhas
  useLayoutEffect(() => {
    const c = campo.current;
    if (!c) return;
    c.style.height = 'auto';
    c.style.height = `${Math.min(c.scrollHeight, 6 * 18)}px`;
  }, [texto]);

  // acompanha o fim da conversa enquanto chega texto, se o Joao nao rolou pra cima
  useEffect(() => {
    const r = rolagem.current;
    if (r && seguirFim.current) r.scrollTop = r.scrollHeight;
  }, [h.mensagens, h.turno, h.rodandoAtual]);

  useEffect(() => {
    seguirFim.current = true;
  }, [h.atual]);

  const aoRolar = () => {
    const r = rolagem.current;
    if (r) seguirFim.current = r.scrollHeight - r.scrollTop - r.clientHeight < 60;
  };

  const subir = async (arquivos: FileList | File[]) => {
    setAvisoAnexo(null);
    for (const f of Array.from(arquivos)) {
      if (f.size > 50 * 1024 * 1024) {
        setAvisoAnexo(`${f.name} passa de 50 MB`);
        continue;
      }
      setEnviandoArquivo((n) => n + 1);
      try {
        const a = await api<Anexo>(`/api/anexos?nome=${encodeURIComponent(f.name || 'colado.png')}`, { bruto: f });
        setAnexos((l) => [...l, a]);
      } catch (e) {
        setAvisoAnexo(`não consegui enviar ${f.name}: ${(e as Error).message}`);
      } finally {
        setEnviandoArquivo((n) => n - 1);
      }
    }
  };

  const podeEnviar = (texto.trim().length > 0 || anexos.length > 0) && !h.rodandoAtual && enviandoArquivo === 0;

  const enviar = (conteudo?: string) => {
    const t = (conteudo ?? texto).trim();
    if (!conteudo && !podeEnviar) return;
    if (!t && anexos.length === 0) return;
    h.enviar(t, conteudo ? [] : anexos);
    if (!conteudo) {
      setTexto('');
      setAnexos([]);
    }
    seguirFim.current = true;
  };

  return (
    <div className="cx chatbox">
      {florestaLigada && <Floresta />}
      <div className="hd">
        <span className="tt">{titulo}</span>
        <button className="chip prog-chip" title="progresso desta conversa" onClick={(e) => { e.stopPropagation(); aoAbrirProgresso(); }}>
          <span className="mini">
            <i style={{ width: total ? `${(feitas / total) * 100}%` : '0%' }} />
          </span>
          <span className="mono">
            {feitas}/{total}
          </span>
        </button>
        <button className={`modo ${o.modo === 'mid' ? '' : o.modo}`} title="modo de permissão" onClick={abre('modo')}>
          <Icone n={modoAtual.icone} />
          <span>{o.modo}</span>
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
            <div key={m.id} className={`it${m.id === o.modo ? ' sel' : ''}`} role="menuitem" onClick={() => void h.mudarOpcao({ modo: m.id })}>
              <span>
                <b className={`nome-modo ${m.id}`}>{m.id}</b>
              </span>
              <span className="ds">{m.descricao}</span>
            </div>
          ))}
        </div>
      )}

      <div className="conv" ref={rolagem} onScroll={aoRolar}>
        {(dueto || duelo) && (
          <div className="aviso-modo">
            {dueto ? 'dueto ligado: o Claude coordena e passa partes do trabalho pro Gemini (etapa 5)' : 'duelo ligado: os dois respondem e você escolhe (etapa 5)'}
          </div>
        )}
        {vazio && (
          <div className="vazio-chat">
            <div className="mono vazio-titulo">{h.projetoNovo ? (h.projetos.find((p) => p.id === h.projetoNovo)?.nome ?? 'nova conversa') : 'nova conversa'}</div>
            <div>pergunte, peça um site, um documento ou uma planilha. O modelo é escolhido pelo tipo de pedido; dá pra trocar no botão de baixo.</div>
          </div>
        )}
        <Mensagens
          mensagens={h.mensagens}
          turno={h.turno}
          rodando={h.rodandoAtual}
          nomeModelo={nomeModelo === 'automático' ? 'Claude' : nomeModelo}
          motor={ehGoogle ? 'agy' : 'claude'}
          aoEscolher={(op) => enviar(op)}
          aoResponderPermissao={h.responderPermissao}
        />
      </div>

      <div className="comp">
        {(anexos.length > 0 || enviandoArquivo > 0 || avisoAnexo) && (
          <div className="anexos-lista">
            {anexos.map((a, i) => (
              <span key={a.caminho} className="tag chip-anexo">
                <Icone n={a.tipo === 'imagem' ? 'photo' : 'file'} />
                <span className="nome-anexo">{a.nome}</span>
                <button className="x" aria-label={`Tirar ${a.nome}`} onClick={() => setAnexos((l) => l.filter((_, j) => j !== i))}>
                  <Icone n="x" />
                </button>
              </span>
            ))}
            {enviandoArquivo > 0 && <span className="tag">enviando…</span>}
            {avisoAnexo && <span className="tag am">{avisoAnexo}</span>}
          </div>
        )}
        <div className="campo">
          <input
            ref={arquivoInput}
            type="file"
            multiple
            hidden
            accept="image/*,.pdf,.docx,.txt,.md,.csv,.xlsx"
            onChange={(e) => {
              if (e.target.files) void subir(e.target.files);
              e.target.value = '';
            }}
          />
          <button className="ib" title="anexar imagem, pdf, docx ou txt" aria-label="Anexar" onClick={() => arquivoInput.current?.click()}>
            <Icone n="paperclip" />
          </button>
          <textarea
            ref={campo}
            className="txt"
            rows={1}
            value={texto}
            placeholder="pergunte, peça um site, uma planilha..."
            aria-label="Mensagem"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                enviar();
              }
            }}
            onPaste={(e) => {
              const arquivos = Array.from(e.clipboardData.files);
              if (arquivos.length) {
                e.preventDefault();
                void subir(arquivos);
              }
            }}
          />
          <button className="ib" title="ditado por voz (etapa 7)" aria-label="Ditado por voz" disabled>
            <Icone n="microphone" />
          </button>
          {h.rodandoAtual ? (
            <button className="ib envia" title="parar" aria-label="Parar" onClick={h.parar}>
              <Icone n="player-stop" />
            </button>
          ) : (
            <button className="ib envia" title="enviar (enter)" aria-label="Enviar" disabled={!podeEnviar} onClick={() => enviar()}>
              <Icone n="arrow-up" />
            </button>
          )}
        </div>
        <div className="barra">
          <button className="mod" aria-label="Escolher modelo" onClick={abre('modelo')}>
            <span className={`pt ${ehGoogle ? 'gm' : 'cl'}`} />
            <span className="nm">
              {nomeModelo}
              {conversa?.modeloAuto && o.modelo !== 'auto' ? ' · auto' : ''}
            </span>
            <Icone n="chevron-down" />
          </button>
          <span className="sep" />
          <button
            className={`ib${o.pensar === 0 ? ' dim' : ''}${o.pensar === 2 ? ' on brilho' : ''}`}
            aria-label="Pensamento"
            title={`pensamento: ${NOMES_PENSAR[o.pensar]}`}
            onClick={() => {
              const n = ((o.pensar + 1) % 3) as 0 | 1 | 2;
              void h.mudarOpcao({ pensar: n });
              avisa(`pensamento ${NOMES_PENSAR[n]}`);
            }}
          >
            <Icone n={o.pensar === 0 ? 'bulb-off' : 'bulb'} />
          </button>
          <button
            className={`ib${o.esforco === 0 ? ' dim' : ''}${o.esforco === 2 ? ' on' : ''}`}
            aria-label="Esforço"
            title={`esforço: ${NOMES_ESFORCO[o.esforco]}`}
            onClick={() => {
              const n = ((o.esforco + 1) % 3) as 0 | 1 | 2;
              void h.mudarOpcao({ esforco: n });
              avisa(`esforço ${NOMES_ESFORCO[n]}`);
            }}
          >
            <Braco nivel={o.esforco} />
          </button>
          <button
            className={`ib${o.web ? ' on' : ' dim'}`}
            aria-label="Pesquisa na web"
            title={`pesquisa na web: ${o.web ? 'ligada' : 'desligada'}`}
            onClick={() => {
              void h.mudarOpcao({ web: !o.web });
              avisa(`web ${!o.web ? 'ligada' : 'desligada'}`);
            }}
          >
            <Icone n="world" />
            <span className="badge" />
          </button>
          <span className="leg">{legenda}</span>
        </div>
        {aberto === 'modelo' && (
          <div className="pop pop-modelo" role="menu" aria-label="Modelo">
            <div className={`it${o.modelo === 'auto' ? ' sel' : ''}`} role="menuitem" onClick={() => void h.mudarOpcao({ modelo: 'auto' })}>
              <span>automático</span>
              <span className="ds">o HRZZ escolhe</span>
            </div>
            <div className="emp">
              <span className="pt cl" />
              Anthropic<small>sua assinatura</small>
            </div>
            {(h.modelos?.claude ?? [{ id: 'opus', nome: 'Opus 5.5', descricao: 'mais capaz' }, { id: 'sonnet', nome: 'Sonnet 5.5', descricao: 'equilibrado' }, { id: 'haiku', nome: 'Haiku 5.5', descricao: 'rápido' }]).map((m) => (
              <div key={m.id} className={`it${m.id === o.modelo ? ' sel' : ''}`} role="menuitem" onClick={() => void h.mudarOpcao({ modelo: m.id })}>
                <span>{m.nome}</span>
                <span className="ds">{m.descricao}</span>
              </div>
            ))}
            <div className="divi" />
            <div className="emp">
              <span className="pt gm" />
              Google<small>via agy</small>
            </div>
            {h.modelos && h.modelos.google.length > 0 ? (
              h.modelos.google.map((m) => (
                <div key={m.id} className={`it${m.id === o.modelo ? ' sel' : ''}`} role="menuitem" onClick={() => void h.mudarOpcao({ modelo: m.id })}>
                  <span className="nome-google">{m.nome}</span>
                </div>
              ))
            ) : (
              <div className="nota">não consegui ler a lista do agy. Rode npm run checar pra ver se ele está instalado.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
