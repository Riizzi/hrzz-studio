// Acesso ao SQLite: projetos, conversas, mensagens e progresso.
import type { Banco } from './db.js';
import type { Bloco, ItemProgresso, Modo } from './ia/tipos.js';

export type Projeto = { id: number; nome: string; pasta: string; criado: string };

export type Conversa = {
  id: number;
  projetoId: number | null;
  titulo: string;
  motor: 'claude' | 'agy';
  modelo: string | null;
  modeloAuto: boolean;
  modo: Modo;
  pensar: 0 | 1 | 2;
  esforco: 0 | 1 | 2;
  web: boolean;
  sessaoClaude: string | null;
  sessaoAgy: string | null;
  liberadas: string[];
  criada: string;
  atualizada: string;
};

export type MensagemSalva = { id: number; conversaId: number; papel: 'eu' | 'ia'; conteudo: unknown; criada: string };

export type ItemSalvo = {
  id: number;
  conversaId: number | null;
  projetoId: number | null;
  texto: string;
  estado: 'afazer' | 'fazendo' | 'feito';
  origem: 'ia' | 'voce';
  detalhe: string | null;
  ordem: number;
  mudou: string;
};

type Linha = Record<string, any>;

function paraConversa(l: Linha): Conversa {
  return {
    id: l.id,
    projetoId: l.projeto_id,
    titulo: l.titulo,
    motor: l.motor,
    modelo: l.modelo,
    modeloAuto: !!l.modelo_auto,
    modo: l.modo,
    pensar: l.pensar,
    esforco: l.esforco,
    web: !!l.web,
    sessaoClaude: l.sessao_claude,
    sessaoAgy: l.sessao_agy,
    liberadas: JSON.parse(l.liberadas || '[]'),
    criada: l.criada,
    atualizada: l.atualizada,
  };
}

export class Repo {
  constructor(private db: Banco) {}

  // ---------- projetos ----------
  listarProjetos(): Projeto[] {
    return this.db.prepare('select id, nome, pasta, criado from projetos order by nome collate nocase').all() as Projeto[];
  }
  obterProjeto(id: number): Projeto | undefined {
    return this.db.prepare('select id, nome, pasta, criado from projetos where id = ?').get(id) as Projeto | undefined;
  }
  criarProjeto(nome: string, pasta: string): Projeto {
    const r = this.db.prepare('insert into projetos(nome, pasta) values(?, ?)').run(nome, pasta);
    return this.obterProjeto(Number(r.lastInsertRowid))!;
  }
  renomearProjeto(id: number, nome: string): void {
    this.db.prepare('update projetos set nome = ? where id = ?').run(nome, id);
  }
  apagarProjeto(id: number): void {
    // as conversas ficam (projeto_id vira nulo); a pasta no disco nunca e mexida
    this.db.prepare('delete from projetos where id = ?').run(id);
  }

  // ---------- conversas ----------
  listarConversas(limite = 60): Conversa[] {
    return (this.db.prepare('select * from conversas order by atualizada desc, id desc limit ?').all(limite) as Linha[]).map(paraConversa);
  }
  obterConversa(id: number): Conversa | undefined {
    const l = this.db.prepare('select * from conversas where id = ?').get(id) as Linha | undefined;
    return l ? paraConversa(l) : undefined;
  }
  criarConversa(d: Partial<Pick<Conversa, 'projetoId' | 'titulo' | 'motor' | 'modelo' | 'modeloAuto' | 'modo' | 'pensar' | 'esforco' | 'web'>>): Conversa {
    const r = this.db
      .prepare('insert into conversas(projeto_id, titulo, motor, modelo, modelo_auto, modo, pensar, esforco, web) values(?,?,?,?,?,?,?,?,?)')
      .run(d.projetoId ?? null, d.titulo ?? 'nova conversa', d.motor ?? 'claude', d.modelo ?? null, d.modeloAuto === false ? 0 : 1, d.modo ?? 'mid', d.pensar ?? 1, d.esforco ?? 1, d.web === false ? 0 : 1);
    return this.obterConversa(Number(r.lastInsertRowid))!;
  }
  atualizarConversa(id: number, campos: Partial<Record<'titulo' | 'motor' | 'modelo' | 'modo' | 'pensar' | 'esforco' | 'web' | 'projeto_id' | 'modelo_auto' | 'sessao_claude' | 'sessao_agy' | 'liberadas', string | number | null>>): void {
    const chaves = Object.keys(campos);
    if (chaves.length === 0) return;
    const sql = `update conversas set ${chaves.map((c) => `${c} = ?`).join(', ')}, atualizada = datetime('now') where id = ?`;
    this.db.prepare(sql).run(...(Object.values(campos) as (string | number | null)[]), id);
  }
  tocarConversa(id: number): void {
    this.db.prepare("update conversas set atualizada = datetime('now') where id = ?").run(id);
  }
  apagarConversa(id: number): void {
    this.db.prepare('delete from conversas where id = ?').run(id);
  }

