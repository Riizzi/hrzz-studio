import { useEffect, useRef, useState } from 'react';
import Icone from './Icone';
import type { ItemProgresso } from '../lib/api';
import type { Hrzz } from '../lib/useHrzz';

const GRUPOS: { id: ItemProgresso['estado']; titulo: string }[] = [
  { id: 'fazendo', titulo: 'fazendo agora' },
  { id: 'afazer', titulo: 'a fazer' },
  { id: 'feito', titulo: 'feito' },
];

function horaDe(sql: string): string {
  // o SQLite guarda em UTC ("2026-11-13 20:05:25")
  const d = new Date(sql.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return '';
  const seg = Math.round((Date.now() - d.getTime()) / 1000);
  if (seg < 60) return 'agora';
  if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// Aba "progresso" do painel (docs/03-design.md): feito, fazendo e a fazer, por conversa ou por projeto.
export default function Progresso({ h }: { h: Hrzz }) {
  const [escopo, setEscopo] = useState<'conversa' | 'projeto'>('conversa');
  const [fechados, setFechados] = useState<Record<string, boolean>>({});
  const [novo, setNovo] = useState('');
  const [piscando, setPiscando] = useState<Set<number>>(new Set());
  const antes = useRef<Map<number, string>>(new Map());

  const projetoId = h.conversaAtual?.projetoId ?? h.projetoNovo;
  const projeto = h.projetos.find((p) => p.id === projetoId);
  const temProjeto = !!projeto;
  const lista = escopo === 'projeto' && temProjeto ? h.progressoProjeto : h.progresso;

  useEffect(() => {
    if (!temProjeto && escopo === 'projeto') setEscopo('conversa');
  }, [temProjeto, escopo]);

  // item que acabou de mudar pisca uma vez
  useEffect(() => {
    const mudados = new Set<number>();
    for (const i of lista) {
      const e = antes.current.get(i.id);
      if (e !== undefined && e !== i.estado) mudados.add(i.id);
    }
    antes.current = new Map(lista.map((i) => [i.id, i.estado]));
    if (mudados.size) {
      setPiscando(mudados);
      const t = window.setTimeout(() => setPiscando(new Set()), 1700);
      return () => window.clearTimeout(t);
    }
  }, [lista]);

  const feitas = lista.filter((i) => i.estado === 'feito').length;
  const fazendo = lista.filter((i) => i.estado === 'fazendo').length;
  const afazer = lista.filter((i) => i.estado === 'afazer').length;
  const pct = lista.length ? Math.round((feitas / lista.length) * 100) : 0;
  const titulo = escopo === 'projeto' && projeto ? projeto.nome : (h.conversaAtual?.titulo ?? 'sem conversa aberta');
  const podeAdicionar = escopo === 'projeto' ? temProjeto : h.atual !== null;

  return (
    <div className="prog">
      <div className="prog-top">
        <span className="tt2">{titulo}</span>
        <span className="seg">
          <button className={escopo === 'conversa' ? 'on' : ''} onClick={() => setEscopo('conversa')}>
            conversa
          </button>
          <button className={escopo === 'projeto' ? 'on' : ''} disabled={!temProjeto} title={temProjeto ? '' : 'esta conversa não está num projeto'} onClick={() => setEscopo('projeto')}>
            projeto
          </button>
        </span>
      </div>
      <div className="barra-prog" aria-hidden="true">
        <span className="f" style={{ width: `${lista.length ? (feitas / lista.length) * 100 : 0}%` }} />
        <span className="a" style={{ width: `${lista.length ? (fazendo / lista.length) * 100 : 0}%` }} />
      </div>
      <div className="leg-prog">
        <span>
          <b>{feitas}</b> feitas
        </span>
        <span>
          <b>{fazendo}</b> em andamento
        </span>
        <span>
          <b>{afazer}</b> a fazer
        </span>
        <span style={{ marginLeft: 'auto' }}>{pct}%</span>
      </div>

      {lista.length === 0 && <div className="vazio">a lista aparece quando a IA começar a trabalhar em algo com mais de um passo. Você também pode adicionar itens abaixo.</div>}

      {GRUPOS.map((g) => {
        const itens = lista.filter((i) => i.estado === g.id);
        if (itens.length === 0) return null;
        return (
          <div key={g.id} className={`grupo${fechados[g.id] ? ' fechado' : ''}`}>
            <div className="gh" role="button" tabIndex={0} onClick={() => setFechados((f) => ({ ...f, [g.id]: !f[g.id] }))} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setFechados((f) => ({ ...f, [g.id]: !f[g.id] }))}>
              <Icone n={fechados[g.id] ? 'chevron-right' : 'chevron-down'} />
              {g.titulo}
              <span className="n">{itens.length}</span>
            </div>
            <div className="its">
              {itens.map((i) => (
                <div key={i.id} className={`it2 ${i.estado}${piscando.has(i.id) ? ' novo' : ''}`}>
                  <button className="ck" aria-label={i.estado === 'feito' ? 'Reabrir' : 'Marcar como feito'} onClick={() => void h.alternarItem(i)}>
                    {i.estado === 'feito' && <Icone n="check" />}
                  </button>
                  <span className="txt2">
                    {i.texto}
                    <span className="origem">{i.origem === 'ia' ? 'ia' : 'você'}</span>
                    <span className="meta">{i.detalhe ?? horaDe(i.mudou)}</span>
                  </span>
                  {i.origem === 'voce' && (
                    <button className="ib rm-item" aria-label="Apagar tarefa" title="apagar tarefa" onClick={() => void h.removerItem(i)}>
                      <Icone n="x" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <form
        className="novo-it"
        onSubmit={(e) => {
          e.preventDefault();
          if (!novo.trim() || !podeAdicionar) return;
          void h.adicionarItem(novo.trim(), escopo);
          setNovo('');
        }}
      >
        <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder={podeAdicionar ? 'adicionar tarefa' : 'abra ou comece uma conversa'} aria-label="Adicionar tarefa" disabled={!podeAdicionar} />
        <button className="bt" type="submit" disabled={!podeAdicionar || !novo.trim()}>
          <Icone n="plus" />
        </button>
      </form>
    </div>
  );
}
