// Rotas da etapa 5 (IA junta): guardiao de cota, dueto, duelo, fila em segundo plano e agendamentos.
// Tudo atras do PIN (o gancho de rotas.ts cobre /api/).
import type { FastifyInstance } from 'fastify';
import type { Fila } from '../fila.js';
import { proximaExecucao, validarCron } from '../fila.js';
import type { Orquestrador, Saida } from '../orquestrador.js';
import type { Repo } from '../repo.js';
import { veioDaCloudflare } from '../rotas.js';
import { SUBPASTA_PADRAO, subpastaValida } from './dueto.js';
import type { Modo } from './tipos.js';

const MODOS: Modo[] = ['yolo', 'mid', 'intern'];
const MODELOS_OK = /^[\w.\-:/]{1,80}$/;

export type ContextoJunta = { repo: Repo; orq: Orquestrador; fila: Fila; emitir: (s: Saida) => void };

function texto(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registrarRotasJunta(app: FastifyInstance, ctx: ContextoJunta): void {
  const { repo, orq, fila, emitir } = ctx;

  // ---------- guardiao de cota ----------
  app.get('/api/uso', async () => orq.guardiao.estado());

  app.post('/api/cota/haiku', async (req) => {
    const ligar = ((req.body ?? {}) as { ligar?: unknown }).ligar !== false;
    if (ligar) orq.guardiao.ligarHaiku();
    else orq.guardiao.desligarHaiku();
    const cota = orq.guardiao.estado();
    emitir({ tipo: 'cota', cota });
    return cota;
  });

  // ---------- dueto ----------
  app.get('/api/dueto/ajustes', async () => ({
    subpasta: subpastaValida(repo.lerConfig('dueto:subpasta')),
    padrao: SUBPASTA_PADRAO,
    modeloAgy: repo.lerConfig('dueto:modelo_agy') ?? '',
  }));

  app.put('/api/dueto/ajustes', async (req, reply) => {
    const c = (req.body ?? {}) as { subpasta?: unknown; modeloAgy?: unknown };
    if (c.subpasta !== undefined) {
      const bruto = texto(c.subpasta, 80);
      const boa = subpastaValida(bruto);
      if (bruto && boa !== bruto.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')) return reply.code(400).send({ erro: 'a subpasta precisa ficar dentro do projeto (sem "..", sem caminho completo)' });
      repo.gravarConfig('dueto:subpasta', boa);
    }
    if (c.modeloAgy !== undefined) {
      const m = texto(c.modeloAgy, 80);
      if (m && !MODELOS_OK.test(m)) return reply.code(400).send({ erro: 'nome de modelo inválido' });
      repo.gravarConfig('dueto:modelo_agy', m);
    }
    return { subpasta: subpastaValida(repo.lerConfig('dueto:subpasta')), modeloAgy: repo.lerConfig('dueto:modelo_agy') ?? '' };
  });

  // ---------- duelo: "usar essa" ----------
  app.post('/api/duelo/escolher', async (req, reply) => {
    const c = (req.body ?? {}) as { conversa?: unknown; mensagem?: unknown; lado?: unknown };
    try {
      return await orq.escolherDuelo({ conversa: Number(c.conversa), mensagem: Number(c.mensagem), lado: Number(c.lado) as 0 | 1 | -1 });
    } catch (e) {
      return reply.code(400).send({ erro: (e as Error).message });
    }
  });

  // ---------- fila em segundo plano ----------
  const lista = () => ({
    tarefas: repo.listarTarefas(),
    agendamentos: repo.listarAgendamentos().map((a) => ({ ...a, proxima: fila.proxima(a) })),
  });
  app.get('/api/tarefas', async () => lista());

  // tarefas e agendamentos rodam sem ninguem olhando: pelo caminho da Cloudflare (sem comandos) ficam bloqueados
  const bloqueadoAqui = (req: Parameters<typeof veioDaCloudflare>[0]) => veioDaCloudflare(req);

  function lerTarefa(c: Record<string, unknown>) {
    const pedido = texto(c.pedido, 20000);
    if (!pedido) return { erro: 'escreva o que a tarefa deve fazer' } as const;
    const projetoId = c.projeto === null || c.projeto === undefined || c.projeto === '' ? null : Number(c.projeto);
    if (projetoId !== null && !repo.obterProjeto(projetoId)) return { erro: 'projeto não encontrado' } as const;
    const modo = MODOS.includes(c.modo as Modo) ? (c.modo as Modo) : 'mid';
    const modelo = typeof c.modelo === 'string' && c.modelo !== 'auto' && MODELOS_OK.test(c.modelo) ? c.modelo : null;
    const titulo = texto(c.titulo, 80) || pedido.replace(/\s+/g, ' ').slice(0, 60);
    return { pedido, projetoId, modo, modelo, titulo } as const;
  }

  app.post('/api/tarefas', async (req, reply) => {
    if (bloqueadoAqui(req)) return reply.code(403).send({ erro: 'tarefas em segundo plano ficam bloqueadas por esse caminho de acesso' });
    const t = lerTarefa((req.body ?? {}) as Record<string, unknown>);
    if ('erro' in t) return reply.code(400).send({ erro: t.erro });
    return fila.adicionar({ titulo: t.titulo, pedido: t.pedido, projetoId: t.projetoId, modelo: t.modelo, modo: t.modo });
  });

  app.post('/api/tarefas/:id/cancelar', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!fila.cancelar(id)) return reply.code(409).send({ erro: 'essa tarefa já terminou' });
    return { ok: true };
  });

  app.delete('/api/tarefas/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const t = repo.obterTarefa(id);
    if (!t) return reply.code(404).send({ erro: 'tarefa não encontrada' });
    if (t.estado === 'fila' || t.estado === 'rodando') return reply.code(409).send({ erro: 'cancele a tarefa antes de tirar da lista' });
    repo.apagarTarefa(id);
    emitir({ tipo: 'fila' });
    return { ok: true };
  });

  // ---------- agendamentos ----------
  app.get('/api/agendamentos', async () => lista().agendamentos);

  app.post('/api/agendamentos/validar', async (req) => {
    const cron = texto(((req.body ?? {}) as { cron?: unknown }).cron, 100);
    const erro = validarCron(cron);
    if (erro) return { ok: false, erro };
    const proximas: number[] = [];
    let de = new Date();
    for (let i = 0; i < 3; i++) {
      const p = proximaExecucao(cron, de);
      if (!p) break;
      proximas.push(p.getTime());
      de = p;
    }
    return { ok: true, proximas };
  });

  app.post('/api/agendamentos', async (req, reply) => {
    if (bloqueadoAqui(req)) return reply.code(403).send({ erro: 'agendamentos ficam bloqueados por esse caminho de acesso' });
    const c = (req.body ?? {}) as Record<string, unknown>;
    const t = lerTarefa(c);
    if ('erro' in t) return reply.code(400).send({ erro: t.erro });
    const cron = texto(c.cron, 100);
    const erro = validarCron(cron);
    if (erro) return reply.code(400).send({ erro });
    const a = fila.agendar({ titulo: t.titulo, pedido: t.pedido, projetoId: t.projetoId, cron, modelo: t.modelo, modo: t.modo });
    return { ...a, proxima: fila.proxima(a) };
  });

  app.patch('/api/agendamentos/:id', async (req, reply) => {
    if (bloqueadoAqui(req)) return reply.code(403).send({ erro: 'agendamentos ficam bloqueados por esse caminho de acesso' });
    const id = Number((req.params as { id: string }).id);
    if (!repo.obterAgendamento(id)) return reply.code(404).send({ erro: 'agendamento não encontrado' });
    const c = (req.body ?? {}) as Record<string, unknown>;
    const campos: Parameters<Repo['mudarAgendamento']>[1] = {};
    if (typeof c.ligado === 'boolean') campos.ligado = c.ligado;
    if (typeof c.titulo === 'string' && texto(c.titulo, 80)) campos.titulo = texto(c.titulo, 80);
    if (typeof c.pedido === 'string' && texto(c.pedido, 20000)) campos.pedido = texto(c.pedido, 20000);
    if (typeof c.cron === 'string') {
      const erro = validarCron(texto(c.cron, 100));
      if (erro) return reply.code(400).send({ erro });
      campos.cron = texto(c.cron, 100);
    }
    if (MODOS.includes(c.modo as Modo)) campos.modo = c.modo as Modo;
    const a = fila.mudarAgendamento(id, campos)!;
    return { ...a, proxima: fila.proxima(a) };
  });

  app.delete('/api/agendamentos/:id', async (req) => {
    fila.apagarAgendamento(Number((req.params as { id: string }).id));
    return { ok: true };
  });

  app.post('/api/agendamentos/:id/rodar-agora', async (req, reply) => {
    if (bloqueadoAqui(req)) return reply.code(403).send({ erro: 'bloqueado por esse caminho de acesso' });
    const t = fila.disparar(Number((req.params as { id: string }).id));
    if (!t) return reply.code(409).send({ erro: 'a rodada anterior desse agendamento ainda não terminou' });
    return t;
  });
}
