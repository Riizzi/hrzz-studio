import { useEffect, useState } from 'react';
import { api, type Projeto } from '../lib/api';
import type { Fila } from '../lib/useFila';

type Props = { fila: Fila; projetos: Projeto[]; ativa: boolean };

type Quando = 'diario' | 'uteis' | 'semanal' | 'horaria' | 'cron';

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export function montarCron(q: Quando, hora: string, dia: number, cron: string): string {
  const [h, m] = hora.split(':').map((x) => Number(x));
  const hh = Number.isFinite(h) ? h : 8;
  const mm = Number.isFinite(m) ? m : 0;
  if (q === 'diario') return `${mm} ${hh} * * *`;
  if (q === 'uteis') return `${mm} ${hh} * * 1-5`;
  if (q === 'semanal') return `${mm} ${hh} * * ${dia}`;
  if (q === 'horaria') return '0 * * * *';
  return cron.trim();
}

export function quando(ms: number | null): string {
  if (!ms) return 'desligado';
  return new Date(ms).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const ROTULO_ESTADO = { fila: 'na fila', rodando: 'rodando', pronta: 'pronta', erro: 'erro', cancelada: 'cancelada' } as const;

// Telas de ajustes da etapa 5: fila em segundo plano, agendamentos e a pasta do Gemini no dueto.
export function CartoesIaJunta({ fila, projetos, ativa }: Props) {
  const [aberto, setAberto] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [pedido, setPedido] = useState('');
  const [projeto, setProjeto] = useState('');
  const [tipo, setTipo] = useState<Quando>('diario');
  const [hora, setHora] = useState('08:00');
  const [dia, setDia] = useState(1);
  const [cron, setCron] = useState('0 8 * * 1-5');
  const [previa, setPrevia] = useState<{ ok: boolean; erro?: string; proximas?: number[] } | null>(null);
  const [subpasta, setSubpasta] = useState('arte');
  const [msgDueto, setMsgDueto] = useState<string | null>(null);

  const expressao = montarCron(tipo, hora, dia, cron);

  // mostra as proximas execucoes (ou o motivo do cron estar errado) antes de criar
  useEffect(() => {
    if (!aberto) return;
    const t = window.setTimeout(() => {
      api<{ ok: boolean; erro?: string; proximas?: number[] }>('/api/agendamentos/validar', { corpo: { cron: expressao } })
        .then(setPrevia)
        .catch(() => setPrevia(null));
    }, 300);
    return () => window.clearTimeout(t);
  }, [aberto, expressao]);

  useEffect(() => {
    if (!ativa) return;
    api<{ subpasta: string }>('/api/dueto/ajustes')
      .then((a) => setSubpasta(a.subpasta))
      .catch(() => undefined);
  }, [ativa]);

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await fila.criarAgendamento({ titulo, pedido, projeto: projeto ? Number(projeto) : null, cron: expressao });
    if (ok) {
      setPedido('');
      setTitulo('');
      setAberto(false);
    }
  };

  const salvarSubpasta = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsgDueto(null);
    try {
      const r = await api<{ subpasta: string }>('/api/dueto/ajustes', { metodo: 'PUT', corpo: { subpasta } });
      setSubpasta(r.subpasta);
      setMsgDueto(`o Gemini trabalha em ${r.subpasta}/`);
    } catch (err) {
      setMsgDueto((err as Error).message);
    }
  };

  const nomeProjeto = (id: number | null) => (id ? (projetos.find((p) => p.id === id)?.nome ?? `projeto ${id}`) : 'sem projeto');
  const recentes = fila.tarefas.filter((t) => t.estado !== 'fila' && t.estado !== 'rodando').slice(0, 5);

  return (
    <>
      <div>
        <div className="gr" style={{ paddingTop: 0 }}>fila em segundo plano</div>
        {fila.abertas.length === 0 && recentes.length === 0 && <div className="nota-pin">nada na fila. Escreva um pedido e use o relógio ao lado do campo de texto: ele roda como uma conversa nova, uma de cada vez.</div>}
        {fila.abertas.map((t) => (
          <div key={t.id} className="lin">
            <span className="nome-tarefa" title={t.pedido}>{t.origem === 'agenda' ? 'agendada: ' : ''}{t.titulo}</span>
            <span className="acoes-lin">
              <span className={`tag${t.estado === 'rodando' ? ' am' : ''}`}>{ROTULO_ESTADO[t.estado]}</span>
              <button className="bt" onClick={() => void fila.cancelar(t.id)}>
                cancelar
              </button>
            </span>
          </div>
        ))}
        {recentes.map((t) => (
          <div key={t.id} className="lin sub">
            <span className="nome-tarefa" title={t.erro ?? t.pedido}>{t.titulo}</span>
            <span className="acoes-lin">
              <span className={`tag${t.estado === 'erro' ? ' am' : ''}`}>{ROTULO_ESTADO[t.estado]}</span>
              <button className="bt" aria-label={`Tirar ${t.titulo} da lista`} onClick={() => void fila.tirar(t.id)}>
                tirar
              </button>
            </span>
          </div>
        ))}
        <div className="gr">agendamentos</div>
        {fila.agendamentos.length === 0 && !aberto && <div className="nota-pin">nenhum agendamento. Eles rodam o pedido sozinhos no horário, entrando na fila acima.</div>}
        {fila.agendamentos.map((a) => (
          <div key={a.id} className="cartao-agenda">
            <div className="lin">
              <span className="nome-tarefa" title={a.pedido}>{a.titulo}</span>
              <span className="acoes-lin">
                <button className="bt" aria-pressed={a.ligado} onClick={() => void fila.mudarAgendamento(a.id, { ligado: !a.ligado })}>
                  {a.ligado ? 'ligado' : 'desligado'}
                </button>
              </span>
            </div>
            <div className="lin sub">
              <span className="mono">{a.cron}</span>
              <span className="tag">{a.ligado ? `próxima: ${quando(a.proxima)}` : 'desligado'}</span>
            </div>
            <div className="lin sub">
              <span>{nomeProjeto(a.projetoId)}</span>
              <span className="acoes-lin">
                <button className="bt" onClick={() => void fila.rodarAgora(a.id)}>
                  rodar agora
                </button>
                <button
                  className="bt"
                  onClick={() => {
                    if (window.confirm(`apagar o agendamento "${a.titulo}"?`)) void fila.apagarAgendamento(a.id);
                  }}
                >
                  apagar
                </button>
              </span>
            </div>
          </div>
        ))}
        {!aberto && (
          <div className="lin ultima">
            <span />
            <button className="bt" onClick={() => setAberto(true)}>
              novo agendamento
            </button>
          </div>
        )}
        {aberto && (
          <form className="form-agenda" onSubmit={criar}>
            <input placeholder="nome (opcional)" aria-label="Nome do agendamento" maxLength={80} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            <textarea placeholder="o que fazer (o pedido que vai pro Claude)" aria-label="Pedido do agendamento" rows={3} value={pedido} onChange={(e) => setPedido(e.target.value)} />
            <select aria-label="Projeto do agendamento" value={projeto} onChange={(e) => setProjeto(e.target.value)}>
              <option value="">sem projeto</option>
              {projetos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <select aria-label="Quando rodar" value={tipo} onChange={(e) => setTipo(e.target.value as Quando)}>
              <option value="diario">todo dia</option>
              <option value="uteis">dias úteis (segunda a sexta)</option>
              <option value="semanal">toda semana</option>
              <option value="horaria">a cada hora</option>
              <option value="cron">avançado (cron)</option>
            </select>
            {tipo === 'semanal' && (
              <select aria-label="Dia da semana" value={dia} onChange={(e) => setDia(Number(e.target.value))}>
                {DIAS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            )}
            {(tipo === 'diario' || tipo === 'uteis' || tipo === 'semanal') && <input type="time" aria-label="Horário" value={hora} onChange={(e) => setHora(e.target.value)} />}
            {tipo === 'cron' && <input className="mono" aria-label="Cron de 5 campos" placeholder="minuto hora dia mês dia-da-semana" value={cron} onChange={(e) => setCron(e.target.value)} />}
            <div className="nota-pin">
              <span className="mono">{expressao}</span>
              {previa?.ok && previa.proximas ? ` · próximas: ${previa.proximas.map(quando).join('; ')}` : previa && !previa.ok ? ` · ${previa.erro}` : ''}
            </div>
            <div className="acoes-lin">
              <button className="bt prim" type="submit" disabled={!pedido.trim() || !previa?.ok}>
                criar
              </button>
              <button className="bt" type="button" onClick={() => setAberto(false)}>
                cancelar
              </button>
            </div>
          </form>
        )}
        {fila.erro && <div className="nota-pin" role="alert">{fila.erro}</div>}
      </div>
      <div>
        <div className="gr" style={{ paddingTop: 0 }}>dueto</div>
        <form className="form-pin" onSubmit={salvarSubpasta}>
          <label className="nota-pin" htmlFor="subpasta-dueto">
            pasta onde o Gemini trabalha, dentro de cada projeto
          </label>
          <input id="subpasta-dueto" placeholder="arte" value={subpasta} maxLength={80} onChange={(e) => setSubpasta(e.target.value)} />
          <button className="bt prim" type="submit">
            salvar
          </button>
        </form>
        {msgDueto && <div className="nota-pin">{msgDueto}</div>}
      </div>
    </>
  );
}
