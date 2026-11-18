import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDitado } from '../lib/useDitado';
import Icone, { Braco } from './Icone';
import Floresta from './Floresta';
import Mensagens from './Mensagens';
import { api, ehGemini, nomeDoModelo, type Anexo, type ComandoItem } from '../lib/api';
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
  comandos: ComandoItem[];
};

const MODOS: { id: Modo; icone: string; descricao: string }[] = [
  { id: 'yolo', icone: 'bolt', descricao: 'faz tudo, até push. só apagar e sair da pasta perguntam' },
  { id: 'mid', icone: 'shield-half', descricao: 'faz tudo, menos apagar, sair da pasta e push' },
  { id: 'intern', icone: 'shield-check', descricao: 'pergunta antes de cada edição e comando' },
];

const NOMES_PENSAR = ['desligado', 'ligado', 'profundo'];
const NOMES_ESFORCO = ['leve', 'médio', 'máximo'];

export default function Chat({ h, aberto, aoAbrir, florestaLigada, painelAberto, aoAlternarPainel, aoAbrirProgresso, comandos }: Props) {
  // aviso de cota dispensado (vale ate a janela de 5 h renovar)
  const [cotaDispensada, setCotaDispensada] = useState<number | null>(null);
  const [legenda, setLegenda] = useState('');
  const [texto, setTexto] = useState('');
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [enviandoArquivo, setEnviandoArquivo] = useState(0);
  const [avisoAnexo, setAvisoAnexo] = useState<string | null>(null);
  // menu dos comandos salvos: aparece enquanto o texto e so "/algo"
  const [cmdSel, setCmdSel] = useState(0);
  const [cmdFechado, setCmdFechado] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const seguirFim = useRef(true);
  const arquivoInput = useRef<HTMLInputElement>(null);

  // ditado por voz: o texto entra no lugar do cursor (ou no fim, se o campo nao esta em foco)
  const selecao = useRef<{ ini: number; fim: number } | null>(null);
  const ditado = useDitado((falado) => {
    const c = campo.current;
    setTexto((atual) => {
      const ini = Math.min(selecao.current?.ini ?? atual.length, atual.length);
      const fim = Math.min(selecao.current?.fim ?? atual.length, atual.length);
      const antes = atual.slice(0, ini);
      const depois = atual.slice(fim);
      const sepA = antes && !/\s$/.test(antes) ? ' ' : '';
      const sepD = depois && !/^\s/.test(depois) ? ' ' : '';
      return antes + sepA + falado + sepD + depois;
    });
    c?.focus();
  });

  // anexos que vieram de fora do campo (rabisco do preview) entram na lista da proxima mensagem
  const { anexosPendentes, limparAnexosPendentes } = h;
  useEffect(() => {
    if (anexosPendentes.length === 0) return;
    setAnexos((l) => [...l, ...anexosPendentes]);
    limparAnexosPendentes();
    campo.current?.focus();
  }, [anexosPendentes, limparAnexosPendentes]);

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
  const dueto = o.parceria === 'dueto';
  const duelo = o.parceria === 'duelo';

  const conversa = h.conversaAtual;
  const titulo = conversa?.titulo ?? 'nova conversa';
  const feitas = h.progresso.filter((i) => i.estado === 'feito').length;
  const total = h.progresso.length;
  const nomeModelo = nomeDoModelo(o.modelo === 'auto' ? null : o.modelo, h.modelos);
  const ehGoogle = ehGemini(o.modelo);
  // Gemini com low/medium/high vira um item so ("-*") e o esforco escolhe a variante; os outros tem esforco fixo
  const esforcoFixo = ehGoogle && !o.modelo?.endsWith('-*');
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

  const filtroCmd = /^\/([a-z0-9-]*)$/.exec(texto);
  const sugeridos = filtroCmd && !cmdFechado ? comandos.filter((c) => c.nome.startsWith(filtroCmd[1])) : [];
  const menuCmd = sugeridos.length > 0;
  useEffect(() => {
    setCmdSel(0);
    setCmdFechado(false); // o esc fecha o menu so ate a proxima tecla
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);
  const escolherCmd = (c: ComandoItem) => {
    setTexto(`/${c.nome} `);
    campo.current?.focus();
  };

  // nome mostrado em cada lado do duelo
  const nomeDoLado = (l: { motor: 'claude' | 'agy'; modelo: string | null }) => (l.modelo ? nomeDoModelo(l.modelo, h.modelos) : l.motor === 'agy' ? 'Gemini' : 'Claude');
  const temGoogle = !!h.modelos && h.modelos.google.length > 0;

  // limite batido: troca de modelo e manda a ultima mensagem de novo
  const aoLimite = async (acao: 'haiku' | 'google') => {
    const ultimaMinha = [...h.mensagens].reverse().find((m) => m.papel === 'eu');
    if (!ultimaMinha) return;
    const c = ultimaMinha.conteudo as { texto: string; anexos?: Anexo[] };
    if (acao === 'haiku') {
      await h.usarHaiku(true);
      h.enviar(c.texto, c.anexos ?? []);
    } else {
      const g = h.modelos?.google[0];
      if (!g) return;
      await h.mudarOpcao({ modelo: g.id });
      h.enviar(c.texto, c.anexos ?? [], { modelo: g.id, parceria: '' });
    }
    seguirFim.current = true;
  };

  // guardiao de cota: aviso a partir de 80% da janela de 5 h
  const uso = h.uso;
  const mostrarCota = (uso.nivel === 'alto' || uso.nivel === 'limite') && !uso.haikuAte && cotaDispensada !== (uso.renovaEm ?? 0);
  const renovaTxt = (() => {
    if (!uso.renovaEm) return '';
    const min = Math.max(0, Math.round((uso.renovaEm * 1000 - Date.now()) / 60000));
    return min < 60 ? `renova em ${min} min` : `renova em ${Math.floor(min / 60)} h ${min % 60} min`;
  })();

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
          className={`ib${dueto ? ' on largo' : ''}`}
          title="dueto: Claude e Gemini trabalham juntos"
          aria-label="Modo dueto"
          aria-pressed={dueto}
          onClick={() => {
            void h.mudarOpcao({ parceria: dueto ? '' : 'dueto' });
            avisa(dueto ? 'dueto desligado' : 'dueto ligado');
          }}
        >
          <Icone n="users" />
          {dueto && <span className="rot">dueto</span>}
        </button>
        <button
          className={`ib${duelo ? ' on largo' : ''}`}
          title="duelo: os dois respondem e você escolhe"
          aria-label="Modo duelo"
          aria-pressed={duelo}
          onClick={() => {
            void h.mudarOpcao({ parceria: duelo ? '' : 'duelo' });
            avisa(duelo ? 'duelo desligado' : 'duelo ligado');
          }}
        >
          <Icone n="swords" />
          {duelo && <span className="rot">duelo</span>}
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
            {dueto
              ? 'dueto ligado: o Claude coordena e passa partes do trabalho pro Gemini, que trabalha numa subpasta do projeto'
              : 'duelo ligado: a mesma mensagem vai pros dois, cada um numa cópia dos arquivos; você escolhe a resposta'}
          </div>
        )}
        {mostrarCota && (
          <div className={`aviso-cota${uso.nivel === 'limite' ? ' limite-batido' : ''}`} role="status">
            <span>
              Claude em {Math.round(uso.cincoHoras ?? 0)}% da janela de 5 h{renovaTxt ? ` · ${renovaTxt}` : ''}
            </span>
            <button className="bt prim" onClick={() => void h.usarHaiku(true)}>
              usar o Haiku até renovar
            </button>
            <button className="bt" onClick={() => setCotaDispensada(uso.renovaEm ?? 0)}>
              dispensar
            </button>
          </div>
        )}
        {uso.haikuAte && (
          <div className="aviso-cota" role="status">
            <span>usando o Haiku até renovar a janela de 5 h</span>
            <button className="bt" onClick={() => void h.usarHaiku(false)}>
              voltar ao modelo normal
            </button>
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
          turnoLados={h.turnoLados}
          rodando={h.rodandoAtual}
          nomeModelo={nomeModelo === 'MVP' ? 'Claude' : nomeModelo}
          motor={ehGoogle ? 'agy' : 'claude'}
          nomeDoLado={nomeDoLado}
          temGoogle={temGoogle}
          aoEscolher={(op) => enviar(op)}
          aoResponderPermissao={h.responderPermissao}
          aoEscolherDuelo={(m, lado) => void h.escolherDuelo(m, lado)}
          aoLimite={(acao) => void aoLimite(acao)}
        />
      </div>

      <div className="comp">
        {(anexos.length > 0 || enviandoArquivo > 0 || avisoAnexo || ditado.fase !== 'parado' || ditado.aviso) && (
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
            {ditado.fase === 'gravando' && (
              <span className="tag am dita" role="status">
                ouvindo {Math.floor(ditado.segundos / 60)}:{String(Math.floor(ditado.segundos % 60)).padStart(2, '0')} · clique no microfone pra terminar
              </span>
            )}
            {ditado.fase === 'transcrevendo' && (
              <span className="tag dita" role="status">
                transcrevendo…
              </span>
            )}
            {ditado.aviso && ditado.fase === 'parado' && (
              <span className="tag am chip-anexo dita" role="alert">
                {ditado.aviso}
                <button className="x" aria-label="Dispensar aviso" onClick={() => ditado.setAviso(null)}>
                  <Icone n="x" />
                </button>
              </span>
            )}
          </div>
        )}
        {h.sugestoes.length > 0 && (
          <div className="sugestoes" aria-label="Sugestões de pedido">
            {h.sugestoes.map((sg) => (
              <button
                key={sg.rotulo}
                className="tag sugestao"
                onClick={() => {
                  setTexto(sg.texto);
                  campo.current?.focus();
                }}
              >
                {sg.rotulo}
              </button>
            ))}
          </div>
        )}
        {menuCmd && (
          <div className="pop menu-comandos" role="listbox" aria-label="Comandos salvos">
            {sugeridos.map((c, i) => (
              <div
                key={c.nome}
                className={`it${i === Math.min(cmdSel, sugeridos.length - 1) ? ' ativo' : ''}`}
                role="option"
                aria-selected={i === Math.min(cmdSel, sugeridos.length - 1)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolherCmd(c)}
              >
                <span className="nome-cmd">/{c.nome}</span>
                <span className="ds">{c.descricao}</span>
              </div>
            ))}
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
            placeholder="pergunte, peça um site, uma planilha... / pra comandos"
            aria-label="Mensagem"
            onChange={(e) => setTexto(e.target.value)}
            onSelect={(e) => {
              selecao.current = { ini: e.currentTarget.selectionStart, fim: e.currentTarget.selectionEnd };
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && ditado.fase === 'gravando') {
                e.preventDefault();
                ditado.cancelar();
                return;
              }
              if (menuCmd && !e.nativeEvent.isComposing) {
                const atual = sugeridos[Math.min(cmdSel, sugeridos.length - 1)];
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  setCmdSel((i) => (i + (e.key === 'ArrowDown' ? 1 : sugeridos.length - 1)) % sugeridos.length);
                  return;
                }
                if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && texto.trim() !== `/${atual.nome}`)) {
                  e.preventDefault();
                  escolherCmd(atual);
                  return;
                }
                if (e.key === 'Escape') {
                  setCmdFechado(true);
                  return;
                }
              }
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
          <button
            className={`ib${ditado.fase === 'gravando' ? ' on' : ''}`}
            title={ditado.fase === 'gravando' ? 'terminar o ditado' : 'ditado por voz'}
            aria-label="Ditado por voz"
            aria-pressed={ditado.fase === 'gravando'}
            disabled={ditado.fase === 'transcrevendo'}
            onClick={ditado.alternar}
          >
            <Icone n={ditado.fase === 'gravando' ? 'player-stop' : 'microphone'} />
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
              {conversa?.modeloAuto && o.modelo !== 'auto' ? ' · mvp' : ''}
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
            disabled={esforcoFixo}
            title={esforcoFixo ? 'esforço fixo nesse modelo' : `esforço: ${NOMES_ESFORCO[o.esforco]}`}
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
          <button
            className="ib"
            aria-label="Mandar pra fila"
            title="mandar pra fila: roda em segundo plano, como uma conversa nova"
            disabled={texto.trim().length === 0}
            onClick={async () => {
              if (await h.mandarParaFila(texto.trim())) {
                setTexto('');
                avisa('na fila');
              }
            }}
          >
            <Icone n="clock-play" />
          </button>
          <span className="leg">{legenda}</span>
        </div>
        {aberto === 'modelo' && (
          <div className="pop pop-modelo" role="menu" aria-label="Modelo">
            <div className={`it mvp${o.modelo === 'auto' ? ' sel' : ''}`} role="menuitem" onClick={() => void h.mudarOpcao({ modelo: 'auto' })}>
              <span>MVP</span>
              <span className="ds">o HRZZ escolhe o modelo pela tarefa</span>
            </div>
            <div className="divi" />
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
