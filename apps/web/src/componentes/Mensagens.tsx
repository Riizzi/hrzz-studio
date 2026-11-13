import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Icone from './Icone';
import type { Bloco, Mensagem, Negada } from '../lib/api';
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

type Props = {
  mensagens: Mensagem[];
  turno: Bloco[] | null;
  rodando: boolean;
  nomeModelo: string;
  motor: 'claude' | 'agy';
  aoEscolher: (opcao: string) => void;
  aoResponderPermissao: (mensagem: number, indice: number, r: 'sim' | 'sempre' | 'nao') => void;
};

export default function Mensagens({ mensagens, turno, rodando, nomeModelo, motor, aoEscolher, aoResponderPermissao }: Props) {
  const ultima = mensagens.length - 1;
  const pt = motor === 'agy' ? 'gm' : 'cl';

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
        return (
          <div key={m.id} className="msg ia">
            <span className="tag modelo-tag">
              <span className={`pt ${pt}`} />
              {nomeModelo}
            </span>
            {renderBlocos(blocos, m.id, idx === ultima, true)}
          </div>
        );
      })}
      {turno && (
        <div className="msg ia">
          <span className="tag modelo-tag">
            <span className={`pt ${pt}`} />
            {nomeModelo}
          </span>
          {renderBlocos(turno, null, false, false)}
          {rodando && <span className="digitando" aria-label="respondendo" />}
        </div>
      )}
      {!turno && rodando && (
        <div className="msg ia">
          <span className="digitando" aria-label="respondendo" />
        </div>
      )}
    </>
  );
}
