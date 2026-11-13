import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import type { Config } from './config.js';

const inicio = Date.now();

export async function construirApp(config: Config) {
  const app = Fastify({ logger: false });

  app.get('/api/saude', async () => ({
    ok: true,
    nome: 'hrzz-studio',
    versao: '0.0.1',
    sistema: process.platform,
    node: process.version,
    ligadoHa: Math.round((Date.now() - inicio) / 1000),
  }));

  // interface compilada (npm run build). No modo dev quem serve a interface e o Vite (7001).
  const indice = join(config.web, 'index.html');
  if (existsSync(indice)) {
    await app.register(fastifyStatic, { root: config.web, wildcard: false });
    // qualquer rota que nao seja da API cai na interface (ela e uma pagina so)
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ erro: 'rota nao encontrada' });
      return reply.sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((_req, reply) =>
      reply.code(404).send({ erro: 'rota nao encontrada. A interface compilada nao existe: rode npm run build ou use npm run dev (porta 7001).' }),
    );
  }

  return app;
}
