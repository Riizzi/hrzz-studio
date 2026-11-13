import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Saude } from '../lib/saude';
import { Tela } from './Telas';
import './Ajustes.css';

type Props = {
  ativa: boolean;
  saude: Saude | null;
  servidorFora: boolean;
  florestaLigada: boolean;
  aoAlternarFloresta: () => void;
  aoSair: () => void;
};

type Sistema = {
  git: { repositorio: boolean; ramo?: string; versao?: string; limpo?: boolean; atras?: number; semRemoto?: boolean; erro?: string };
  versoes: { tag: string; data: string }[];
  comVigia: boolean;
};

type ResultadoOperacao = { ok: boolean; log: string[]; reiniciando?: boolean };

function duracao(seg: number): string {
  if (seg < 60) return `${seg} s`;
  if (seg < 3600) return `${Math.floor(seg / 60)} min`;
  return `${Math.floor(seg / 3600)} h`;
}

export function TelaAjustes({ ativa, saude, servidorFora, florestaLigada, aoAlternarFloresta, aoSair }: Props) {
  const [sistema, setSistema] = useState<Sistema | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [log, setLog] = useState<string[] | null>(null);
  const [mostrarVersoes, setMostrarVersoes] = useState(false);
  const [trocandoPin, setTrocandoPin] = useState(false);
  const [pinAtual, setPinAtual] = useState('');
  const [pinNovo, setPinNovo] = useState('');
  const [msgPin, setMsgPin] = useState<string | null>(null);

  const carregar = useCallback(async (buscar: boolean) => {
    try {
      setSistema(await api<Sistema>(`/api/sistema${buscar ? '?buscar=1' : ''}`));
    } catch {
      setSistema(null);
    }
  }, []);

  useEffect(() => {
    if (ativa) void carregar(false);
  }, [ativa, carregar]);

  const rodar = async (nome: string, f: () => Promise<ResultadoOperacao>) => {
    setOcupado(nome);
    setLog(null);
    try {
      const r = await f();
      setLog([...r.log, r.ok ? (r.reiniciando ? 'pronto. Reiniciando o HRZZ…' : 'pronto.') : 'não deu certo.']);
      if (r.ok && r.reiniciando) window.setTimeout(() => window.location.reload(), 6000);
      else if (r.ok && !r.reiniciando && r.log.length > 1) setLog((l) => [...(l ?? []), 'reinicie o HRZZ pra valer a versão nova (o reinício automático só funciona com o vigia).']);
    } catch (e) {
      setLog([(e as Error).message]);
    } finally {
      setOcupado(null);
      void carregar(false);
    }
  };

  const trocarPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsgPin(null);
    try {
      await api('/api/auth/pin', { corpo: { atual: pinAtual, pin: pinNovo } });
      setMsgPin('PIN trocado. Os outros aparelhos vão pedir o PIN de novo.');
      setPinAtual('');
      setPinNovo('');
      setTrocandoPin(false);
    } catch (e2) {
      setMsgPin((e2 as Error).message);
    }
  };

  const g = sistema?.git;
  const atualizacao = !g ? '–' : !g.repositorio ? 'sem git' : g.semRemoto ? 'sem GitHub ligado' : g.atras ? `${g.atras} mudança${g.atras > 1 ? 's' : ''} nova${g.atras > 1 ? 's' : ''}` : 'em dia';

  return (
    <Tela id="cfg" ativa={ativa} pinhos={{ l: 20, r: 6, s: 17, estilo: { bottom: 12, right: 16 } }}>
      <div className="grade-cartoes">
        <div>
          <div className="gr" style={{ paddingTop: 0 }}>sistema</div>
          <div className="lin">
            <span>servidor</span>
            <span className={`tag${servidorFora ? ' am' : ''}`}>{servidorFora ? 'não responde' : saude ? `ligado há ${duracao(saude.ligadoHa)}` : 'verificando'}</span>
          </div>
          <div className="lin">
            <span>versão</span>
            <span className="tag">{g?.versao ?? saude?.versao ?? '–'}</span>
          </div>
          <div className="lin">
            <span>atualizações</span>
            <span className="acoes-lin">
              <span className={`tag${g?.atras ? ' am' : ''}`}>{atualizacao}</span>
              <button className="bt" disabled={!!ocupado || !g?.repositorio} onClick={() => void carregar(true)}>
                ver
              </button>
              <button
                className="bt prim"
                disabled={!!ocupado || !g?.repositorio || !g.atras}
                onClick={() => rodar('atualizar', () => api<ResultadoOperacao>('/api/sistema/atualizar', { corpo: {} }))}
              >
                {ocupado === 'atualizar' ? 'atualizando…' : 'atualizar'}
              </button>
            </span>
          </div>
          <div className="lin">
            <span>voltar versão</span>
            <button className="bt" disabled={!!ocupado || !sistema?.versoes.length} onClick={() => setMostrarVersoes((v) => !v)}>
              {sistema?.versoes.length ? `${sistema.versoes.length} guardada${sistema.versoes.length > 1 ? 's' : ''}` : 'nenhuma ainda'}
            </button>
          </div>
          {mostrarVersoes &&
            sistema?.versoes.map((v) => (
              <div key={v.tag} className="lin sub">
                <span className="mono">{v.tag}</span>
                <button
                  className="bt"
                  disabled={!!ocupado}
                  onClick={() => {
                    if (window.confirm(`voltar o HRZZ pra ${v.tag}?`)) void rodar('voltar', () => api<ResultadoOperacao>('/api/sistema/voltar', { corpo: { tag: v.tag } }));
                  }}
                >
                  voltar pra essa
                </button>
              </div>
            ))}
          {log && (
            <pre className="log-sistema" aria-live="polite">
              {log.join('\n')}
            </pre>
          )}
          <div className="lin">
            <span>backup diário</span>
            <span className="tag">etapa 7</span>
          </div>
          <button className="lin clicavel linha-botao ultima" onClick={aoAlternarFloresta} aria-pressed={florestaLigada}>
            <span>floresta andando no fundo do chat</span>
            <span className="tag">{florestaLigada ? 'ligada' : 'desligada'}</span>
          </button>
        </div>
        <div>
          <div className="gr" style={{ paddingTop: 0 }}>acesso</div>
          <div className="lin">
            <span>PIN</span>
            <button className="bt" onClick={() => setTrocandoPin((v) => !v)}>
              trocar
            </button>
          </div>
          {trocandoPin && (
            <form className="form-pin" onSubmit={trocarPin}>
              <input type="password" inputMode="numeric" autoComplete="current-password" placeholder="PIN atual" aria-label="PIN atual" value={pinAtual} onChange={(e) => setPinAtual(e.target.value.replace(/\D/g, ''))} />
              <input type="password" inputMode="numeric" autoComplete="new-password" placeholder="PIN novo (4 a 12 números)" aria-label="PIN novo" value={pinNovo} onChange={(e) => setPinNovo(e.target.value.replace(/\D/g, ''))} />
              <button className="bt prim" type="submit" disabled={pinNovo.length < 4 || !pinAtual}>
                salvar PIN
              </button>
            </form>
          )}
          {msgPin && <div className="nota-pin">{msgPin}</div>}
          <div className="lin">
            <span>sair deste aparelho</span>
            <button className="bt" onClick={aoSair}>
              sair
            </button>
          </div>
          <div className="lin">
            <span>celular e notebook (Tailscale)</span>
            <span className="tag">etapa 8</span>
          </div>
          <div className="lin ultima">
            <span>link do trabalho (Cloudflare)</span>
            <span className="tag">etapa 8</span>
          </div>
        </div>
      </div>
    </Tela>
  );
}
