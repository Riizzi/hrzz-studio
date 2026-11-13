// Rotas da API (REST + WebSocket). Tudo aqui exige o cookie do PIN, menos /api/saude e /api/auth/*.
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { Autenticacao, NOME_COOKIE, lerCookie } from './auth.js';
import type { Config } from './config.js';
import { caminhosDados } from './config.js';
import { listarModelosAgy } from './ia/agy.js';
import { MODELOS_CLAUDE } from './ia/modelos.js';
import type { Modo } from './ia/tipos.js';
import { Orquestrador, type PedidoEnviar, type Saida } from './orquestrador.js';
import type { Repo } from './repo.js';
import { atualizar, estadoGit, listarVersoes, voltarVersao, CODIGO_REINICIAR } from './atualizacao.js';

export type Contexto = {
  config: Config;
  repo: Repo;
  auth: Autenticacao;
  orq: Orquestrador;
  clientes: Set<WebSocket>;
  aoReiniciar: () => void;
};

const MODOS: Modo[] = ['yolo', 'mid', 'intern'];
const NIVEIS = [0, 1, 2];

// o Cloudflare Access acrescenta este cabecalho; por esse caminho o claude sobe sem ferramentas de comando
export function veioDaCloudflare(req: FastifyRequest): boolean {
  return typeof req.headers['cf-access-authenticated-user-email'] === 'string';
}

function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'projeto';
}

function nivel(v: unknown): 0 | 1 | 2 | undefined {
  return typeof v === 'number' && NIVEIS.includes(v) ? (v as 0 | 1 | 2) : undefined;
}

export function criarEmissor(clientes: Set<WebSocket>) {
  return (s: Saida) => {
    const texto = JSON.stringify(s);
    for (const c of clientes) {
      if (c.readyState === 1) c.send(texto);
    }
  };
}

