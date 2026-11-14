// Painel do dia (etapa 6): junta agenda, repositorios, pendencias das conversas e uso num so lugar.
//  - repositorios: estado do git de cada projeto cadastrado (local) + pull requests e issues do GitHub (se houver token)
//  - agenda: pede ao claude (Haiku) pra consultar o conector Google Agenda; so quando o Joao clica, porque gasta cota
//  - pendencias e uso: vem do proprio banco e do guardiao de cota
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { Conectores } from '../conectores/conectores.js';
import type { Config } from '../config.js';
import { prefixoMcp } from '../conectores/catalogo.js';
import { rodarClaude } from '../ia/claude.js';
import type { Evento } from '../ia/tipos.js';
import type { Fila } from '../fila.js';
import type { Orquestrador } from '../orquestrador.js';
import type { Repo } from '../repo.js';

export type EstadoRepo = {
  projetoId: number;
  nome: string;
  existe: boolean;
  git: boolean;
  ramo?: string;
  alteracoes?: number;
  aFrente?: number;
  atras?: number;
  semRemoto?: boolean;
  ultimo?: { assunto: string; em: number };
};

export type ItemGithub = { tipo: 'meu-pr' | 'revisar' | 'issue'; titulo: string; repo: string; numero: number; url: string; atualizado: string };
export type ResumoGithub = { ligado: boolean; itens: ItemGithub[]; quando?: number; erro?: string };

export type EventoAgenda = { inicio: string; fim?: string; titulo: string; local?: string; diaTodo?: boolean };
export type ResumoAgenda = {
  disponivel: boolean; // conector de agenda achado e ligado
  motivo?: string;
  eventos: EventoAgenda[];
  quando?: number;
  erro?: string;
  atualizando: boolean;
};

const CHAVE_AGENDA = 'dia:agenda';
const VALIDADE_GITHUB_MS = 5 * 60_000;
const TEMPO_AGENDA_MS = 120_000;

function git(pasta: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', pasta, ...args], { timeout: 6000, windowsHide: true, maxBuffer: 512 * 1024 }, (erro, saida) => (erro ? reject(erro) : resolve(String(saida))));
  });
}