  // ---------- mensagens ----------
  listarMensagens(conversaId: number): MensagemSalva[] {
    return (this.db.prepare('select id, conversa_id, papel, conteudo, criada from mensagens where conversa_id = ? order by id').all(conversaId) as Linha[]).map((l) => ({
      id: l.id,
      conversaId: l.conversa_id,
      papel: l.papel,
      conteudo: JSON.parse(l.conteudo),
      criada: l.criada,
    }));
  }
  salvarMensagem(conversaId: number, papel: 'eu' | 'ia', conteudo: unknown): number {
    const r = this.db.prepare('insert into mensagens(conversa_id, papel, conteudo) values(?,?,?)').run(conversaId, papel, JSON.stringify(conteudo));
    this.tocarConversa(conversaId);
    return Number(r.lastInsertRowid);
  }
  obterMensagem(id: number): MensagemSalva | undefined {
    const l = this.db.prepare('select id, conversa_id, papel, conteudo, criada from mensagens where id = ?').get(id) as Linha | undefined;
    return l ? { id: l.id, conversaId: l.conversa_id, papel: l.papel, conteudo: JSON.parse(l.conteudo), criada: l.criada } : undefined;
  }
  atualizarMensagem(id: number, conteudo: unknown): void {
    this.db.prepare('update mensagens set conteudo = ? where id = ?').run(JSON.stringify(conteudo), id);
  }
  contarMensagens(conversaId: number): number {
    return (this.db.prepare('select count(*) as n from mensagens where conversa_id = ?').get(conversaId) as { n: number }).n;
  }

