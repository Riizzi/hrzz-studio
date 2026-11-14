import { useCallback, useEffect, useState } from 'react';
import Icone from '../componentes/Icone';
import { Tela } from './Telas';
import { api, type RespostaConectores, type VisaoConector } from '../lib/api';
import './Integracoes.css';

type Aviso = { tipo: 'ok' | 'erro'; texto: string } | null;

const ROTULO_STATUS: Record<string, string> = {
  conectado: 'conectado',
  'precisa-login': 'precisa de login',
  falhou: 'falhou',
  'nao-encontrado': 'não conectado',
  desconhecido: 'consultando',
  'sem-token': 'sem token',
  pronto: 'token salvo',
  ok: 'funcionando',
};

function quando(ms: number): string {
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Conectores via MCP no Claude Code: GitHub, Google, Vercel, Cloudflare e Supabase.
export function TelaConectores({ ativa }: { ativa: boolean }) {
  const [dados, setDados] = useState<RespostaConectores | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [consultando, setConsultando] = useState(false);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);

  const falha = (e: unknown) => setAviso({ tipo: 'erro', texto: (e as Error).message });

  const carregar = useCallback(async () => {
    try {
      setDados(await api<RespostaConectores>('/api/conectores'));
    } catch (e) {
      falha(e);
    }
  }, []);

  useEffect(() => {
    if (!ativa) return;
    void carregar();
    // a consulta ao claude roda em segundo plano no servidor: mais uma leitura logo depois pega o resultado
    const t = window.setTimeout(() => void carregar(), 6000);
    return () => window.clearTimeout(t);
  }, [ativa, carregar]);

  const mudar = async (id: string, corpo: Record<string, unknown>) => {
    setAviso(null);
    try {
      const v = await api<VisaoConector>(`/api/conectores/${id}`, { metodo: 'PUT', corpo });
      setDados((d) => (d ? { ...d, conectores: d.conectores.map((c) => (c.id === id ? v : c)) } : d));
      return true;
    } catch (e) {
      falha(e);
      return false;
    }
  };

  const salvarToken = async (id: string) => {
    const token = (tokens[id] ?? '').trim();
    if (!token) return;
    if (await mudar(id, { token })) {
      setTokens((t) => ({ ...t, [id]: '' }));
      setAviso({ tipo: 'ok', texto: 'token salvo em dados/segredos. Use "testar" pra conferir.' });
    }
  };

  const testar = async (id: string) => {
    setOcupado(id);
    setAviso(null);
    try {
      const r = await api<{ ok: boolean; mensagem: string; conectores: VisaoConector[] }>(`/api/conectores/${id}/testar`, { corpo: {} });
      setDados((d) => (d ? { ...d, conectores: r.conectores } : d));
      setAviso({ tipo: r.ok ? 'ok' : 'erro', texto: r.mensagem });
    } catch (e) {
      falha(e);
    } finally {
      setOcupado(null);
    }
  };

  const atualizarLista = async () => {
    setConsultando(true);
    setAviso(null);
    try {
      setDados(await api<RespostaConectores>('/api/conectores/detectar', { corpo: {} }));
    } catch (e) {
      falha(e);
    } finally {
      setConsultando(false);
    }
  };

  const bloqueado = dados?.bloqueado ?? false;
  const lista = dados?.conectores ?? [];
  const grupos = ['GitHub', 'Google', 'Vercel', 'Cloudflare', 'Supabase'].map((g) => ({ nome: g, itens: lista.filter((c) => c.grupo === g) }));

  const chaves = (c: VisaoConector) => (
    <span className="acoes-lin">
      <button className={`tag chave${c.ligado ? ' am' : ''}`} aria-pressed={c.ligado} aria-label={`${c.nome}: ${c.ligado ? 'ligado' : 'desligado'}`} disabled={bloqueado} onClick={() => void mudar(c.id, { ligado: !c.ligado })}>
        {c.ligado ? 'ligado' : 'desligado'}
      </button>
      <button className={`tag chave${c.acesso === 'livre' ? ' am' : ''}`} aria-pressed={c.acesso === 'livre'} aria-label={`${c.nome}: ${c.acesso === 'livre' ? 'uso livre' : 'pergunta antes'}`} title="livre: a IA usa sem perguntar. pergunta antes: aparece um cartão no chat (no modo Yolo tudo é livre)" disabled={bloqueado} onClick={() => void mudar(c.id, { acesso: c.acesso === 'livre' ? 'perguntar' : 'livre' })}>
        {c.acesso === 'livre' ? 'livre' : 'pergunta antes'}
      </button>
    </span>
  );

  const estado = (c: VisaoConector) => <span className={`tag${c.status === 'conectado' || c.status === 'ok' ? ' am' : ''}`}>{ROTULO_STATUS[c.status] ?? c.status}</span>;

  const cartaoToken = (c: VisaoConector) => (
    <div key={c.id} className="cardg semclique cartao-con">
      <div className="lin">
        <span className="cardg-titulo sem-margem">{c.nome}</span>
        {estado(c)}
      </div>
      <div className="dica-acervo">{c.descricao}</div>
      {c.temToken && <div className="nota-con">{c.detalhe}</div>}
      <div className="lin sub chaves-con">
        <span />
        {chaves(c)}
      </div>
      {c.somenteLeitura !== null && (
        <div className="lin sub">
          <span>somente leitura</span>
          <button className={`tag chave${c.somenteLeitura ? ' am' : ''}`} aria-pressed={c.somenteLeitura} aria-label={`${c.nome}: somente leitura ${c.somenteLeitura ? 'ligada' : 'desligada'}`} disabled={bloqueado} onClick={() => void mudar(c.id, { somenteLeitura: !c.somenteLeitura })}>
            {c.somenteLeitura ? 'ligada' : 'desligada'}
          </button>
        </div>
      )}
      <form
        className="form-acervo"
        onSubmit={(e) => {
          e.preventDefault();
          void salvarToken(c.id);
        }}
      >
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          aria-label={`Token do ${c.nome}`}
          placeholder={c.temToken ? `token salvo (${c.tokenFim})` : 'cole o token aqui'}
          value={tokens[c.id] ?? ''}
          disabled={bloqueado}
          onChange={(e) => setTokens((t) => ({ ...t, [c.id]: e.target.value }))}
        />
        <button className="bt prim" type="submit" disabled={bloqueado || !(tokens[c.id] ?? '').trim()}>
          salvar
        </button>
      </form>
      <div className="acoes-coluna">
        <button className="bt" disabled={bloqueado || !c.temToken || ocupado === c.id} onClick={() => void testar(c.id)}>
          {ocupado === c.id ? 'testando…' : 'testar'}
        </button>
        {c.temToken && (
          <button
            className="bt"
            disabled={bloqueado}
            onClick={() => {
              if (window.confirm(`tirar o token do ${c.nome}?`)) void mudar(c.id, { token: '' });
            }}
          >
            tirar token
          </button>
        )}
      </div>
      {c.tokenOnde && <div className="nota-acervo">{c.tokenOnde}</div>}
    </div>
  );

  const linhaConta = (c: VisaoConector) => (
    <div key={c.id} className="bloco-con" title={c.descricao}>
      <div className="lin">
        <span className="nome-con">{c.nome}</span>
        {estado(c)}
      </div>
      <div className="lin sub chaves-con">
        <span />
        {chaves(c)}
      </div>
    </div>
  );

  const passos = (itens: VisaoConector[]) => {
    const faltando = itens.filter((c) => c.status === 'nao-encontrado' || c.status === 'precisa-login');
    if (faltando.length === 0) return null;
    const todos = [...new Set(faltando.flatMap((c) => c.comoLigar))];
    const comandos = todos.filter((t) => t.startsWith('claude'));
    const texto = todos.filter((t) => !t.startsWith('claude') && !t.startsWith('('));
    const dica = todos.filter((t) => t.startsWith('('));
    return (
      <div className="nota-acervo">
        <div>pra ligar ({faltando.map((c) => c.nome).join(', ')}):</div>
        {texto.slice(0, 1).map((t) => <div key={t}>{t}</div>)}
        {comandos.map((t) => (
          <div key={t} className="mono comando-con">{t}</div>
        ))}
        {dica.map((t) => <div key={t}>{t.slice(1, -1)}</div>)}
      </div>
    );
  };

  return (
    <Tela id="con" ativa={ativa} pinhos={{ l: 36, r: 8, s: 63, estilo: { bottom: 12, left: 16 } }}>
      <div className="topo-tela">
        <span className="mono titulo-tela">conectores</span>
        <button className="bt" onClick={() => void atualizarLista()} disabled={consultando} aria-label="Consultar o claude de novo">
          <Icone n="refresh" /> {consultando ? 'consultando o claude…' : 'consultar o claude'}
        </button>
        {dados?.deteccao && <span className="dica-acervo">{dados.deteccao.erro ? `última consulta falhou: ${dados.deteccao.erro}` : `claude consultado às ${quando(dados.deteccao.quando)}`}</span>}
      </div>

      {bloqueado && <div className="aviso-acervo erro">por este caminho de acesso os conectores ficam bloqueados: dá pra ver, não dá pra mudar nem usar.</div>}

      <div className="grade-acervo conectores">
        {grupos.map((g) => {
          const tokenado = g.itens.length === 1 && g.itens[0].tipo === 'token';
          if (g.itens.length === 0) return null;
          if (tokenado) return cartaoToken(g.itens[0]);
          if (g.itens.length === 1) {
            const c = g.itens[0];
            return (
              <div key={g.nome} className="cardg semclique cartao-con">
                <div className="lin">
                  <span className="cardg-titulo sem-margem">{c.nome}</span>
                  {estado(c)}
                </div>
                <div className="dica-acervo">{c.descricao}</div>
                <div className="lin sub chaves-con">
                  <span />
                  {chaves(c)}
                </div>
                {passos(g.itens)}
              </div>
            );
          }
          return (
            <div key={g.nome} className="cardg semclique cartao-con">
              <div className="cardg-titulo">{g.nome}</div>
              {g.itens.map(linhaConta)}
              {passos(g.itens)}
            </div>
          );
        })}
      </div>

      {aviso && (
        <div className={`aviso-acervo ${aviso.tipo}`} role={aviso.tipo === 'erro' ? 'alert' : 'status'}>
          {aviso.texto}
        </div>
      )}

      <div className="nota-acervo nota-geral-con">
        Os conectores do Google e da Vercel entram pelo login do próprio claude: o HRZZ só lê a lista e liga ou desliga o uso, e nunca vê essas credenciais. GitHub, Cloudflare e Supabase usam um token que você cola aqui; ele fica em dados/segredos (fora do git e do backup) e vai só pro serviço dele. No modo Yolo a IA usa os conectores ligados sem perguntar; nos modos Mid e Intern, "pergunta antes" mostra um cartão no chat. GitHub e Supabase começam em somente leitura.
      </div>
    </Tela>
  );
}
