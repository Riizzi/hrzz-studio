import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icone from '../componentes/Icone';
import { Tela } from './Telas';
import './Transcricao.css';
import { api, ErroApi, type Anexo, type FontesAudio, type TarefaTranscricao, type Transcricao } from '../lib/api';
import type { TranscricaoHook } from '../lib/useTranscricao';

// os 99 idiomas do Whisper; os nomes saem do proprio navegador
const CODIGOS = 'en zh de es ru ko fr ja pt tr pl ca nl ar sv it id hi fi vi he uk el ms cs ro da hu ta no th ur hr bg lt la mi ml cy sk te fa lv bn sr az sl kn et mk br eu is hy ne mn bs kk sq sw gl mr pa si km sn yo so af oc ka be tg sd gu am yi lo uz fo ht ps tk nn mt sa lb my bo tl mg as tt haw ln ha ba jw su'.split(' ');

function listaIdiomas(): { codigo: string; nome: string }[] {
  let nomes: Intl.DisplayNames | null = null;
  try {
    nomes = new Intl.DisplayNames(['pt-BR'], { type: 'language' });
  } catch {
    /* navegador sem Intl.DisplayNames: usa o codigo */
  }
  const nome = (c: string) => {
    try {
      return nomes?.of(c === 'jw' ? 'jv' : c) ?? c;
    } catch {
      return c;
    }
  };
  const primeiros = ['pt', 'en', 'es'];
  const resto = CODIGOS.filter((c) => !primeiros.includes(c)).map((c) => ({ codigo: c, nome: nome(c) }));
  resto.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return [...primeiros.map((c) => ({ codigo: c, nome: nome(c) })), ...resto];
}

const MODELOS = [
  { id: 'large-v3-turbo', nome: 'turbo' },
  { id: 'small', nome: 'small' },
  { id: 'base', nome: 'base' },
  { id: 'tiny', nome: 'tiny' },
  { id: 'medium', nome: 'medium' },
];

function tempo(s: number): string {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const seg = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(seg).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
}

function faltam(eta: number | null): string {
  if (eta === null) return '';
  if (eta < 60) return `, faltam uns ${Math.max(eta, 1)} s`;
  return `, faltam uns ${Math.round(eta / 60)} min`;
}

