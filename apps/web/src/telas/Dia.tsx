import { useCallback, useEffect, useState } from 'react';
import Icone from '../componentes/Icone';
import { Tela } from './Telas';
import { api, type EstadoRepo, type EventoAgenda, type ItemGithub, type ResumoAgenda, type ResumoDia } from '../lib/api';
import './Integracoes.css';

type Props = {
  ativa: boolean;
  aoAbrirConversa: (id: number) => void;
  aoIrParaConectores: () => void;
};

const ROTULO_GITHUB: Record<ItemGithub['tipo'], string> = { 'meu-pr': 'meu PR', revisar: 'revisar', issue: 'issue' };

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function diaDe(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const mesmo = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mesmo(d, hoje)) return 'hoje';
  if (mesmo(d, new Date(hoje.getTime() + 86_400_000))) return 'amanhã';
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function atras(ms: number): string {
  const min = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`;
}

function quandoFuturo(ms: number): string {
  return new Date(ms).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function porDia(eventos: EventoAgenda[]): { dia: string; itens: EventoAgenda[] }[] {
  const grupos: { dia: string; itens: EventoAgenda[] }[] = [];
  for (const e of eventos) {
    const dia = diaDe(e.inicio);
    const g = grupos.find((x) => x.dia === dia);
    if (g) g.itens.push(e);
    else grupos.push({ dia, itens: [e] });
  }
  return grupos;
}

function RepoLinha({ r }: { r: EstadoRepo }) {
  if (!r.existe) return (
    <div className="lin">
      <span className="nome-con">{r.nome}</span>
      <span className="tag">pasta não achada</span>
    </div>
  );
  if (!r.git) return (
    <div className="lin">
      <span className="nome-con">{r.nome}</span>
      <span className="tag">sem git</span>
    </div>
  );
  return (
    <div className="bloco-con">
      <div className="lin">
        <span className="nome-con" title={r.ultimo?.assunto}>{r.nome}</span>
        <span className="acoes-lin">
          <span className="tag mono">{r.ramo ?? '?'}</span>
          {!!r.alteracoes && <span className="tag am">{r.alteracoes} {r.alteracoes === 1 ? 'alteração' : 'alterações'}</span>}
          {!!r.aFrente && <span className="tag am" title="commits que ainda não foram pro GitHub">{r.aFrente} pra enviar</span>}
          {!!r.atras && <span className="tag" title="commits novos no GitHub">{r.atras} pra baixar</span>}
          {r.semRemoto && <span className="tag">sem GitHub</span>}
        </span>
      </div>
      {r.ultimo && <div className="nota-con">{r.ultimo.assunto} · {atras(r.ultimo.em)}</div>}
    </div>
  );
}

// Painel do dia: agenda, repositorios, pendencias das conversas e uso.
export function TelaDia({ ativa, aoAbrirConversa, aoIrParaConectores }: Props) {
  const [d, setD] = useState<ResumoDia | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [agenda, setAgenda] = useState<ResumoAgenda | null>(null);
  const [buscandoAgenda, setBuscandoAgenda] = useState(false);
  const [lendo, setLendo] = useState(false);

  const carregar = useCallback(async () => {
    setLendo(true);
    try {
      const r = await api<ResumoDia>('/api/dia');
      setD(r);
      setAgenda((a) => (a?.atualizando ? a : r.agenda));
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLendo(false);
    }
  }, []);

  useEffect(() => {
    if (!ativa) return;
    void carregar();
    // o GitHub e a agenda tem cache no servidor: reler a cada minuto so mexe no que mudou
    const t = window.setInterval(() => void carregar(), 60_000);
    // a primeira leitura dispara a consulta ao claude em segundo plano; a segunda ja sabe se a agenda esta conectada
    const t2 = window.setTimeout(() => void carregar(), 7000);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(t2);
    };
  }, [ativa, carregar]);

  const buscarAgenda = async () => {
    setBuscandoAgenda(true);
    try {
      setAgenda(await api<ResumoAgenda>('/api/dia/agenda/atualizar', { corpo: {} }));
    } catch (e) {
      setAgenda((a) => ({ ...(a ?? { disponivel: true, eventos: [], atualizando: false }), erro: (e as Error).message }));
    } finally {
      setBuscandoAgenda(false);
    }
  };

  const recarregarGithub = async () => {
    try {
      const g = await api<ResumoDia['github']>('/api/dia/github', { corpo: {} });
      setD((x) => (x ? { ...x, github: g } : x));
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  const ag = agenda ?? d?.agenda ?? null;
  const uso = d?.uso;
  const barra = (pct: number | undefined) => (pct === undefined ? '–' : `${pct}%`);

  return (
    <Tela id="dia" ativa={ativa} pinhos={{ l: 40, r: 8, s: 5, estilo: { bottom: 12, right: 16 } }}>
      <div className="topo-tela">
        <span className="mono titulo-tela">painel do dia</span>
        <button className="bt" onClick={() => void carregar()} disabled={lendo} aria-label="Atualizar o painel">
          <Icone n="refresh" /> {lendo ? 'lendo…' : 'atualizar'}
        </button>
        {d && <span className="dica-acervo">lido às {hora(new Date(d.quando).toISOString())}</span>}
      </div>
      {erro && <div className="aviso-acervo erro" role="alert">{erro}</div>}

      <div className="grade-cartoes">
        <div className="cardg semclique">
          <div className="cardg-titulo">agenda</div>
          {ag && !ag.disponivel && (
            <div className="vazio">
              {ag.motivo ?? 'agenda indisponível'}
              <div className="acoes-coluna">
                <button className="bt" onClick={aoIrParaConectores}>abrir conectores</button>
              </div>
            </div>
          )}
          {ag?.disponivel && ag.eventos.length === 0 && !ag.quando && <div className="vazio">ainda não busquei. A busca usa o claude (Haiku) e gasta um pouco da cota, por isso só roda quando você pede.</div>}
          {ag?.disponivel && ag.eventos.length === 0 && ag.quando && <div className="vazio">nada marcado pros próximos dias.</div>}
          {ag && porDia(ag.eventos).map((g) => (
            <div key={g.dia}>
              <div className="gr">{g.dia}</div>
              {g.itens.map((e, i) => (
                <div key={`${e.inicio}-${i}`} className="bloco-con">
                  <div className="lin">
                    <span className="nome-con" title={e.titulo}>{e.titulo}</span>
                    <span className="tag mono">{e.diaTodo ? 'dia todo' : hora(e.inicio)}</span>
                  </div>
                  {e.local && <div className="nota-con">{e.local}</div>}
                </div>
              ))}
            </div>
          ))}
          {ag?.erro && <div className="nota-acervo alerta" role="alert">{ag.erro}</div>}
          {ag?.disponivel && (
            <div className="acoes-coluna">
              <button className="bt" onClick={() => void buscarAgenda()} disabled={buscandoAgenda}>
                {buscandoAgenda ? 'buscando…' : ag.quando ? 'buscar de novo' : 'buscar agenda'}
              </button>
              {ag.quando && <span className="dica-acervo">buscada {atras(ag.quando)}</span>}
            </div>
          )}
        </div>

        <div className="cardg semclique">
          <div className="cardg-titulo">repositórios</div>
          {d && d.repositorios.length === 0 && <div className="vazio">nenhum projeto cadastrado ainda.</div>}
          {d?.repositorios.map((r) => <RepoLinha key={r.projetoId} r={r} />)}
          <div className="gr">no GitHub</div>
          {d && !d.github.ligado && (
            <div className="vazio">
              ligue o GitHub pra ver seus PRs, pedidos de revisão e issues aqui.
              <div className="acoes-coluna">
                <button className="bt" onClick={aoIrParaConectores}>abrir conectores</button>
              </div>
            </div>
          )}
          {d?.github.ligado && d.github.erro && <div className="nota-acervo alerta" role="alert">{d.github.erro}</div>}
          {d?.github.ligado && !d.github.erro && d.github.itens.length === 0 && <div className="vazio">nada aberto no seu nome.</div>}
          {d?.github.itens.map((i) => (
            <div key={`${i.repo}#${i.numero}`} className="bloco-con">
              <div className="lin">
                <a className="nome-con link-con" href={i.url} target="_blank" rel="noopener noreferrer" title={i.titulo}>{i.titulo}</a>
                <span className={`tag${i.tipo === 'revisar' ? ' am' : ''}`}>{ROTULO_GITHUB[i.tipo]}</span>
              </div>
              <div className="nota-con">{i.repo}#{i.numero}</div>
            </div>
          ))}
          {d?.github.ligado && (
            <div className="acoes-coluna">
              <button className="bt" onClick={() => void recarregarGithub()}>atualizar GitHub</button>
              {d.github.quando && <span className="dica-acervo">lido {atras(d.github.quando)}</span>}
            </div>
          )}
        </div>

        <div className="cardg semclique">
          <div className="cardg-titulo">pendências das conversas</div>
          {d && d.pendencias.length === 0 && <div className="vazio">nada em aberto. Os itens aparecem aqui quando a IA monta uma lista de tarefas.</div>}
          {d?.pendencias.map((p) => (
            <button
              key={p.id}
              className="lin clicavel linha-botao"
              onClick={() => p.conversaId && aoAbrirConversa(p.conversaId)}
              disabled={!p.conversaId}
              title={p.conversaTitulo ?? p.projetoNome ?? undefined}
            >
              <span className="texto-pendencia">
                {p.texto}
                <span className="nota-con">{p.conversaTitulo ?? p.projetoNome ?? 'solto'}</span>
              </span>
              <span className={`tag${p.estado === 'fazendo' ? ' am' : ''}`}>{p.estado === 'fazendo' ? 'fazendo' : 'a fazer'}</span>
            </button>
          ))}
        </div>

        <div className="cardg semclique">
          <div className="cardg-titulo">uso</div>
          <div className="lin">
            <span>Claude · janela de 5 h</span>
            <span className={`tag${uso && (uso.nivel === 'alto' || uso.nivel === 'limite') ? ' am' : ''}`}>{barra(uso?.cincoHoras)}</span>
          </div>
          <div className="lin">
            <span>Claude · semana</span>
            <span className="tag">{barra(uso?.seteDias)}</span>
          </div>
          {uso?.renovaEm && <div className="nota-con">a janela renova {quandoFuturo(uso.renovaEm * 1000)}</div>}
          {uso?.haikuAte && <div className="nota-con">usando o Haiku até renovar</div>}
          <div className="lin">
            <span>Gemini</span>
            <span className="tag" title="o agy não informa a cota">–</span>
          </div>
          <div className="gr">fila e agendamentos</div>
          <div className="lin">
            <span>na fila / rodando</span>
            <span className="tag">{d ? `${d.fila.naFila} / ${d.fila.rodando}` : '–'}</span>
          </div>
          {d?.fila.comErro.map((t) => (
            <div key={t.id} className="nota-con alerta-con" title={t.erro ?? undefined}>falhou: {t.titulo}</div>
          ))}
          {d?.fila.proximos.map((a) => (
            <div key={a.id} className="lin sub">
              <span className="nome-con" title={a.titulo}>{a.titulo}</span>
              <span className="tag">{quandoFuturo(a.proxima)}</span>
            </div>
          ))}
          {d && d.fila.proximos.length === 0 && <div className="nota-con">nenhum agendamento ligado.</div>}
        </div>
      </div>
    </Tela>
  );
}