  // ---------- busca ----------
  buscar(q: string, limite = 20): { conversaId: number; titulo: string; trecho: string }[] {
    const termo = `%${q.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
    const achados = new Map<number, { conversaId: number; titulo: string; trecho: string }>();
    for (const l of this.db.prepare("select id, titulo from conversas where titulo like ? escape '\\' order by atualizada desc limit ?").all(termo, limite) as Linha[]) {
      achados.set(l.id, { conversaId: l.id, titulo: l.titulo, trecho: '' });
    }
    const msgs = this.db
      .prepare(
        "select m.conversa_id as cid, c.titulo as titulo, m.conteudo as conteudo from mensagens m join conversas c on c.id = m.conversa_id where m.conteudo like ? escape '\\' order by m.id desc limit ?",
      )
      .all(termo, limite * 3) as Linha[];
    for (const l of msgs) {
      if (achados.has(l.cid) && achados.get(l.cid)!.trecho) continue;
      achados.set(l.cid, { conversaId: l.cid, titulo: l.titulo, trecho: trechoDe(String(l.conteudo), q) });
    }
    return [...achados.values()].slice(0, limite);
  }

  // ---------- progresso ----------
  listarProgresso(escopo: { conversaId?: number; projetoId?: number }): ItemSalvo[] {
    const linhas: Linha[] = [];
    if (escopo.conversaId !== undefined) {
      linhas.push(...(this.db.prepare('select * from progresso where conversa_id = ? order by ordem, id').all(escopo.conversaId) as Linha[]));
    }
    if (escopo.projetoId !== undefined) {
      // itens soltos do projeto + itens de todas as conversas dele
      linhas.push(
        ...(this.db
          .prepare(
            'select p.* from progresso p left join conversas c on c.id = p.conversa_id where p.projeto_id = ? or c.projeto_id = ? order by p.conversa_id, p.ordem, p.id',
          )
          .all(escopo.projetoId, escopo.projetoId) as Linha[]),
      );
    }
    return linhas.map(paraItem);
  }
  adicionarItem(d: { conversaId?: number | null; projetoId?: number | null; texto: string; origem: 'ia' | 'voce'; estado?: string; detalhe?: string | null }): ItemSalvo {
    const ordem = (this.db.prepare('select coalesce(max(ordem), 0) + 1 as o from progresso where conversa_id is ? and projeto_id is ?').get(d.conversaId ?? null, d.projetoId ?? null) as { o: number }).o;
    const r = this.db
      .prepare('insert into progresso(conversa_id, projeto_id, texto, estado, origem, detalhe, ordem) values(?,?,?,?,?,?,?)')
      .run(d.conversaId ?? null, d.projetoId ?? null, d.texto, d.estado ?? 'afazer', d.origem, d.detalhe ?? null, ordem);
    return paraItem(this.db.prepare('select * from progresso where id = ?').get(Number(r.lastInsertRowid)) as Linha);
  }
  mudarItem(id: number, campos: { estado?: string; texto?: string; detalhe?: string | null }): void {
    const sets: string[] = ["mudou = datetime('now')"];
    const valores: (string | number | null)[] = [];
    if (campos.estado !== undefined) (sets.push('estado = ?'), valores.push(campos.estado));
    if (campos.texto !== undefined) (sets.push('texto = ?'), valores.push(campos.texto));
    if (campos.detalhe !== undefined) (sets.push('detalhe = ?'), valores.push(campos.detalhe));
    this.db.prepare(`update progresso set ${sets.join(', ')} where id = ?`).run(...valores, id);
  }
  apagarItem(id: number): void {
    // a IA nao apaga item criado pelo Joao; essa funcao so e chamada pela rota (acao do Joao)
    this.db.prepare('delete from progresso where id = ?').run(id);
  }
  obterItem(id: number): ItemSalvo | undefined {
    const l = this.db.prepare('select * from progresso where id = ?').get(id) as Linha | undefined;
    return l ? paraItem(l) : undefined;
  }

  // A IA manda a lista inteira a cada vez. Itens dela (origem 'ia') sao sincronizados; os do Joao ficam como estao.
  sincronizarProgressoIa(conversaId: number, itens: ItemProgresso[]): void {
    const atuais = (this.db.prepare("select * from progresso where conversa_id = ? and origem = 'ia' order by ordem, id").all(conversaId) as Linha[]).map(paraItem);
    const usados = new Set<number>();
    let ordem = 0;
    this.db.exec('begin');
    try {
      for (const novo of itens) {
        ordem += 1;
        const igual = atuais.find((a) => !usados.has(a.id) && a.texto === novo.texto);
        if (igual) {
          usados.add(igual.id);
          if (igual.estado !== novo.estado) this.db.prepare("update progresso set estado = ?, mudou = datetime('now'), ordem = ? where id = ?").run(novo.estado, ordem, igual.id);
          else this.db.prepare('update progresso set ordem = ? where id = ?').run(ordem, igual.id);
        } else {
          this.db.prepare('insert into progresso(conversa_id, texto, estado, origem, ordem) values(?,?,?,?,?)').run(conversaId, novo.texto, novo.estado, 'ia', ordem);
        }
      }
      for (const a of atuais) {
        if (!usados.has(a.id)) this.db.prepare('delete from progresso where id = ?').run(a.id);
      }
      this.db.exec('commit');
    } catch (e) {
      this.db.exec('rollback');
      throw e;
    }
  }
}

function paraItem(l: Linha): ItemSalvo {
  return {
    id: l.id,
    conversaId: l.conversa_id,
    projetoId: l.projeto_id,
    texto: l.texto,
    estado: l.estado,
    origem: l.origem === 'ia' ? 'ia' : 'voce',
    detalhe: l.detalhe,
    ordem: l.ordem,
    mudou: l.mudou,
  };
}

function trechoDe(conteudoJson: string, q: string): string {
  let texto = conteudoJson;
  try {
    const c = JSON.parse(conteudoJson) as unknown;
    const pedacos: string[] = [];
    if (c && typeof c === 'object' && 'texto' in c && typeof (c as { texto: unknown }).texto === 'string') pedacos.push((c as { texto: string }).texto);
    if (Array.isArray(c)) for (const b of c as Bloco[]) if (b.tipo === 'texto') pedacos.push(b.texto);
    if (pedacos.length) texto = pedacos.join(' ');
  } catch {
    /* usa o texto cru */
  }
  const i = texto.toLowerCase().indexOf(q.toLowerCase());
  const ini = Math.max(0, i - 30);
  return (ini > 0 ? '…' : '') + texto.slice(ini, ini + 90).replace(/\s+/g, ' ');
}
