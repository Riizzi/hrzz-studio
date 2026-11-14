// Rotas da etapa 6: conectores e painel do dia. O PIN ja e exigido pelo gancho de rotas.ts (tudo em /api/).
import type { FastifyInstance } from 'fastify';
import type { PainelDia } from '../dia/dia.js';
import { veioDaCloudflare } from '../rotas.js';
import type { Conectores } from './conectores.js';

export function registrarRotasConectores(app: FastifyInstance, ctx: { conectores: Conectores; dia: PainelDia }): void {
  const { conectores, dia } = ctx;

  app.get('/api/conectores', async (req) => {
    // a lista do claude e consultada em segundo plano: a tela abre na hora e a proxima leitura ja vem atualizada
    void conectores.detectar().catch(() => undefined);
    const d = conectores.deteccaoAtual();
    return { conectores: conectores.listar(), deteccao: d ? { quando: d.quando, erro: d.erro ?? null } : null, bloqueado: veioDaCloudflare(req) };
  });

  // consulta o `claude mcp list` agora (demora alguns segundos: ele testa cada servidor)
  app.post('/api/conectores/detectar', async () => {
    const d = await conectores.detectar(true);
    return { conectores: conectores.listar(), deteccao: { quando: d.quando, erro: d.erro ?? null }, bloqueado: false };
  });

  app.put('/api/conectores/:id', async (req, reply) => {
    if (veioDaCloudflare(req)) return reply.code(403).send({ erro: 'conectores ficam bloqueados por esse caminho de acesso' });
    try {
      return conectores.mudar((req.params as { id: string }).id, (req.body ?? {}) as Record<string, unknown>);
    } catch (e) {
      return reply.code(400).send({ erro: (e as Error).message });
    }
  });

  app.post('/api/conectores/:id/testar', async (req, reply) => {
    if (veioDaCloudflare(req)) return reply.code(403).send({ erro: 'conectores ficam bloqueados por esse caminho de acesso' });
    try {
      const r = await conectores.testar((req.params as { id: string }).id);
      return { ...r, conectores: conectores.listar() };
    } catch (e) {
      return reply.code(400).send({ erro: (e as Error).message });
    }
  });

  // ---------- painel do dia ----------
  app.get('/api/dia', async () => {
    void conectores.detectar().catch(() => undefined); // a agenda depende de saber se o Google Agenda esta conectado
    return dia.montar();
  });

  app.post('/api/dia/github', async () => dia.github(true));

  app.post('/api/dia/agenda/atualizar', async (req, reply) => {
    if (veioDaCloudflare(req)) return reply.code(403).send({ erro: 'a consulta da agenda fica bloqueada por esse caminho de acesso' });
    return dia.atualizarAgenda();
  });
}