export async function registrarRotas(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { config, repo, auth, orq } = ctx;
  const dados = caminhosDados(config);

  // ---------- PIN: tudo que e /api/ exige o cookie, menos saude e auth ----------
  app.addHook('onRequest', async (req, reply) => {
    const url = req.url.split('?')[0];
    if (!url.startsWith('/api/')) return; // interface estatica: so o codigo da tela, nada pessoal
    if (url === '/api/saude' || url.startsWith('/api/auth/')) return;
    if (!auth.tokenValido(lerCookie(req.headers.cookie, NOME_COOKIE))) {
      return reply.code(401).send({ erro: 'pin', mensagem: 'entre com o PIN' });
    }
  });

  app.get('/api/auth/estado', async (req) => ({
    temPin: auth.temPin(),
    logado: auth.tokenValido(lerCookie(req.headers.cookie, NOME_COOKIE)),
  }));

  app.post('/api/auth/pin', async (req, reply) => {
    const corpo = (req.body ?? {}) as { pin?: unknown; atual?: unknown };
    if (!Autenticacao.pinValido(corpo.pin)) return reply.code(400).send({ erro: 'o PIN precisa ter de 4 a 12 números' });
    const logado = auth.tokenValido(lerCookie(req.headers.cookie, NOME_COOKIE));
    if (auth.temPin()) {
      if (!logado) return reply.code(401).send({ erro: 'pin' });
      if (typeof corpo.atual !== 'string' || auth.conferirPin(corpo.atual) !== 'ok') return reply.code(403).send({ erro: 'o PIN atual não confere' });
    }
    auth.definirPin(corpo.pin);
    reply.header('set-cookie', auth.cookie(auth.criarToken()));
    return { ok: true };
  });

  app.post('/api/auth/entrar', async (req, reply) => {
    const corpo = (req.body ?? {}) as { pin?: unknown };
    if (!auth.temPin()) return reply.code(409).send({ erro: 'ainda não existe PIN' });
    if (typeof corpo.pin !== 'string') return reply.code(400).send({ erro: 'PIN inválido' });
    const r = auth.conferirPin(corpo.pin);
    if (typeof r === 'number') return reply.code(429).send({ erro: `muitas tentativas. Espere ${r} s` });
    if (r !== 'ok') return reply.code(401).send({ erro: 'PIN errado' });
    reply.header('set-cookie', auth.cookie(auth.criarToken()));
    return { ok: true };
  });

  app.post('/api/auth/sair', async (_req, reply) => {
    reply.header('set-cookie', auth.cookieLimpo());
    return { ok: true };
  });

  // ---------- modelos ----------
  let cacheAgy: { em: number; lista: { id: string; nome: string }[] } | null = null;
  app.get('/api/modelos', async () => {
    if (!cacheAgy || Date.now() - cacheAgy.em > 10 * 60 * 1000) {
      cacheAgy = { em: Date.now(), lista: await listarModelosAgy(config) };
    }
    return { claude: MODELOS_CLAUDE, google: cacheAgy.lista };
  });

  // ---------- projetos ----------
  app.get('/api/projetos', async () => repo.listarProjetos());

  app.post('/api/projetos', async (req, reply) => {
    const c = (req.body ?? {}) as { nome?: unknown; pasta?: unknown };
    const nome = typeof c.nome === 'string' ? c.nome.trim() : '';
    if (!nome) return reply.code(400).send({ erro: 'dê um nome ao projeto' });
    let pasta = typeof c.pasta === 'string' ? c.pasta.trim() : '';
    if (pasta) {
      pasta = resolve(pasta);
      if (!existsSync(pasta) || !statSync(pasta).isDirectory()) return reply.code(400).send({ erro: `a pasta não existe: ${pasta}` });
    } else {
      pasta = join(config.dados, 'projetos', slug(nome));
      mkdirSync(pasta, { recursive: true });
    }
    return repo.criarProjeto(nome, pasta);
  });

  app.patch('/api/projetos/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const c = (req.body ?? {}) as { nome?: unknown };
    if (!repo.obterProjeto(id)) return reply.code(404).send({ erro: 'projeto não encontrado' });
    if (typeof c.nome === 'string' && c.nome.trim()) repo.renomearProjeto(id, c.nome.trim());
    return repo.obterProjeto(id);
  });

  app.delete('/api/projetos/:id', async (req) => {
    repo.apagarProjeto(Number((req.params as { id: string }).id));
    return { ok: true };
  });

  // ---------- conversas ----------
  app.get('/api/conversas', async () => repo.listarConversas());

  app.get('/api/conversas/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const conversa = repo.obterConversa(id);
    if (!conversa) return reply.code(404).send({ erro: 'conversa não encontrada' });
    return { conversa, mensagens: repo.listarMensagens(id), rodando: orq.estaRodando(id) };
  });

  app.patch('/api/conversas/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!repo.obterConversa(id)) return reply.code(404).send({ erro: 'conversa não encontrada' });
    const c = (req.body ?? {}) as Record<string, unknown>;
    const campos: Record<string, string | number | null> = {};
    if (typeof c.titulo === 'string' && c.titulo.trim()) campos.titulo = c.titulo.trim().slice(0, 120);
    if (typeof c.modo === 'string' && MODOS.includes(c.modo as Modo)) campos.modo = c.modo;
    if (nivel(c.pensar) !== undefined) campos.pensar = nivel(c.pensar)!;
    if (nivel(c.esforco) !== undefined) campos.esforco = nivel(c.esforco)!;
    if (typeof c.web === 'boolean') campos.web = c.web ? 1 : 0;
    if (c.projeto === null || typeof c.projeto === 'number') campos.projeto_id = c.projeto as number | null;
    repo.atualizarConversa(id, campos);
    return repo.obterConversa(id);
  });

  app.delete('/api/conversas/:id', async (req) => {
    const id = Number((req.params as { id: string }).id);
    orq.parar(id);
    repo.apagarConversa(id);
    ctx.clientes.forEach((c) => c.readyState === 1 && c.send(JSON.stringify({ tipo: 'removida', conversa: id })));
    return { ok: true };
  });

  app.get('/api/busca', async (req) => {
    const q = String((req.query as { q?: string }).q ?? '').trim();
    if (q.length < 2) return [];
    return repo.buscar(q);
  });

  // ---------- progresso ----------
  app.get('/api/progresso', async (req) => {
    const q = req.query as { conversa?: string; projeto?: string };
    if (q.projeto) return repo.listarProgresso({ projetoId: Number(q.projeto) });
    if (q.conversa) return repo.listarProgresso({ conversaId: Number(q.conversa) });
    return [];
  });

  app.post('/api/progresso', async (req, reply) => {
    const c = (req.body ?? {}) as { conversa?: number; projeto?: number; texto?: string };
    const texto = typeof c.texto === 'string' ? c.texto.trim().slice(0, 300) : '';
    if (!texto) return reply.code(400).send({ erro: 'escreva a tarefa' });
    if (!c.conversa && !c.projeto) return reply.code(400).send({ erro: 'falta a conversa ou o projeto' });
    const item = repo.adicionarItem({ conversaId: c.conversa ?? null, projetoId: c.conversa ? null : (c.projeto ?? null), texto, origem: 'voce' });
    return item;
  });

  app.patch('/api/progresso/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const item = repo.obterItem(id);
    if (!item) return reply.code(404).send({ erro: 'item não encontrado' });
    const c = (req.body ?? {}) as { estado?: string; texto?: string };
    const campos: { estado?: string; texto?: string } = {};
    if (c.estado && ['afazer', 'fazendo', 'feito'].includes(c.estado)) campos.estado = c.estado;
    if (typeof c.texto === 'string' && c.texto.trim()) campos.texto = c.texto.trim();
    repo.mudarItem(id, campos);
    return repo.obterItem(id);
  });

  app.delete('/api/progresso/:id', async (req) => {
    repo.apagarItem(Number((req.params as { id: string }).id));
    return { ok: true };
  });

  // ---------- anexos ----------
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: 60 * 1024 * 1024 }, (_req, corpo, feito) => feito(null, corpo));

  app.post('/api/anexos', async (req, reply) => {
    const q = req.query as { nome?: string };
    const original = basename(String(q.nome ?? 'arquivo')).replace(/[^\w.\- ()]/g, '_').slice(0, 100) || 'arquivo';
    const corpo = req.body;
    if (!Buffer.isBuffer(corpo) || corpo.length === 0) return reply.code(400).send({ erro: 'arquivo vazio' });
    const pasta = join(dados.anexos, new Date().toISOString().slice(0, 10));
    mkdirSync(pasta, { recursive: true });
    const caminho = join(pasta, `${randomBytes(4).toString('hex')}-${original}`);
    writeFileSync(caminho, corpo);
    const ext = original.split('.').pop()?.toLowerCase() ?? '';
    const tipo = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext) ? 'imagem' : ext === 'pdf' ? 'pdf' : ext === 'docx' ? 'docx' : ext === 'txt' || ext === 'md' ? 'texto' : ext || 'arquivo';
    return { nome: original, caminho, tipo, tamanho: corpo.length };
  });

  // ---------- uso das assinaturas ----------
  app.get('/api/uso', async () => orq.ultimoUso ?? {});

  // ---------- atualizar e voltar versao ----------
  app.get('/api/sistema', async (req) => {
    const buscar = (req.query as { buscar?: string }).buscar === '1';
    return { git: await estadoGit(config.raiz, buscar), versoes: await listarVersoes(config.raiz), comVigia: process.env.HRZZ_VIGIA === '1' };
  });

  app.post('/api/sistema/atualizar', async () => {
    const r = await atualizar(config.raiz);
    if (r.reiniciar) setTimeout(() => ctx.aoReiniciar(), 800);
    return { ...r, reiniciando: r.reiniciar && process.env.HRZZ_VIGIA === '1' };
  });

  app.post('/api/sistema/voltar', async (req, reply) => {
    const tag = String(((req.body ?? {}) as { tag?: unknown }).tag ?? '');
    if (!/^antes-[0-9T-]+$/.test(tag)) return reply.code(400).send({ erro: 'versão inválida' });
    const r = await voltarVersao(config.raiz, tag);
    if (r.reiniciar) setTimeout(() => ctx.aoReiniciar(), 800);
    return { ...r, reiniciando: r.reiniciar && process.env.HRZZ_VIGIA === '1' };
  });

  // ---------- WebSocket ----------
  app.get('/api/ws', { websocket: true }, (socket, req) => {
    const restrito = veioDaCloudflare(req);
    ctx.clientes.add(socket);
    socket.on('close', () => ctx.clientes.delete(socket));
    const erro = (mensagem: string) => socket.readyState === 1 && socket.send(JSON.stringify({ tipo: 'erro', mensagem }));
    socket.on('message', async (bruto: Buffer) => {
      let m: Record<string, unknown>;
      try {
        m = JSON.parse(bruto.toString()) as Record<string, unknown>;
      } catch {
        return erro('mensagem ilegível');
      }
      try {
        if (m.tipo === 'enviar') {
          await orq.enviar(m as unknown as PedidoEnviar, restrito);
        } else if (m.tipo === 'parar') {
          orq.parar(Number(m.conversa));
        } else if (m.tipo === 'permissao') {
          await orq.responderPermissao(
            { conversa: Number(m.conversa), mensagem: Number(m.mensagem), indiceBloco: Number(m.indiceBloco), resposta: m.resposta as 'sim' | 'sempre' | 'nao' },
            restrito,
          );
        }
      } catch (e) {
        erro((e as Error).message);
      }
    });
  });
}

export { CODIGO_REINICIAR };
