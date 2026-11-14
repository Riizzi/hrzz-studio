import { useCallback, useEffect, useRef, useState } from 'react';
import Icone from './Icone';
import { api, type Anexo, type ResultadoEdicao } from '../lib/api';
import type { Hrzz } from '../lib/useHrzz';
import type { Trabalho } from '../lib/useTrabalho';

type Props = { h: Hrzz; t: Trabalho };

type Pendente = { antes: string; depois: string; resultado: ResultadoEdicao | null };

function dataCurta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Aba "preview" do painel: o site do projeto num iframe (pelo proxy /preview/:porta), com a faixa de ferramentas
// do prototipo: versoes, desfazer, salvar versao, antes/depois, editar texto, rabiscar e ver no celular.
export default function PainelPreview({ h, t }: Props) {
  const { dados } = t;
  const prev = dados?.preview;
  const porta = prev?.rodando ? prev.porta : undefined;

  const [caminho, setCaminho] = useState('/');
  const [celular, setCelular] = useState(false);
  const [editar, setEditar] = useState(false);
  const [rabiscar, setRabiscar] = useState(false);
  const [antesDepois, setAntesDepois] = useState(false);
  const [referencia, setReferencia] = useState('ultimo');
  const [corte, setCorte] = useState(50);
  const [popVersoes, setPopVersoes] = useState(false);
  const [nomeVersao, setNomeVersao] = useState<string | null>(null);
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [portaManual, setPortaManual] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [imagens, setImagens] = useState<{ antes: string | null; depois: string | null; erro: string | null; carregando: boolean }>({ antes: null, depois: null, erro: null, carregando: false });

  const iframe = useRef<HTMLIFrameElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const caminhoRef = useRef(caminho);
  caminhoRef.current = caminho;
  const editarRef = useRef(editar);
  editarRef.current = editar;

  // ao trocar de projeto ou de porta, volta pra raiz e desliga as ferramentas
  useEffect(() => {
    setCaminho('/');
    setEditar(false);
    setRabiscar(false);
    setAntesDepois(false);
    setPendente(null);
    setMsg(null);
  }, [h.alvoChave, porta]);

  const dica = msg ?? t.aviso;

  // ---------- conversa com o script injetado no iframe ----------
  const mandarParaIframe = useCallback((m: Record<string, unknown>) => {
    iframe.current?.contentWindow?.postMessage({ hrzz: 'editar', ...m }, window.location.origin);
  }, []);

  useEffect(() => {
    mandarParaIframe({ ligado: editar });
  }, [editar, mandarParaIframe]);

  useEffect(() => {
    const aoReceber = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== iframe.current?.contentWindow) return;
      const d = e.data as { hrzz?: string; caminho?: string; antes?: string; depois?: string } | null;
      if (!d || typeof d !== 'object') return;
      if (d.hrzz === 'caminho' && typeof d.caminho === 'string') setCaminho(d.caminho.split('#')[0] || '/');
      if (d.hrzz === 'pronto' && editarRef.current) mandarParaIframe({ ligado: true });
      if (d.hrzz === 'texto-editado' && typeof d.antes === 'string' && typeof d.depois === 'string') {
        const { antes, depois } = d;
        setPendente({ antes, depois, resultado: null });
        void t.editarTexto(antes, depois).then((r) => {
          if (!r) return setPendente(null);
          if (r.ok) {
            setPendente(null);
            setMsg(`gravei em ${r.arquivo}. Dá pra desfazer pelo botão da seta.`);
            void t.carregar();
          } else if (r.motivo === 'invalido') {
            setPendente(null);
          } else {
            setPendente({ antes, depois, resultado: r });
          }
        });
      }
    };
    window.addEventListener('message', aoReceber);
    return () => window.removeEventListener('message', aoReceber);
  }, [mandarParaIframe, t]);

  const mandarPraIA = (p: Pendente) => {
    h.enviar(`No preview troquei o texto "${p.antes}" por "${p.depois}"${caminho !== '/' ? ` (página ${caminho})` : ''}. Atualize o código-fonte pra o site mostrar o texto novo. Procure onde o texto original está escrito.`, []);
    setPendente(null);
    setMsg('pedido enviado pro Claude');
  };

  // ---------- recarregar quando o projeto muda ----------
  useEffect(() => {
    if (t.recarga === 0) return;
    try {
      iframe.current?.contentWindow?.location.reload();
    } catch {
      /* iframe ainda nao carregou */
    }
  }, [t.recarga]);

  // ---------- rabisco ----------
  const ajustarTela = useCallback(() => {
    const c = tela.current;
    const b = caixa.current;
    if (!c || !b) return;
    const r = b.getBoundingClientRect();
    if (c.width !== Math.round(r.width) || c.height !== Math.round(r.height)) {
      c.width = Math.round(r.width);
      c.height = Math.round(r.height);
    }
  }, []);

  useEffect(() => {
    if (rabiscar) ajustarTela();
  }, [rabiscar, celular, ajustarTela]);

  const ponto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * e.currentTarget.width, y: ((e.clientY - r.top) / r.height) * e.currentTarget.height };
  };
  const aoDesenhar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    desenhando.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    ctx.strokeStyle = '#D9B26F';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const p = ponto(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const aoMover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!desenhando.current) return;
    const ctx = e.currentTarget.getContext('2d');
    const p = ponto(e);
    ctx?.lineTo(p.x, p.y);
    ctx?.stroke();
  };
  const limparRabisco = () => {
    const c = tela.current;
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
  };
  const anexarRabisco = async () => {
    const c = tela.current;
    if (!c || !h.alvoQuery) return;
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
    if (!blob) return;
    let rolagem = 0;
    try {
      rolagem = iframe.current?.contentWindow?.scrollY ?? 0;
    } catch {
      /* sem acesso ao iframe */
    }
    try {
      const a = await api<Anexo & { comPagina: boolean }>(
        `/api/preview/rabisco?${h.alvoQuery}&largura=${c.width}&altura=${c.height}&caminho=${encodeURIComponent(caminho)}&rolagem=${Math.round(rolagem)}`,
        { bruto: blob },
      );
      h.adicionarAnexo({ nome: a.nome, caminho: a.caminho, tipo: a.tipo });
      limparRabisco();
      setRabiscar(false);
      setMsg(a.comPagina ? 'rabisco anexado à próxima mensagem' : 'rabisco anexado (sem a captura da página, só o desenho)');
    } catch (e) {
      setMsg('não consegui anexar o rabisco: ' + (e as Error).message);
    }
  };

  // ---------- antes e depois ----------
  const versoes = dados?.versoes ?? [];
  useEffect(() => {
    if (!antesDepois || !h.alvoQuery || !porta) return;
    let vivo = true;
    const b = caixa.current?.getBoundingClientRect();
    const larg = Math.round(b?.width ?? 1280);
    const alt = Math.round(b?.height ?? 800);
    setImagens({ antes: null, depois: null, erro: null, carregando: true });
    const base = `/api/preview/captura?${h.alvoQuery}`;
    const busca = async (ref: string, extra = '') => {
      const r = await fetch(`${base}&ref=${ref}${extra}`, { cache: 'no-store' });
      if (!r.ok) {
        let m = 'não consegui a captura';
        try {
          m = ((await r.json()) as { erro?: string }).erro ?? m;
        } catch {
          /* resposta sem json */
        }
        throw new Error(m);
      }
      return URL.createObjectURL(await r.blob());
    };
    void Promise.allSettled([busca(referencia), busca('agora', `&largura=${larg}&altura=${alt}&caminho=${encodeURIComponent(caminho)}`)]).then(([a, d]) => {
      if (!vivo) {
        for (const x of [a, d]) if (x.status === 'fulfilled') URL.revokeObjectURL(x.value);
        return;
      }
      setImagens({
        antes: a.status === 'fulfilled' ? a.value : null,
        depois: d.status === 'fulfilled' ? d.value : null,
        erro: a.status === 'rejected' ? (a.reason as Error).message : d.status === 'rejected' ? (d.reason as Error).message : null,
        carregando: false,
      });
    });
    return () => {
      vivo = false;
    };
    // a captura de "agora" so refaz quando o projeto muda ou a referencia troca
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [antesDepois, referencia, porta, h.alvoQuery, t.recarga]);

  useEffect(() => {
    return () => {
      if (imagens.antes) URL.revokeObjectURL(imagens.antes);
      if (imagens.depois) URL.revokeObjectURL(imagens.depois);
    };
  }, [imagens.antes, imagens.depois]);

  // ---------- botoes ----------
  const alternar = (qual: 'editar' | 'rabiscar' | 'antesDepois') => {
    setMsg(null);
    t.setAviso(null);
    if (qual === 'editar') {
      setEditar((v) => !v);
      setRabiscar(false);
      setAntesDepois(false);
    } else if (qual === 'rabiscar') {
      setRabiscar((v) => !v);
      setEditar(false);
      setAntesDepois(false);
    } else {
      setAntesDepois((v) => !v);
      setEditar(false);
      setRabiscar(false);
    }
  };

  const salvar = async () => {
    const r = await t.salvarVersao(nomeVersao ?? '');
    if (r) {
      setNomeVersao(null);
      setReferencia(`v${r.versao.n}`);
    }
  };

  const ultima = versoes[versoes.length - 1];
  const semAlvo = !h.alvoQuery;
  const temFaixa = !semAlvo && !!dados;

  // ---------- sem alvo ou sem servidor ----------
  if (semAlvo) {
    return (
      <div className="pn">
        <div className="vazio">abra uma conversa (de preferência dentro de um projeto) pra ver o preview do site aqui.</div>
      </div>
    );
  }

  return (
    <div className="pn pn-preview">
      <div className="faixa" role="toolbar" aria-label="Ferramentas do preview">
        {porta ? (
          <span className="tag mono url" title={prev?.comando ?? 'servidor do projeto'}>
            :{porta}
          </span>
        ) : (
          <span className="tag mono url">sem servidor</span>
        )}
        <span className="pop-wrap">
          <button className="ib com-texto" title="versões salvas" aria-label="Versões salvas" disabled={!temFaixa} onClick={(e) => { e.stopPropagation(); setPopVersoes((v) => !v); }}>
            <Icone n="history" />
            <span className="mono">{ultima ? `v${ultima.n}` : 'v0'}</span>
          </button>
          {popVersoes && (
            <div className="pop pop-versoes" onClick={(e) => e.stopPropagation()}>
              {versoes.length === 0 && <div className="nota">nenhuma versão salva. Use o botão de marcador pra salvar a atual.</div>}
              {[...versoes].reverse().map((v) => (
                <div key={v.n} className="it versao">
                  <span className="v-nome">
                    <b className="mono">v{v.n}</b> {v.nome || <span className="ap">sem nome</span>}
                    <small>{dataCurta(v.data)}</small>
                  </span>
                  <button
                    className="bt"
                    disabled={!porta}
                    title="comparar com a tela atual"
                    onClick={() => {
                      setReferencia(`v${v.n}`);
                      setAntesDepois(true);
                      setEditar(false);
                      setRabiscar(false);
                      setPopVersoes(false);
                    }}
                  >
                    comparar
                  </button>
                  <button
                    className="bt"
                    onClick={() => {
                      setPopVersoes(false);
                      if (window.confirm(`voltar o projeto pra v${v.n}? O estado de agora fica guardado e dá pra desfazer.`)) void t.restaurar(v.n);
                    }}
                  >
                    voltar
                  </button>
                </div>
              ))}
            </div>
          )}
        </span>
        <span className="grp">
          <button className="ib" title="desfazer última mudança" aria-label="Desfazer última mudança" disabled={!temFaixa || !dados?.podeDesfazer || t.ocupado} onClick={() => void t.desfazer()}>
            <Icone n="arrow-back-up" />
          </button>
          <button className="ib" title="salvar versão" aria-label="Salvar versão" disabled={!temFaixa || t.ocupado} onClick={() => setNomeVersao((n) => (n === null ? '' : null))}>
            <Icone n="bookmark-plus" />
          </button>
        </span>
        <span style={{ flex: 1, minWidth: 0 }} />
        <span className="grp">
          <button className={`ib${antesDepois ? ' on' : ''}`} title="antes e depois" aria-label="Antes e depois" aria-pressed={antesDepois} disabled={!porta} onClick={() => alternar('antesDepois')}>
            <Icone n="arrows-diff" />
          </button>
          <button className={`ib${editar ? ' on' : ''}`} title="editar texto" aria-label="Editar texto" aria-pressed={editar} disabled={!porta} onClick={() => alternar('editar')}>
            <Icone n="cursor-text" />
          </button>
          <button className={`ib${rabiscar ? ' on' : ''}`} title="rabiscar" aria-label="Rabiscar" aria-pressed={rabiscar} disabled={!porta} onClick={() => alternar('rabiscar')}>
            <Icone n="pencil" />
          </button>
        </span>
        <span className="grp">
          <button className={`ib${celular ? ' on' : ''}`} title="ver no celular (360 px)" aria-label="Ver no celular" aria-pressed={celular} disabled={!porta} onClick={() => setCelular((v) => !v)}>
            <Icone n="device-mobile" />
          </button>
          <a className={`ib${porta ? '' : ' desligado'}`} title="abrir por completo (nova aba)" aria-label="Abrir por completo numa nova aba" href={porta ? `/preview/${porta}${caminho}` : undefined} target="_blank" rel="noreferrer">
            <Icone n="external-link" />
          </a>
        </span>
      </div>

      {nomeVersao !== null && (
        <form
          className="linha-ferramenta"
          onSubmit={(e) => {
            e.preventDefault();
            void salvar();
          }}
        >
          <input autoFocus placeholder="nome da versão (opcional)" aria-label="Nome da versão" maxLength={60} value={nomeVersao} onChange={(e) => setNomeVersao(e.target.value)} />
          <button className="bt prim" type="submit" disabled={t.ocupado}>
            salvar versão
          </button>
          <button className="bt" type="button" onClick={() => setNomeVersao(null)}>
            cancelar
          </button>
        </form>
      )}

      {porta ? (
        <div className="area-site">
          <div className={`site${celular ? ' celular' : ''}`} ref={caixa}>
            <iframe ref={iframe} key={`${h.alvoChave}:${porta}`} className="quadro" title="preview do projeto" src={`/preview/${porta}${caminhoRef.current === '/' ? '/' : caminhoRef.current}`} onLoad={() => mandarParaIframe({ ligado: editarRef.current })} />
            {antesDepois && (
              <>
                {imagens.depois && <img className="cap depois" src={imagens.depois} alt="tela atual" />}
                {imagens.antes && (
                  <div className="cap-velho" style={{ clipPath: `inset(0 ${100 - corte}% 0 0)` }}>
                    <img className="cap" src={imagens.antes} alt={referencia === 'ultimo' ? 'antes da última mudança' : `versão ${referencia}`} />
                    <span className="selo">{referencia === 'ultimo' ? 'antes' : referencia}</span>
                  </div>
                )}
                <div className="barra-ad" style={{ left: `${corte}%` }} />
                {imagens.carregando && <div className="carregando-ad">capturando as duas telas…</div>}
              </>
            )}
            <canvas ref={tela} className={`tela${rabiscar ? ' ativa' : ''}`} onPointerDown={aoDesenhar} onPointerMove={aoMover} onPointerUp={() => (desenhando.current = false)} onPointerLeave={() => (desenhando.current = false)} />
          </div>
        </div>
      ) : (
        <div className="sem-servidor">
          {prev?.subindo ? (
            <>
              <div className="vazio">subindo o servidor do projeto ({prev.comando})…</div>
              {prev.log && <pre className="log-servidor">{prev.log}</pre>}
            </>
          ) : (
            <>
              <div className="vazio">nenhum preview aberto. Suba o site do projeto pra ver ele aqui.</div>
              {prev?.erro && <div className="erro-linha">{prev.erro}</div>}
              {prev?.log && <pre className="log-servidor">{prev.log}</pre>}
              <div className="opcoes-servidor">
                {prev?.opcoes.npm && (
                  <button className="bt prim" disabled={t.ocupado} onClick={() => void t.iniciar('npm')}>
                    <Icone n="player-play" /> iniciar ({prev.opcoes.npm.comando})
                  </button>
                )}
                {prev?.opcoes.estatico && (
                  <button className="bt" disabled={t.ocupado} onClick={() => void t.iniciar('estatico')}>
                    <Icone n="world" /> abrir o site ({prev.opcoes.estatico.arquivo})
                  </button>
                )}
                {prev && !prev.opcoes.npm && !prev.opcoes.estatico && <div className="vazio">esse projeto não tem script "dev" nem index.html. Peça pro Claude criar o site, ou use uma porta que já esteja aberta.</div>}
              </div>
              <form
                className="linha-ferramenta"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (portaManual) void t.usarPorta(Number(portaManual));
                }}
              >
                <input inputMode="numeric" placeholder="ou use uma porta já aberta (ex.: 4321)" aria-label="Porta de um servidor já aberto" value={portaManual} onChange={(e) => setPortaManual(e.target.value.replace(/\D/g, '').slice(0, 5))} />
                <button className="bt" type="submit" disabled={!portaManual || t.ocupado}>
                  usar
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {porta && prev?.tipo !== 'manual' && (
        <div className="rodape-servidor">
          <span className="mono">{prev?.comando}</span>
          <button className="bt" onClick={() => void t.parar()}>
            desligar servidor
          </button>
        </div>
      )}

      {editar && !pendente && !dica && <div className="dica">editar texto: clique num texto do site e escreva por cima; Enter confirma, Esc cancela. Se o texto estiver só em um lugar do código, eu gravo direto.</div>}
      {rabiscar && (
        <div className="dica linha-dica">
          <span>rabiscar: desenhe em cima do site e anexe à próxima mensagem.</span>
          <button className="bt prim" onClick={() => void anexarRabisco()}>
            anexar
          </button>
          <button className="bt" onClick={limparRabisco}>
            limpar
          </button>
        </div>
      )}
      {antesDepois && (
        <div className="dica linha-dica">
          <label>
            antes:{' '}
            <select value={referencia} onChange={(e) => setReferencia(e.target.value)} aria-label="Versão pra comparar">
              <option value="ultimo">antes da última mudança da IA</option>
              {[...versoes].reverse().map((v) => (
                <option key={v.n} value={`v${v.n}`}>
                  v{v.n} {v.nome}
                </option>
              ))}
            </select>
          </label>
          {imagens.erro && <span className="erro-linha">{imagens.erro}</span>}
          <input type="range" min={0} max={100} value={corte} onChange={(e) => setCorte(Number(e.target.value))} aria-label="Antes e depois" />
        </div>
      )}
      {pendente?.resultado && !pendente.resultado.ok && (
        <div className="dica linha-dica">
          <span>
            {pendente.resultado.motivo === 'ambiguo'
              ? `esse texto aparece em ${pendente.resultado.ocorrencias} lugares (${(pendente.resultado.arquivos ?? []).slice(0, 3).join(', ')}).`
              : 'não achei esse texto no código (ele pode vir de um conteúdo dinâmico).'}
          </span>
          <button className="bt prim" onClick={() => mandarPraIA(pendente)}>
            mandar pro Claude
          </button>
          <button className="bt" onClick={() => setPendente(null)}>
            deixar
          </button>
        </div>
      )}
      {dica && !pendente && <div className="dica" role="status">{dica}</div>}
    </div>
  );
}
