import { useCallback, useEffect, useState } from 'react';
import Icone from '../componentes/Icone';
import { Tela } from './Telas';
import { api, type ComandoItem, type ModeloProjetoItem, type Projeto, type SkillItem } from '../lib/api';
import './Acervo.css';

type Props = {
  ativa: boolean;
  projetos: Projeto[];
  aoCriarProjeto: (projeto: Projeto, pedido: string) => void;
  aoMudarComandos: () => void;
};

type Editor =
  | { tipo: 'skill'; nome: string; descricao: string; instrucoes: string; nova: boolean }
  | { tipo: 'comando'; nome: string; descricao: string; corpo: string; nova: boolean }
  | { tipo: 'modelo'; id: string; titulo: string; nome: string; pasta: string }
  | null;

const NOME_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;

// Skills (ligar e desligar por projeto), comandos salvos (/nome) e modelos de projeto.
export function TelaSkills({ ativa, projetos, aoCriarProjeto, aoMudarComandos }: Props) {
  const [escopo, setEscopo] = useState(0);
  const [skills, setSkills] = useState<SkillItem[] | null>(null);
  const [comandos, setComandos] = useState<ComandoItem[] | null>(null);
  const [modelos, setModelos] = useState<ModeloProjetoItem[]>([]);
  const [editor, setEditor] = useState<Editor>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const falha = (e: unknown) => setAviso({ tipo: 'erro', texto: (e as Error).message });

  const carregarSkills = useCallback(async () => {
    try {
      setSkills((await api<{ skills: SkillItem[] }>(`/api/skills?projeto=${escopo}`)).skills);
    } catch (e) {
      falha(e);
    }
  }, [escopo]);

  const carregarComandos = useCallback(async () => {
    try {
      setComandos(await api<ComandoItem[]>('/api/comandos'));
    } catch (e) {
      falha(e);
    }
  }, []);

  useEffect(() => {
    if (!ativa) return;
    void carregarSkills();
    void carregarComandos();
    api<ModeloProjetoItem[]>('/api/modelos-projeto').then(setModelos).catch(() => {});
  }, [ativa, carregarSkills, carregarComandos]);

  // se o projeto escolhido foi apagado, volta pra "conversas sem projeto"
  useEffect(() => {
    if (escopo !== 0 && !projetos.some((p) => p.id === escopo)) setEscopo(0);
  }, [projetos, escopo]);

  const alternar = async (s: SkillItem) => {
    setSkills((l) => l?.map((x) => (x.chave === s.chave ? { ...x, ligada: !x.ligada } : x)) ?? null);
    try {
      await api('/api/skills/ligada', { metodo: 'PUT', corpo: { projeto: escopo, chave: s.chave, ligada: !s.ligada } });
    } catch (e) {
      falha(e);
      void carregarSkills();
    }
  };

  const editarSkill = async (s: SkillItem) => {
    try {
      const r = await api<{ descricao: string; instrucoes: string }>(`/api/skills/hrzz/${encodeURIComponent(s.nome)}`);
      setEditor({ tipo: 'skill', nome: s.nome, descricao: r.descricao, instrucoes: r.instrucoes, nova: false });
      setAviso(null);
    } catch (e) {
      falha(e);
    }
  };

  const editarComando = async (c: ComandoItem) => {
    if (c.embutido) return;
    try {
      const r = await api<{ descricao: string; corpo: string }>(`/api/comandos/${encodeURIComponent(c.nome)}`);
      setEditor({ tipo: 'comando', nome: c.nome, descricao: r.descricao, corpo: r.corpo, nova: false });
      setAviso(null);
    } catch (e) {
      falha(e);
    }
  };

  const salvarEditor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editor) return;
    try {
      if (editor.tipo === 'skill') {
        if (!NOME_RE.test(editor.nome)) throw new Error('nome inválido: use letras minúsculas, números e -');
        await api(`/api/skills/hrzz/${encodeURIComponent(editor.nome)}`, { metodo: 'PUT', corpo: { descricao: editor.descricao, instrucoes: editor.instrucoes } });
        await carregarSkills();
      } else if (editor.tipo === 'comando') {
        if (!NOME_RE.test(editor.nome)) throw new Error('nome inválido: use letras minúsculas, números e -');
        await api(`/api/comandos/${encodeURIComponent(editor.nome)}`, { metodo: 'PUT', corpo: { descricao: editor.descricao, corpo: editor.corpo } });
        await carregarComandos();
        aoMudarComandos();
      } else if (editor.tipo === 'modelo') {
        const r = await api<{ projeto: Projeto; pedido: string }>(`/api/modelos-projeto/${editor.id}/criar`, { corpo: { nome: editor.nome, pasta: editor.pasta } });
        setEditor(null);
        aoCriarProjeto(r.projeto, r.pedido);
        return;
      }
      setEditor(null);
      setAviso({ tipo: 'ok', texto: 'salvo.' });
    } catch (e2) {
      falha(e2);
    }
  };

  const apagarEditor = async () => {
    if (!editor || editor.tipo === 'modelo' || !window.confirm(`Apagar ${editor.tipo === 'skill' ? 'a skill' : 'o comando'} ${editor.nome}? Não dá pra desfazer.`)) return;
    try {
      await api(editor.tipo === 'skill' ? `/api/skills/hrzz/${encodeURIComponent(editor.nome)}` : `/api/comandos/${encodeURIComponent(editor.nome)}`, { metodo: 'DELETE' });
      setEditor(null);
      if (editor.tipo === 'skill') await carregarSkills();
      else {
        await carregarComandos();
        aoMudarComandos();
      }
    } catch (e) {
      falha(e);
    }
  };

  const nomeEscopo = escopo === 0 ? 'conversas sem projeto' : (projetos.find((p) => p.id === escopo)?.nome ?? 'projeto');
  const sua = skills?.filter((s) => s.origem === 'sua') ?? [];
  const anthropic = skills?.filter((s) => s.origem === 'anthropic') ?? [];

  const linhaSkill = (s: SkillItem, ultima: boolean) => (
    <div key={s.chave} className={`lin linha-skill${ultima ? ' ultima' : ''}`}>
      <span className="skill-nome" title={s.descricao || s.chave}>
        {s.nome}
      </span>
      <span className="acoes-lin">
        {s.editavel && (
          <button className="bt" onClick={() => void editarSkill(s)} aria-label={`Editar ${s.nome}`}>
            editar
          </button>
        )}
        <button className={`tag chave${s.ligada ? ' am' : ''}`} aria-pressed={s.ligada} aria-label={`${s.nome}: ${s.ligada ? 'ligada' : 'desligada'} em ${nomeEscopo}`} onClick={() => void alternar(s)}>
          {s.ligada ? 'ligada' : 'desligada'}
        </button>
      </span>
    </div>
  );

  return (
    <Tela id="skl" ativa={ativa} pinhos={{ l: 22, r: 7, s: 91, estilo: { bottom: 12, right: 16 } }}>
      <div className="grade-acervo tres">
        <div className="coluna">
          <div className="gr" style={{ paddingTop: 0 }}>skills</div>
          <div className="escopo-skills">
            <label htmlFor="escopo-skills">vale para</label>
            <select id="escopo-skills" value={escopo} onChange={(e) => setEscopo(Number(e.target.value))}>
              <option value={0}>conversas sem projeto</option>
              {projetos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          {skills && skills.length === 0 && <div className="vazio">nenhuma skill encontrada. Crie uma abaixo.</div>}
          {sua.map((s, i) => linhaSkill(s, i === sua.length - 1 && anthropic.length === 0))}
          {anthropic.length > 0 && <div className="gr">da anthropic</div>}
          {anthropic.map((s, i) => linhaSkill(s, i === anthropic.length - 1))}
          <div className="acoes-coluna">
            <button className="bt" onClick={() => { setEditor({ tipo: 'skill', nome: '', descricao: '', instrucoes: '', nova: true }); setAviso(null); }}>
              <Icone n="plus" /> nova skill
            </button>
          </div>
          <div className="nota-acervo">desligada vale só para {nomeEscopo}: o claude não usa a skill nesses pedidos. Skills criadas aqui ficam em dados/skills.</div>
        </div>

        <div className="coluna">
          <div className="gr" style={{ paddingTop: 0 }}>comandos salvos</div>
          {comandos?.map((c, i) => (
            <button key={c.nome} className={`lin clicavel linha-botao${i === comandos.length - 1 ? ' ultima' : ''}`} onClick={() => void editarComando(c)} disabled={c.embutido} title={c.descricao}>
              <span className="mono">/{c.nome}</span>
              <span className="tag">{c.embutido ? 'embutido' : 'editar'}</span>
            </button>
          ))}
          <div className="acoes-coluna">
            <button className="bt" onClick={() => { setEditor({ tipo: 'comando', nome: '', descricao: '', corpo: '', nova: true }); setAviso(null); }}>
              <Icone n="plus" /> novo comando
            </button>
          </div>
          <div className="nota-acervo">digite / no campo do chat pra escolher. O texto depois do comando entra no lugar de {'{{texto}}'}.</div>
        </div>

        <div className="coluna">
          <div className="gr" style={{ paddingTop: 0 }}>modelos de projeto</div>
          {modelos.map((m, i) => (
            <button key={m.id} className={`lin clicavel linha-botao${i === modelos.length - 1 ? ' ultima' : ''}`} onClick={() => { setEditor({ tipo: 'modelo', id: m.id, titulo: m.nome, nome: '', pasta: '' }); setAviso(null); }} title={m.descricao}>
              <span>{m.nome}</span>
              <span className="tag">usar</span>
            </button>
          ))}
          <div className="nota-acervo">cria uma pasta com o CLAUDE.md do tipo de trabalho e abre uma conversa com o pedido pronto pra completar.</div>
        </div>
      </div>

      {aviso && (
        <div className={`aviso-acervo ${aviso.tipo}`} role={aviso.tipo === 'erro' ? 'alert' : 'status'}>
          {aviso.texto}
        </div>
      )}

      {editor && (
        <form className="cardg editor" onSubmit={salvarEditor} aria-label="Editor">
          <div className="topo-editor">
            <span className="mono rotulo-editor">
              {editor.tipo === 'skill' ? (editor.nova ? 'nova skill' : `skill ${editor.nome}`) : editor.tipo === 'comando' ? (editor.nova ? 'novo comando' : `/${editor.nome}`) : `modelo: ${editor.titulo}`}
            </span>
            <button type="button" className="ib" aria-label="Fechar editor" onClick={() => setEditor(null)}>
              <Icone n="x" />
            </button>
          </div>
          {editor.tipo === 'modelo' ? (
            <>
              <input aria-label="Nome do projeto" placeholder="nome do projeto" value={editor.nome} onChange={(e) => setEditor({ ...editor, nome: e.target.value })} autoFocus />
              <input aria-label="Pasta (opcional)" placeholder="pasta (opcional; em branco cria uma em dados/projetos)" value={editor.pasta} onChange={(e) => setEditor({ ...editor, pasta: e.target.value })} />
              <div className="acoes-editor">
                <button className="bt prim" type="submit" disabled={!editor.nome.trim()}>
                  criar projeto
                </button>
              </div>
            </>
          ) : (
            <>
              <input
                aria-label="Nome"
                placeholder={editor.tipo === 'skill' ? 'nome (ex.: tom-de-oficio)' : 'nome (ex.: resumo)'}
                value={editor.nome}
                disabled={!editor.nova}
                onChange={(e) => setEditor({ ...editor, nome: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                autoFocus={editor.nova}
              />
              <input
                aria-label={editor.tipo === 'skill' ? 'Quando usar' : 'Descrição'}
                placeholder={editor.tipo === 'skill' ? 'quando o claude deve usar esta skill' : 'o que o comando faz (uma linha)'}
                value={editor.descricao}
                onChange={(e) => setEditor({ ...editor, descricao: e.target.value })}
              />
              <textarea
                aria-label={editor.tipo === 'skill' ? 'Instruções' : 'Pedido'}
                rows={8}
                placeholder={editor.tipo === 'skill' ? 'instruções da skill' : 'o pedido que o claude recebe. Use {{texto}} onde entra o que você digitar depois do comando'}
                value={editor.tipo === 'skill' ? editor.instrucoes : editor.corpo}
                onChange={(e) => setEditor(editor.tipo === 'skill' ? { ...editor, instrucoes: e.target.value } : { ...editor, corpo: e.target.value })}
              />
              <div className="acoes-editor">
                {!editor.nova && (
                  <button type="button" className="bt" onClick={() => void apagarEditor()}>
                    apagar
                  </button>
                )}
                <button className="bt prim" type="submit" disabled={!editor.nome}>
                  salvar
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </Tela>
  );
}