function tamanho(b: number): string {
  if (b > 1024 * 1024 * 1024) return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (b > 1024 * 1024) return `${Math.round(b / 1024 / 1024)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
}

function quando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
}

function Seletor({ rotulo, valor, aoMudar, opcoes }: { rotulo: string; valor: string; aoMudar: (v: string) => void; opcoes: { id: string; nome: string }[] }) {
  return (
    <label className="esco sel">
      <span className="sel-rotulo">{rotulo}:</span>
      <select value={valor} onChange={(e) => aoMudar(e.target.value)} aria-label={rotulo}>
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
      </select>
      <Icone n="chevron-down" />
    </label>
  );
}

type Props = {
  ativa: boolean;
  t: TranscricaoHook;
  aoMandarProChat: (anexo: Anexo, titulo: string, sugestoes: { rotulo: string; texto: string }[]) => void;
};

export function TelaTranscricao({ ativa, t, aoMandarProChat }: Props) {
  const [aba, setAba] = useState<'arquivo' | 'youtube' | 'vivo'>('arquivo');
  const [idioma, setIdioma] = useState('auto');
  const [modelo, setModelo] = useState('large-v3-turbo');
  const [aviso, setAviso] = useState<string | null>(null);
  const idiomas = useMemo(() => [{ id: 'auto', nome: 'automático' }, ...listaIdiomas().map((i) => ({ id: i.codigo, nome: i.nome }))], []);
  const ligado = t.estado?.ligado ?? false;

  const consulta = (extra: Record<string, string>) => {
    const p = new URLSearchParams(extra);
    if (idioma !== 'auto') p.set('idioma', idioma);
    p.set('modelo', modelo);
    return p.toString();
  };

  return (
    <Tela id="tra" ativa={ativa} pinhos={{ l: 30, r: 7, s: 53, estilo: { bottom: 12, right: 16 } }}>
      <div className="tr">
        <div className="caixa">
          <div className="tabs" role="tablist">
            {(['arquivo', 'youtube', 'vivo'] as const).map((id) => (
              <button key={id} role="tab" aria-selected={aba === id} className={`tab${aba === id ? ' on' : ''}`} onClick={() => setAba(id)}>
                {id === 'vivo' ? 'ao vivo' : id}
              </button>
            ))}
          </div>
          <div className="cps">
            {t.estado && !ligado && (
              <div className="erro-linha" role="alert">
                o transcritor não está rodando. Ele sobe junto com o HRZZ; veja dados/logs/transcritor.log.
              </div>
            )}
            {aviso && (
              <div className="erro-linha" role="alert">
                {aviso}
              </div>
            )}
            {aba === 'arquivo' && <AbaArquivo consulta={consulta} aoAviso={setAviso} aoEnviado={() => void t.recarregarTarefas()} seletores={<Seletores idioma={idioma} setIdioma={setIdioma} modelo={modelo} setModelo={setModelo} idiomas={idiomas} />} />}
            {aba === 'youtube' && <AbaYoutube idioma={idioma} modelo={modelo} aoAviso={setAviso} aoEnviado={() => void t.recarregarTarefas()} seletores={<Seletores idioma={idioma} setIdioma={setIdioma} modelo={modelo} setModelo={setModelo} idiomas={idiomas} />} />}
            {aba === 'vivo' && <AbaVivo ativa={ativa} idioma={idioma} t={t} aoAviso={setAviso} idiomas={idiomas} setIdioma={setIdioma} />}
            <FilaLocal tarefas={t.tarefas} aoCancelar={async (id) => { await api(`/api/transcricao/tarefas/${id}/cancelar`, { corpo: {} }); void t.recarregarTarefas(); }} />
          </div>
        </div>

        <div className="caixa">
          <div className="cps">
            <div className="lnh">
              <span style={{ fontWeight: 500 }}>transcrições</span>
              <span style={{ flex: 1 }} />
              <span className="tag">local, nada sai do PC</span>
            </div>
            <ListaSalvas lista={t.lista} aoMudou={() => void t.recarregarLista()} aoMandarProChat={aoMandarProChat} aoAviso={setAviso} />
            <div className="dica">Mandar pro chat abre uma conversa com a transcrição anexada, pronta pra pedir resumo, ata ou tópicos. No chat, <span className="mono">/ata</span> usa a última transcrição.</div>
            {t.estado?.saude && (
              <div className="dica mono">
                {t.estado.saude.dispositivo === 'cuda' ? 'placa de vídeo' : 'processador'}, modelos na memória: {t.estado.saude.carregados.length ? t.estado.saude.carregados.join(', ') : 'nenhum'}
              </div>
            )}
          </div>
        </div>
      </div>
    </Tela>
  );
}

function Seletores({ idioma, setIdioma, modelo, setModelo, idiomas }: { idioma: string; setIdioma: (v: string) => void; modelo: string; setModelo: (v: string) => void; idiomas: { id: string; nome: string }[] }) {
  return (
    <>
      <Seletor rotulo="idioma" valor={idioma} aoMudar={setIdioma} opcoes={idiomas} />
      <Seletor rotulo="modelo" valor={modelo} aoMudar={setModelo} opcoes={MODELOS} />
    </>
  );
}

// ---------- aba arquivo ----------
function AbaArquivo({ consulta, aoAviso, aoEnviado, seletores }: { consulta: (extra: Record<string, string>) => string; aoAviso: (m: string | null) => void; aoEnviado: () => void; seletores: React.ReactNode }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [subindo, setSubindo] = useState<number | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const escolher = (f: File | undefined) => {
    if (!f) return;
    aoAviso(null);
    setArquivo(f);
  };

  const enviar = () => {
    if (!arquivo) return;
    aoAviso(null);
    setSubindo(0);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/transcricao/arquivo?${consulta({ nome: arquivo.name })}`);
    xhr.setRequestHeader('content-type', 'application/x-hrzz-midia');
    xhr.upload.onprogress = (e) => e.lengthComputable && setSubindo(e.loaded / e.total);
    xhr.onload = () => {
      setSubindo(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        setArquivo(null);
        aoEnviado();
      } else {
        let msg = `erro ${xhr.status}`;
        try {
          msg = (JSON.parse(xhr.responseText) as { erro?: string; detail?: string }).erro ?? (JSON.parse(xhr.responseText) as { detail?: string }).detail ?? msg;
        } catch {
          /* resposta sem JSON */
        }
        aoAviso(msg);
      }
    };
    xhr.onerror = () => {
      setSubindo(null);
      aoAviso('não consegui enviar o arquivo. O servidor está no ar?');
    };
    xhr.send(arquivo);
  };

  return (
    <>
      <div
        className={`solta${arrastando ? ' sobre' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => entrada.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && entrada.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          escolher(e.dataTransfer.files[0]);
        }}
      >
        <Icone n="upload" />
        <br />
        solte um áudio ou vídeo aqui, ou clique pra escolher
        <br />
        <span className="mono">mp3, wav, m4a, mp4, mkv, ogg...</span>
        <input ref={entrada} type="file" hidden accept="audio/*,video/*,.mkv,.m4a,.opus,.flac,.webm" onChange={(e) => escolher(e.target.files?.[0])} />
      </div>
      <div className="lnh">
        {seletores}
        <span style={{ flex: 1 }} />
        <button className="bt prim" disabled={!arquivo || subindo !== null} onClick={enviar}>
          transcrever
        </button>
      </div>
      {arquivo && (
        <div className="dica">
          {arquivo.name}, {tamanho(arquivo.size)}
        </div>
      )}
      {subindo !== null && (
        <>
          <div className="pg" role="progressbar" aria-valuenow={Math.round(subindo * 100)} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${Math.round(subindo * 100)}%` }} />
          </div>
          <div className="mono dica-ap">enviando, {Math.round(subindo * 100)}%</div>
        </>
      )}
    </>
  );
}

