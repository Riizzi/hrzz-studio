import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import { Autenticacao } from './auth.js';
import { caminhosDados, type Config } from './config.js';
import { abrirBanco, type Banco } from './db.js';
import { Orquestrador } from './orquestrador.js';
import { Repo } from './repo.js';
import { criarEmissor, registrarRotas, CODIGO_REINICIAR } from './rotas.js';

const inicio = Date.now();

export type OpcoesApp = { banco?: Banco; aoReiniciar?: () => void };

export async function construirApp(config: Config, opcoes: OpcoesApp = {}) {
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });
  const dados = caminhosDados(config);
  const db = opcoes.banco ?? abrirBanco(dados.banco);
  const repo = new Repo(db);
  const auth = new Autenticacao(dados.segredos, config.diasPin);
  const clientes = new Set<WebSocket>();
  const orq = new Orquestrador(config, repo, criarEmissor(clientes));

  await app.register(fastifyWebsocket);

  app.get('/api/saude', async () => ({
    ok: true,
    nome: 'hrzz-studio',
    versao: '0.1.0',
    sistema: process.platform,
    node: process.version,
    ligadoHa: Math.round((Date.now() - inicio) / 1000),
  }));

  await registrarRotas(app, {
    config,
    repo,
    auth,
    orq,
    clientes,
    aoReiniciar: opcoes.aoReiniciar ?? (() => process.exit(CODIGO_REINICIAR)),
  });

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

  app.addHook('onClose', async () => {
    for (const c of clientes) c.close();
    try {
      db.close();
    } catch {
      /* ja fechado */
    }
  });

  return Object.assign(app, { orquestrador: orq, repo });
}
