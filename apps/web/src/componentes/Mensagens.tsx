import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Icone from './Icone';
import type { Bloco, LadoDuelo, Mensagem, Negada } from '../lib/api';
import './Mensagens.css';

// esconde os blocos <progresso> e <pergunta> (inclusive o pedaco que ainda esta chegando)
export function limparTexto(t: string): string {
  return t
    .replace(/<(progresso|pergunta)>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(progresso|pergunta)>[\s\S]*$/i, '')
    .replace(/<\/?(p|pr|pro|prog|progr|progre|progres|progress|progresso|pe|per|perg|pergu|pergun|pergunt|pergunta)?$/i, '')
    .trim();
}

const ICONES: Record<string, string> = {
  Read: 'file-text',
  Write: 'file-plus',
  Edit: 'pencil',
  MultiEdit: 'pencil',
  NotebookEdit: 'pencil',
  Bash: 'terminal-2',
  PowerShell: 'terminal-2',
  Grep: 'search',
  Glob: 'search',
  WebSearch: 'world-search',
  WebFetch: 'world-download',
  Skill: 'sparkles',
  Task: 'users',
};

const VERBOS: Record<string, string> = {
  Read: 'leu',
  Write: 'criou',
  Edit: 'editou',
  MultiEdit: 'editou',
  NotebookEdit: 'editou',
  Bash: 'rodou',
  PowerShell: 'rodou',
  Grep: 'buscou',
  Glob: 'buscou arquivos',
  WebSearch: 'pesquisou',
  WebFetch: 'abriu',
  Skill: 'usou a skill',
  ToolSearch: 'procurou ferramenta',
};

function Texto({ texto }: { texto: string }) {
  return (
    <div className="md">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {texto}
      </Markdown>
    </div>
  );
}

function Pensamento({ b }: { b: Extract<Bloco, { tipo: 'pensamento' }> }) {
  const [aberto, setAberto] = useState(false);
  const temTexto = b.texto.trim().length > 0;
  return (
    <div className="pens-bloco">
      <button className="pens" aria-expanded={aberto} disabled={!temTexto && !b.vivo} onClick={() => setAberto(!aberto)}>
        <Icone n={aberto ? 'chevron-down' : 'chevron-right'} />
        {b.vivo ? 'pensando…' : `pensou por ${b.segundos} s`}
      </button>
      {aberto && temTexto && <div className="pens-texto">{b.texto}</div>}
    </div>
  );
}

function Ferramenta({ b }: { b: Extract<Bloco, { tipo: 'ferramenta' }> }) {
  return (
    <div className={`ferr${b.erro ? ' erro' : ''}${b.rodando ? ' vivo' : ''}`} title={b.resumo}>
      <Icone n={ICONES[b.nome] ?? 'tool'} />
      <span className="ferr-verbo">{VERBOS[b.nome] ?? b.nome}</span>
      <span className="ferr-resumo mono">{b.resumo}</span>
    </div>
  );
}

const ROTULO_CATEGORIA: Record<string, string> = {
  apagar: 'apagar',
  push: 'enviar pro GitHub',
  fora: 'sair da pasta',
  comando: 'rodar comando',
  edicao: 'editar arquivo',
  conector: 'usar conector',
  outra: 'usar ferramenta',
};

function Permissao({
  b,
  ativa,
  aoResponder,
}: {
  b: Extract<Bloco, { tipo: 'permissao' }>;
  ativa: boolean;
  aoResponder: (r: 'sim' | 'sempre' | 'nao') => void;
}) {
  return (
    <div className="perm">
      <div className="perm-titulo">
        <Icone n="shield-half" /> precisa da sua permissão
      </div>
      {b.negadas.map((n: Negada, i) => (
        <div key={i} className="perm-item">
          <span className="tag">{ROTULO_CATEGORIA[n.categoria] ?? n.categoria}</span>
          <span className="perm-resumo mono">{n.resumo}</span>
        </div>
      ))}
      {b.respondida ? (
        <div className="perm-resp">{b.respondida === 'nao' ? 'você negou' : b.respondida === 'sempre' ? 'liberado nesta conversa' : 'liberado desta vez'}</div>
      ) : (
        <div className="opcoes">
          <button className="bt prim" disabled={!ativa} onClick={() => aoResponder('sim')}>
            pode
          </button>
          <button className="bt" disabled={!ativa} onClick={() => aoResponder('sempre')}>
            pode sempre nesta conversa
          </button>
          <button className="bt" disabled={!ativa} onClick={() => aoResponder('nao')}>
            não
          </button>
        </div>
      )}
    </div>
  );
}