// ---------- aba youtube ----------
function AbaYoutube({ idioma, modelo, aoAviso, aoEnviado, seletores }: { idioma: string; modelo: string; aoAviso: (m: string | null) => void; aoEnviado: () => void; seletores: React.ReactNode }) {
  const [url, setUrl] = useState('');
  const [enviando, setEnviando] = useState(false);
  const enviar = async () => {
    aoAviso(null);
    setEnviando(true);
    try {
      await api('/api/transcricao/youtube', { corpo: { url: url.trim(), idioma: idioma === 'auto' ? undefined : idioma, modelo } });
      setUrl('');
      aoEnviado();
    } catch (e) {
      aoAviso(e instanceof ErroApi ? e.message : 'não consegui enviar o link');
    } finally {
      setEnviando(false);
    }
  };
  return (
    <>
      <div className="lnh">
        <input className="camp" type="url" value={url} placeholder="cole o link do vídeo" aria-label="Link do vídeo" onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && url.trim() && void enviar()} />
        <button className="bt prim" disabled={!url.trim() || enviando} onClick={() => void enviar()}>
          transcrever
        </button>
      </div>
      <div className="dica">Funciona com YouTube e qualquer site que o yt-dlp aceita. Só o áudio é baixado.</div>
      <div className="lnh">{seletores}</div>
    </>
  );
}

// ---------- aba ao vivo ----------
type LinhaViva = { inicio: number; texto: string };
type FaseViva = 'parado' | 'conectando' | 'carregando' | 'gravando' | 'finalizando';

