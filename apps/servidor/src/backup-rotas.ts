// Rotas do backup local. O PIN ja e exigido pelo gancho de rotas.ts (tudo em /api/ menos saude e auth).
import type { FastifyInstance } from 'fastify';
import { type Backups } from './backup.js';

export function registrarRotasBackup(app: FastifyInstance, backups: Backups): void {
  app.get('/api/backup', async () => {
    const lista = backups.listar();
    return {
      pasta: backups.pasta,
      manter: backups.manter,
      horario: '03:00',
      proximo: backups.proximo(),
      fazendo: backups.fazendo,
      ultimo: lista[0] ?? null,
      lista,
    };
  });

  app.post('/api/backup', async (_req, reply) => {
    if (backups.fazendo) return reply.code(409).send({ erro: 'já tem um backup rodando' });
    try {
      const backup = await backups.fazer();
      return { ok: true, backup, total: backups.listar().length };
    } catch (e) {
      return reply.code(500).send({ erro: `o backup falhou: ${(e as Error).message}` });
    }
  });
}