function renova(epoch?: number): string {
  if (!epoch) return '';
  const min = Math.max(0, Math.round((epoch * 1000 - Date.now()) / 60000));
  if (min < 60) return `renova em ${min} min`;
  return `renova em ${Math.floor(min / 60)} h ${min % 60} min`;
}

// dueto: o que o Gemini devolveu pro Claude, recuado e com o ponto do Google
function GeminiBloco({ b }: { b: Extract<Bloco, { tipo: 'gemini' }> }) {
  return (
    <div className={`gemini-bloco${b.erro ? ' erro' : ''}`}>
      <span className="tag modelo-tag">
        <span className="pt gm" />
        Gemini
      </span>
      <div className="gemini-tarefa mono">{b.tarefa}</div>
      <Texto texto={b.texto} />
    </div>
  );
}

type Props = {
  mensagens: Mensagem[];
  turno: Bloco[] | null;
  turnoLados: [Bloco[], Bloco[]] | null;
  rodando: boolean;
  nomeModelo: string;
  motor: 'claude' | 'agy';
  nomeDoLado: (l: Pick<LadoDuelo, 'motor' | 'modelo'>) => string;
  temGoogle: boolean;
  aoEscolher: (opcao: string) => void;
  aoResponderPermissao: (mensagem: number, indice: number, r: 'sim' | 'sempre' | 'nao') => void;
  aoEscolherDuelo: (mensagem: number, lado: 0 | 1 | -1) => void;
  aoLimite: (acao: 'haiku' | 'google') => void;
};