export async function estadoGit(projetoId: number, nome: string, pasta: string): Promise<EstadoRepo> {
  if (!existsSync(pasta)) return { projetoId, nome, existe: false, git: false };
  try {
    const saida = await git(pasta, ['status', '--porcelain=v1', '-b']);
    const linhas = saida.split(/\r?\n/).filter(Boolean);
    const cab = linhas[0] ?? '';
    const r: EstadoRepo = { projetoId, nome, existe: true, git: true, alteracoes: Math.max(0, linhas.length - 1) };
    // cabecalho: "## ramo...origem/ramo [ahead 1, behind 2]" (ou "## No commits yet on ramo")
    const colchete = /\[(.*)\]\s*$/.exec(cab)?.[1] ?? '';
    const nomes = cab.replace(/^## (No commits yet on |Initial commit on )?/, '').replace(/\s*\[.*\]\s*$/, '');
    const [ramo, remoto] = nomes.split('...');
    r.ramo = ramo || undefined;
    r.semRemoto = !remoto;
    const frente = /ahead (\d+)/.exec(colchete);
    const atras = /behind (\d+)/.exec(colchete);
    r.aFrente = frente ? Number(frente[1]) : 0;
    r.atras = atras ? Number(atras[1]) : 0;
    try {
      const l = (await git(pasta, ['log', '-1', '--format=%ct%x09%s'])).trim();
      const [ct, ...resto] = l.split('\t');
      if (ct) r.ultimo = { em: Number(ct) * 1000, assunto: resto.join('\t').slice(0, 120) };
    } catch {
      /* repositorio sem commits */
    }
    return r;
  } catch {
    return { projetoId, nome, existe: true, git: false };
  }
}

export function lerEventosAgenda(texto: string): EventoAgenda[] | null {
  const ini = texto.indexOf('[');
  const fim = texto.lastIndexOf(']');
  if (ini < 0 || fim <= ini) return null;
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto.slice(ini, fim + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(bruto)) return null;
  const cura = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const eventos: EventoAgenda[] = [];
  for (const e of bruto.slice(0, 40)) {
    if (!e || typeof e !== 'object') continue;
    const o = e as Record<string, unknown>;
    const inicio = cura(o.inicio, 40);
    const titulo = cura(o.titulo, 140);
    if (!inicio || !titulo || Number.isNaN(Date.parse(inicio))) continue;
    const ev: EventoAgenda = { inicio, titulo };
    const f = cura(o.fim, 40);
    if (f && !Number.isNaN(Date.parse(f))) ev.fim = f;
    const l = cura(o.local, 120);
    if (l) ev.local = l;
    if (o.diaTodo === true) ev.diaTodo = true;
    eventos.push(ev);
  }
  return eventos.sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
}

export class PainelDia {
  private cacheGithub: { em: number; dados: ResumoGithub } | null = null;
  private agendaEmCurso: Promise<ResumoAgenda> | null = null;

  constructor(
    private ctx: {
      config: Config;
      repo: Repo;
      orq: Orquestrador;
      fila: Fila;
      conectores: Conectores;
      buscar?: typeof fetch;
      agora?: () => number;
    },
  ) {}

  private agora = () => (this.ctx.agora ?? Date.now)();

  // ---------- repositorios ----------
  async repositorios(): Promise<EstadoRepo[]> {
    const projetos = this.ctx.repo.listarProjetos();
    const saida: EstadoRepo[] = [];
    for (let i = 0; i < projetos.length; i += 4) {
      saida.push(...(await Promise.all(projetos.slice(i, i + 4).map((p) => estadoGit(p.id, p.nome, p.pasta)))));
    }
    return saida;
  }

  // ---------- GitHub (API do proprio GitHub, com o token do conector) ----------
  async github(forcar = false): Promise<ResumoGithub> {
    const token = this.ctx.conectores.tokenDe('github');
    if (!token) return { ligado: false, itens: [] };
    const c = this.cacheGithub;
    if (!forcar && c && this.agora() - c.em < VALIDADE_GITHUB_MS) return c.dados;
    const base = this.ctx.config.apis.github;
    const buscar = this.ctx.buscar ?? fetch;
    const consultas: { tipo: ItemGithub['tipo']; q: string }[] = [
      { tipo: 'meu-pr', q: 'is:open is:pr author:@me archived:false' },
      { tipo: 'revisar', q: 'is:open is:pr review-requested:@me archived:false' },
      { tipo: 'issue', q: 'is:open is:issue assignee:@me archived:false' },
    ];
    let dados: ResumoGithub;
    try {
      const partes = await Promise.all(
        consultas.map(async ({ tipo, q }) => {
          const r = await buscar(`${base}/search/issues?q=${encodeURIComponent(q)}&sort=updated&per_page=8`, {
            headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'hrzz-studio', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
            signal: AbortSignal.timeout(10_000),
          });
          if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'o GitHub recusou o token' : `o GitHub respondeu erro ${r.status}`);
          const j = (await r.json()) as { items?: { title?: string; html_url?: string; number?: number; repository_url?: string; updated_at?: string }[] };
          return (j.items ?? []).map((i): ItemGithub => ({
            tipo,
            titulo: String(i.title ?? '').slice(0, 140),
            repo: String(i.repository_url ?? '').replace(/^.*\/repos\//, ''),
            numero: Number(i.number ?? 0),
            url: String(i.html_url ?? ''),
            atualizado: String(i.updated_at ?? ''),
          }));
        }),
      );
      const vistos = new Set<string>();
      const itens = partes
        .flat()
        .filter((i) => {
          const chave = `${i.repo}#${i.numero}`;
          if (vistos.has(chave)) return false;
          vistos.add(chave);
          return true;
        })
        .sort((a, b) => b.atualizado.localeCompare(a.atualizado))
        .slice(0, 12);
      dados = { ligado: true, itens, quando: this.agora() };
    } catch (e) {
      const nome = (e as Error).name;
      dados = { ligado: true, itens: [], quando: this.agora(), erro: nome === 'TimeoutError' || nome === 'AbortError' ? 'o GitHub não respondeu em 10 s' : ((e as Error).message || 'não consegui falar com o GitHub') };
    }
    this.cacheGithub = { em: this.agora(), dados };
    return dados;
  }

  // ---------- agenda ----------
  private agendaSalva(): { eventos: EventoAgenda[]; quando: number } | null {
    try {
      const s = this.ctx.repo.lerConfig(CHAVE_AGENDA);
      return s ? (JSON.parse(s) as { eventos: EventoAgenda[]; quando: number }) : null;
    } catch {
      return null;
    }
  }

  private servidorAgenda(): { nome: string; motivo?: string } | { nome?: undefined; motivo: string } {
    const v = this.ctx.conectores.listar().find((c) => c.id === 'google-calendar');
    if (!v) return { motivo: 'conector de agenda desconhecido' };
    if (!v.ligado) return { motivo: 'o conector da agenda está desligado' };
    const s = this.ctx.conectores.servidorDe('google-calendar');
    if (!s) return { motivo: 'o Google Agenda ainda não está conectado ao claude (veja a tela de conectores)' };
    if (s.estado !== 'conectado') return { motivo: 'o Google Agenda precisa de login no claude (veja a tela de conectores)' };
    return { nome: s.nome };
  }

  agenda(): ResumoAgenda {
    const s = this.servidorAgenda();
    const salva = this.agendaSalva();
    return { disponivel: !!s.nome, motivo: s.motivo, eventos: salva?.eventos ?? [], quando: salva?.quando, atualizando: !!this.agendaEmCurso };
  }

  atualizarAgenda(): Promise<ResumoAgenda> {
    if (this.agendaEmCurso) return this.agendaEmCurso;
    this.agendaEmCurso = this.consultarAgenda().finally(() => {
      this.agendaEmCurso = null;
    });
    return this.agendaEmCurso;
  }

  private async consultarAgenda(): Promise<ResumoAgenda> {
    const s = this.servidorAgenda();
    if (!s.nome) return { ...this.agenda(), disponivel: false, atualizando: false };
    const fuso = 'America/Sao_Paulo';
    const data = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: fuso });
    const hoje = new Date(this.agora());
    const depois = new Date(this.agora() + 2 * 86_400_000);
    const pedido = `HRZZ-AGENDA: liste os meus eventos do Google Agenda de ${data(hoje)} até ${data(depois)} (fuso ${fuso}), de todas as minhas agendas. Responda SOMENTE com um array JSON, sem texto antes ou depois, no formato [{"inicio":"2026-01-31T09:00:00-03:00","fim":"2026-01-31T10:00:00-03:00","titulo":"...","local":"...","diaTodo":false}]. Se não houver eventos, responda [].`;
    const prefixo = prefixoMcp(s.nome);
    let texto = '';
    const turno = rodarClaude(
      this.ctx.config,
      {
        motor: 'claude',
        mensagem: pedido,
        cwd: this.ctx.config.dados,
        modelo: 'haiku',
        esforco: 0,
        pensar: 0,
        web: false,
        modo: 'intern',
        restrito: false,
        promptSistema: 'Você só consulta a agenda do João e devolve JSON puro. Não crie, mude nem apague eventos. Não use outras ferramentas.',
        pastasExtras: [],
        liberadas: [],
        permitidasExtra: [prefixo],
        mcpEstrito: false,
      },
      (e: Evento) => {
        if (e.t === 'texto_delta') texto += e.texto;
      },
    );
    const limite = setTimeout(() => turno.parar(), TEMPO_AGENDA_MS);
    let resultado;
    try {
      resultado = await turno.terminou;
    } finally {
      clearTimeout(limite);
    }
    const dosBlocos = resultado.blocos.filter((b) => b.tipo === 'texto').map((b) => (b as { texto: string }).texto).join('\n');
    const bruto = dosBlocos || texto;
    if (resultado.parado) return { ...this.agenda(), erro: 'a consulta demorou demais e foi parada', atualizando: false };
    if (resultado.erro) return { ...this.agenda(), erro: resultado.erro, atualizando: false };
    const eventos = lerEventosAgenda(bruto);
    if (!eventos) return { ...this.agenda(), erro: 'o claude não devolveu a agenda num formato que eu entenda', atualizando: false };
    const quando = this.agora();
    this.ctx.repo.gravarConfig(CHAVE_AGENDA, JSON.stringify({ eventos, quando }));
    return { disponivel: true, eventos, quando, atualizando: false };
  }

  // ---------- tudo junto ----------
  async montar(): Promise<{
    quando: number;
    pendencias: ReturnType<Repo['pendenciasAbertas']>;
    fila: { naFila: number; rodando: number; comErro: { id: number; titulo: string; erro: string | null }[]; proximos: { id: number; titulo: string; proxima: number }[] };
    uso: ReturnType<Orquestrador['guardiao']['estado']>;
    repositorios: EstadoRepo[];
    github: ResumoGithub;
    agenda: ResumoAgenda;
  }> {
    const { repo, fila, orq } = this.ctx;
    const tarefas = repo.listarTarefas(8);
    const proximos = repo
      .listarAgendamentos()
      .filter((a) => a.ligado)
      .map((a) => ({ id: a.id, titulo: a.titulo, proxima: fila.proxima(a) ?? 0 }))
      .filter((a) => a.proxima > 0)
      .sort((a, b) => a.proxima - b.proxima)
      .slice(0, 3);
    const [repositorios, github] = await Promise.all([this.repositorios(), this.github()]);
    return {
      quando: this.agora(),
      pendencias: repo.pendenciasAbertas(30),
      fila: {
        naFila: tarefas.filter((t) => t.estado === 'fila').length,
        rodando: tarefas.filter((t) => t.estado === 'rodando').length,
        comErro: tarefas.filter((t) => t.estado === 'erro').slice(0, 3).map((t) => ({ id: t.id, titulo: t.titulo, erro: t.erro })),
        proximos,
      },
      uso: orq.guardiao.estado(),
      repositorios,
      github,
      agenda: this.agenda(),
    };
  }
}