function AbaVivo({
  ativa,
  idioma,
  setIdioma,
  t,
  aoAviso,
  idiomas,
}: {
  ativa: boolean;
  idioma: string;
  setIdioma: (v: string) => void;
  t: TranscricaoHook;
  aoAviso: (m: string | null) => void;
  idiomas: { id: string; nome: string }[];
}) {
  const [fonte, setFonte] = useState<'microfone' | 'pc' | 'os-dois'>('microfone');
  const [fontes, setFontes] = useState<FontesAudio | null>(null);
  const [fase, setFase] = useState<FaseViva>('parado');
  const [linhas, setLinhas] = useState<LinhaViva[]>([]);
  const [segundos, setSegundos] = useState(0);
  const [aviso, setAvisoViva] = useState<string | null>(null);
  const [salva, setSalva] = useState<{ id: string; titulo: string } | null>(null);
  const [refeita, setRefeita] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const gravador = useRef<MediaRecorder | null>(null);
  const fluxo = useRef<MediaStream | null>(null);
  const relogio = useRef<number | undefined>(undefined);
  const caixa = useRef<HTMLDivElement>(null);
  const modeloVivo = t.estado?.saude?.modeloVivo ?? 'small';
  const [modeloVivoEscolhido, setModeloVivoEscolhido] = useState<string | null>(null);

  useEffect(() => {
    if (!ativa) return;
    api<FontesAudio>('/api/transcricao/fontes')
      .then(setFontes)
      .catch(() => setFontes(null));
  }, [ativa]);

  useEffect(() => {
    caixa.current?.scrollTo({ top: caixa.current.scrollHeight });
  }, [linhas]);

  const soltar = useCallback(() => {
    window.clearInterval(relogio.current);
    try {
      if (gravador.current && gravador.current.state !== 'inactive') gravador.current.stop();
    } catch {
      /* ja parado */
    }
    gravador.current = null;
    fluxo.current?.getTracks().forEach((x) => x.stop());
    fluxo.current = null;
  }, []);

  useEffect(
    () => () => {
      soltar();
      ws.current?.close();
    },
    [soltar],
  );

  const gravando = fase !== 'parado';
  const modeloEfetivo = modeloVivoEscolhido ?? modeloVivo;
  const podePc = fontes?.disponivel ?? false;

  const comecar = async () => {
    aoAviso(null);
    setAvisoViva(null);
    setSalva(null);
    setRefeita(false);
    setLinhas([]);
    setSegundos(0);
    if (fonte === 'microfone') {
      if (!navigator.mediaDevices?.getUserMedia) {
        return aoAviso('o microfone do navegador só funciona em localhost ou https. Pelo celular, use "áudio do PC".');
      }
      if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        return aoAviso('este navegador não grava em webm/opus. Use o Chrome, o Edge ou o Firefox.');
      }
      try {
        fluxo.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } });
      } catch {
        return aoAviso('não consegui abrir o microfone. Veja se o navegador tem permissão.');
      }
    }
    setFase('conectando');
    const params = new URLSearchParams({ fonte, modelo: modeloEfetivo });
    if (idioma !== 'auto') params.set('idioma', idioma);
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/transcricao/ao-vivo?${params}`);
    socket.binaryType = 'arraybuffer';
    ws.current = socket;
    socket.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      const m = JSON.parse(e.data) as { tipo: string; inicio?: number; texto?: string; id?: string | null; titulo?: string | null };
      if (m.tipo === 'carregando') setFase('carregando');
      else if (m.tipo === 'pronto') {
        setFase('gravando');
        window.clearInterval(relogio.current);
        const t0 = Date.now();
        relogio.current = window.setInterval(() => setSegundos((Date.now() - t0) / 1000), 500);
        if (fonte === 'microfone' && fluxo.current) {
          const rec = new MediaRecorder(fluxo.current, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000 });
          rec.ondataavailable = async (ev) => {
            if (ev.data.size && socket.readyState === WebSocket.OPEN) socket.send(await ev.data.arrayBuffer());
          };
          rec.start(1000);
          gravador.current = rec;
        }
      } else if (m.tipo === 'texto') setLinhas((l) => [...l, { inicio: m.inicio ?? 0, texto: m.texto ?? '' }]);
      else if (m.tipo === 'aviso' || m.tipo === 'erro') {
        setAvisoViva(m.texto ?? 'erro');
        if (m.tipo === 'erro') {
          soltar();
          setFase((f) => (f === 'finalizando' ? f : 'parado'));
        }
      } else if (m.tipo === 'fim') {
        soltar();
        setFase('parado');
        if (m.id) {
          setSalva({ id: m.id, titulo: m.titulo ?? m.id });
          void t.recarregarLista();
        }
      }
    };
    socket.onclose = () => {
      soltar();
      setFase('parado');
    };
    socket.onerror = () => aoAviso('não consegui falar com o transcritor.');
  };

  const parar = () => {
    soltar();
    setFase('finalizando');
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send('parar');
    else setFase('parado');
  };

  const refazer = async () => {
    if (!salva) return;
    try {
      await api(`/api/transcricao/transcricoes/${salva.id}/refazer`, { corpo: { modelo: 'large-v3-turbo' } });
      setRefeita(true);
      void t.recarregarTarefas();
    } catch (e) {
      aoAviso((e as Error).message);
    }
  };

  const rotuloFase: Record<FaseViva, string> = { parado: 'gravar', conectando: 'conectando...', carregando: 'carregando o modelo...', gravando: 'parar', finalizando: 'salvando...' };

  return (
    <>
      <div className="lnh">
        <label className="esco sel">
          <span className="sel-rotulo">fonte:</span>
          <select value={fonte} disabled={gravando} onChange={(e) => setFonte(e.target.value as typeof fonte)} aria-label="Fonte do áudio">
            <option value="microfone">microfone</option>
            <option value="pc" disabled={!podePc}>
              áudio do PC
            </option>
            <option value="os-dois" disabled={!podePc}>
              os dois juntos
            </option>
          </select>
          <Icone n="chevron-down" />
        </label>
        <span style={{ flex: 1 }} />
        <span className="mono tempo" aria-live="off">
          {tempo(segundos)}
        </span>
        <button className={`bt gravar${fase === 'gravando' ? ' rec' : ''}`} disabled={fase === 'conectando' || fase === 'carregando' || fase === 'finalizando' || (t.estado !== null && !t.estado.ligado)} onClick={() => (fase === 'gravando' ? parar() : void comecar())}>
          <span className="ponto-rec" />
          <span>{rotuloFase[fase]}</span>
        </button>
      </div>
      <div className="lnh">
        <Seletor rotulo="idioma" valor={idioma} aoMudar={setIdioma} opcoes={idiomas} />
        <Seletor rotulo="modelo" valor={modeloEfetivo} aoMudar={setModeloVivoEscolhido} opcoes={MODELOS} />
      </div>
      <div className={`lnh${fase === 'gravando' ? ' gravando' : ''}`}>
        <span className="onda" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <i key={i} style={{ animationDelay: `${(i % 6) * 0.11}s` }} />
          ))}
        </span>
        <span className="dica-ap">
          {fonte === 'microfone' ? 'microfone do navegador' : fonte === 'pc' ? 'o que toca na caixa de som do PC' : 'microfone e áudio do PC somados'}
        </span>
      </div>
      {fontes && !fontes.disponivel && <div className="dica">{fontes.motivo ?? 'o áudio do PC não está disponível aqui'}. Só o microfone funciona.</div>}
      <div className="vivo" ref={caixa} aria-live="polite">
        {linhas.length === 0 ? (
          <span className="nv">{fase === 'carregando' ? 'carregando o modelo (a primeira vez baixa o modelo)...' : 'o texto aparece aqui em quase tempo real, de 4 em 4 segundos'}</span>
        ) : (
          linhas.map((l, i) => (
            <div key={i}>
              <span className="tm">{tempo(l.inicio)}</span>
              {l.texto}
            </div>
          ))
        )}
      </div>
      {aviso && <div className="erro-linha">{aviso}</div>}
      {salva && (
        <div className="lnh">
          <span className="dica">salva como “{salva.titulo}”.</span>
          <span style={{ flex: 1 }} />
          <button className="bt" disabled={refeita} onClick={() => void refazer()} title="roda o modelo turbo no áudio gravado, em segundo plano">
            {refeita ? 'refazendo na fila' : 'refazer com o modelo grande'}
          </button>
        </div>
      )}
    </>
  );
}

// ---------- fila ----------
function FilaLocal({ tarefas, aoCancelar }: { tarefas: TarefaTranscricao[]; aoCancelar: (id: string) => void }) {
  if (tarefas.length === 0) return null;
  const texto = (t: TarefaTranscricao) => {
    if (t.status === 'fila') return 'na fila';
    if (t.status === 'baixando') return `baixando, ${Math.round(t.pct)}%`;
    if (t.status === 'transcrevendo') return `${Math.round(t.pct)}%${faltam(t.eta_s)}`;
    if (t.status === 'pronta') return 'pronta';
    if (t.status === 'cancelada') return 'cancelada';
    return t.erro ?? 'erro';
  };
  return (
    <div className="fila-local" aria-label="Fila de transcrição">
      {tarefas.slice(0, 6).map((t) => {
        const ativa = t.status === 'fila' || t.status === 'baixando' || t.status === 'transcrevendo';
        return (
          <div key={t.id} className="tarefa">
            <div className="lnh">
              <span className="tarefa-nome">{t.titulo}</span>
              <span style={{ flex: 1 }} />
              {ativa && (
                <button className="ib" title="cancelar" aria-label={`Cancelar ${t.titulo}`} onClick={() => aoCancelar(t.id)}>
                  <Icone n="x" />
                </button>
              )}
            </div>
            {ativa && (
              <div className="pg" role="progressbar" aria-valuenow={Math.round(t.pct)} aria-valuemin={0} aria-valuemax={100}>
                <i style={{ width: `${Math.round(t.pct)}%` }} />
              </div>
            )}
            <div className={`mono dica-ap${t.status === 'erro' ? ' erro' : ''}`}>{texto(t)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- lista de transcricoes ----------
function ListaSalvas({ lista, aoMudou, aoMandarProChat, aoAviso }: { lista: Transcricao[]; aoMudou: () => void; aoMandarProChat: Props['aoMandarProChat']; aoAviso: (m: string | null) => void }) {
  const [aberta, setAberta] = useState<string | null>(null);
  const [texto, setTexto] = useState<string>('');

  const ver = async (id: string) => {
    if (aberta === id) return setAberta(null);
    try {
      const r = await fetch(`/api/transcricao/transcricoes/${id}.txt`);
      setTexto(await r.text());
      setAberta(id);
    } catch {
      aoAviso('não consegui abrir o texto');
    }
  };

  const mandar = async (x: Transcricao) => {
    try {
      const r = await api<{ anexo: Anexo; titulo: string; sugestoes: { rotulo: string; texto: string }[] }>(`/api/transcricao/transcricoes/${x.id}/chat`, { corpo: {} });
      aoMandarProChat(r.anexo, r.titulo, r.sugestoes);
    } catch (e) {
      aoAviso((e as Error).message);
    }
  };

  const apagar = async (x: Transcricao) => {
    if (!window.confirm(`Apagar a transcrição “${x.titulo}”? Os arquivos .txt e .srt somem.`)) return;
    try {
      await api(`/api/transcricao/transcricoes/${x.id}`, { metodo: 'DELETE' });
      aoMudou();
    } catch (e) {
      aoAviso((e as Error).message);
    }
  };

  if (lista.length === 0) return <div className="vazio">nenhuma transcrição ainda. O que você transcrever fica aqui e em dados/transcricoes.</div>;

  const origem = { arquivo: 'arquivo', youtube: 'youtube', 'ao-vivo': 'ao vivo' } as const;
  return (
    <div className="lista-tr">
      {lista.map((x, i) => (
        <div key={x.id} className={`item-tr${i === lista.length - 1 ? ' ultima' : ''}`}>
          <div className="lin lin-tr">
            <button className="titulo-tr" onClick={() => void ver(x.id)} aria-expanded={aberta === x.id} title="ver o texto">
              <span className="nome-tr">{x.titulo}</span>
              <span className="sub-tr">
                {origem[x.origem]}
                {x.duracao ? `, ${tempo(x.duracao)}` : ''}, {x.palavras} palavras, {quando(x.criada)}
              </span>
            </button>
            <span className="acoes-tr">
              <a className="ib" href={`/api/transcricao/transcricoes/${x.id}.txt`} download title="baixar .txt" aria-label={`Baixar txt de ${x.titulo}`}>
                <Icone n="file-text" />
              </a>
              <a className="ib" href={`/api/transcricao/transcricoes/${x.id}.srt`} download title="baixar .srt" aria-label={`Baixar legenda srt de ${x.titulo}`}>
                <Icone n="file-type-srt" />
              </a>
              <button className="ib" title="mandar pro chat" aria-label={`Mandar ${x.titulo} pro chat`} onClick={() => void mandar(x)}>
                <Icone n="message-forward" />
              </button>
              <button className="ib" title="apagar" aria-label={`Apagar ${x.titulo}`} onClick={() => void apagar(x)}>
                <Icone n="trash" />
              </button>
            </span>
          </div>
          {aberta === x.id && <pre className="texto-tr">{texto}</pre>}
        </div>
      ))}
    </div>
  );
}