export default function Mensagens({ mensagens, turno, turnoLados, rodando, nomeModelo, motor, nomeDoLado, temGoogle, aoEscolher, aoResponderPermissao, aoEscolherDuelo, aoLimite }: Props) {
  const ultima = mensagens.length - 1;
  const pt = motor === 'agy' ? 'gm' : 'cl';
  // duelo: quais respostas guardadas (nao escolhidas) o Joao abriu
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});

  const renderBlocos = (blocos: Bloco[], mensagemId: number | null, ehUltima: boolean, ao: boolean) =>
    blocos.map((b, i) => {
      switch (b.tipo) {
        case 'pensamento':
          return <Pensamento key={i} b={b} />;
        case 'ferramenta':
          return <Ferramenta key={i} b={b} />;
        case 'texto': {
          const t = limparTexto(b.texto);
          return t ? <Texto key={i} texto={t} /> : null;
        }
        case 'pergunta':
          return (
            <div key={i} className="pergunta">
              <div className="pergunta-texto">{b.pergunta}</div>
              <div className="opcoes">
                {b.opcoes.map((o) => (
                  <button key={o} className="bt" disabled={!ehUltima || rodando} onClick={() => aoEscolher(o)}>
                    {o}
                  </button>
                ))}
              </div>
            </div>
          );
        case 'permissao':
          return (
            <Permissao
              key={i}
              b={b}
              ativa={ao && !rodando && ehUltima}
              aoResponder={(r) => mensagemId !== null && mensagemId > 0 && aoResponderPermissao(mensagemId, i, r)}
            />
          );
        case 'erro':
          return (
            <div key={i} className="msg-erro" role="alert">
              {b.texto}
            </div>
          );
        case 'gemini':
          return <GeminiBloco key={i} b={b} />;
        case 'limite':
          return (
            <div key={i} className="limite" role="alert">
              <div className="limite-titulo">
                <Icone n="hourglass" /> limite de uso do Claude
              </div>
              <div className="limite-texto">{b.texto}</div>
              {b.renovaEm && <div className="limite-renova">{renova(b.renovaEm)}</div>}
              <div className="opcoes">
                <button className="bt prim" disabled={!ehUltima || rodando} onClick={() => aoLimite('haiku')}>
                  usar o Haiku até renovar
                </button>
                {temGoogle && (
                  <button className="bt" disabled={!ehUltima || rodando} onClick={() => aoLimite('google')}>
                    mandar pro Gemini
                  </button>
                )}
              </div>
            </div>
          );
        case 'duelo':
          return mensagemId === null ? null : (
            <div key={i} className="duelo">
              <div className="duelo-lados">
                {b.lados.map((l, n) => {
                  const escolhida = b.escolhida === n;
                  const recolhida = b.escolhida !== null && !escolhida;
                  const chave = `${b.id}:${n}`;
                  return (
                    <div key={n} className={`duelo-lado${escolhida ? ' escolhida' : ''}${recolhida ? ' recolhida' : ''}`}>
                      <span className="tag modelo-tag">
                        <span className={`pt ${l.motor === 'agy' ? 'gm' : 'cl'}`} />
                        {nomeDoLado(l)}
                        {escolhida && <b className="duelo-selo"> · escolhida</b>}
                      </span>
                      {recolhida && !abertas[chave] ? (
                        <button className="bt" onClick={() => setAbertas((a) => ({ ...a, [chave]: true }))}>
                          ver a resposta guardada
                        </button>
                      ) : (
                        renderBlocos(l.blocos, null, false, false)
                      )}
                      {l.mudancas.length > 0 && (!recolhida || abertas[chave]) && <div className="duelo-mudancas mono">{l.mudancas.join(' · ')}</div>}
                      {b.escolhida === null && (
                        <button className="bt prim" disabled={!ehUltima || rodando} onClick={() => aoEscolherDuelo(mensagemId, n as 0 | 1)}>
                          usar essa
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {b.escolhida === null && (
                <button className="bt" disabled={!ehUltima || rodando} onClick={() => aoEscolherDuelo(mensagemId, -1)}>
                  nenhuma das duas
                </button>
              )}
              {b.aviso && <div className="duelo-aviso">{b.aviso}</div>}
            </div>
          );
        default:
          return null;
      }
    });

  return (
    <>
      {mensagens.map((m, idx) => {
        if (m.papel === 'eu') {
          const c = m.conteudo as { texto: string; anexos?: { nome: string; tipo: string }[]; sistema?: boolean };
          return (
            <div key={m.id} className={`msg eu${c.sistema ? ' sistema' : ''}`}>
              {c.texto}
              {c.anexos && c.anexos.length > 0 && (
                <div className="anexos-msg">
                  {c.anexos.map((a, i) => (
                    <span key={i} className="tag">
                      <Icone n="paperclip" /> {a.nome}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        }
        const blocos = m.conteudo as Bloco[];
        const ehDuelo = blocos.some((b) => b.tipo === 'duelo');
        return (
          <div key={m.id} className={`msg ia${ehDuelo ? ' com-duelo' : ''}`}>
            {!ehDuelo && (
              <span className="tag modelo-tag">
                <span className={`pt ${pt}`} />
                {nomeModelo}
              </span>
            )}
            {renderBlocos(blocos, m.id, idx === ultima, true)}
          </div>
        );
      })}
      {turnoLados && (
        <div className="msg ia duelo-ao-vivo">
          <div className="duelo-lados">
            {turnoLados.map((blocos, n) => (
              <div key={n} className="duelo-lado">
                <span className="tag modelo-tag">
                  <span className={`pt ${n === 1 ? 'gm' : 'cl'}`} />
                  {nomeDoLado({ motor: n === 1 ? 'agy' : 'claude', modelo: null })}
                </span>
                {renderBlocos(blocos, null, false, false)}
                {rodando && <span className="digitando" aria-label="respondendo" />}
              </div>
            ))}
          </div>
        </div>
      )}
      {turno && !turnoLados && (
        <div className="msg ia">
          <span className="tag modelo-tag">
            <span className={`pt ${pt}`} />
            {nomeModelo}
          </span>
          {renderBlocos(turno, null, false, false)}
          {rodando && <span className="digitando" aria-label="respondendo" />}
        </div>
      )}
      {!turno && !turnoLados && rodando && (
        <div className="msg ia">
          <span className="digitando" aria-label="respondendo" />
        </div>
      )}
    </>
  );
}
