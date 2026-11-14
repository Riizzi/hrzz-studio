// Rotas da etapa 2: preview (proxy e servidor de dev), versoes e desfazer, editar texto, rabisco,
// antes/depois, arquivos, galeria e terminal. Tudo atras do PIN (o gancho de rotas.ts cobre /api/ e /preview/).
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../config.js';
import { caminhosDados } from '../config.js';
import type { Orquestrador, Saida } from '../orquestrador.js';
import type { Repo } from '../repo.js';
import { veioDaCloudflare } from '../rotas.js';
import { listarSalvas } from '../transcricao/ata.js';
import { CaminhoInvalido, CONTENT_TYPE, caminhoSeguro, listarPasta, previa, varrer, type Achado } from './arquivos.js';
import type { Capturador } from './captura.js';
import { acharETrocar } from './edicao.js';
import type { Alvo, Versionador } from './git.js';
import type { GerenciadorPreview } from './preview.js';
import { portaValida, proxiarHttp, proxiarWs, rotaDePreview } from './proxy.js';
import { SCRIPT_PREVIEW } from './script-preview.js';
import type { Terminais } from './terminal.js';

export type ContextoTrabalho = {
  config: Config;
  repo: Repo;
  orq: Orquestrador;
  versionador: Versionador;
  preview: GerenciadorPreview;
  capturador: Capturador;
  terminais: Terminais;
  emitir: (s: Saida) => void;
};

type Q = Record<string, string | undefined>;

export function registrarRotasTrabalho(app: FastifyInstance, ctx: ContextoTrabalho): void {
  const { config, repo, orq, versionador, preview, capturador, terminais } = ctx;
  const dados = caminhosDados(config);
  const proibidas = [config.porta, 7001, 7100];

  // ---------- alvo: projeto ou conversa solta ----------
  function alvoDe(q: Q): (Alvo & { nome: string; projetoId: number | null }) | null {
    if (q.projeto) {
      const p = repo.obterProjeto(Number(q.projeto));
      if (p) return { chave: `p${p.id}`, pasta: p.pasta, nome: p.nome, projetoId: p.id };
    }
    if (q.conversa) {
      const c = repo.obterConversa(Number(q.conversa));
      if (c) {
        if (c.projetoId) {
          const p = repo.obterProjeto(c.projetoId);
          if (p) return { chave: `p${p.id}`, pasta: p.pasta, nome: p.nome, projetoId: p.id };
        }
        return { chave: `c${c.id}`, pasta: orq.pastaDaConversa(c), nome: c.titulo, projetoId: null };
      }
    }
    return null;
  }
  function exigirAlvo(q: Q, reply: FastifyReply) {
    const a = alvoDe(q);
    if (!a) reply.code(404).send({ erro: 'abra uma conversa ou um projeto primeiro' });
    return a;
  }
  const corpoQ = (req: FastifyRequest): Q => ({ ...((req.query ?? {}) as Q), ...((req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : {}) as Q) });
  const pastaCapturas = (chave: string) => join(dados.versoes, chave);

  // ---------- proxy do preview ----------
  // pedidos do preview (/preview/N/..., ou recursos que a pagina pediu na raiz) saem daqui antes de qualquer rota
  app.addHook('onRequest', async (req, reply) => {
    if (String(req.headers.upgrade ?? '').toLowerCase() === 'websocket') return; // o WebSocket tem rota propria
    const rota = rotaDePreview(req.raw, { webRaiz: config.web, proibidas });
    if (!rota) return;
    if (rota.redirecionar) return reply.redirect(rota.redirecionar, 302);
    reply.hijack();
    proxiarHttp(req.raw, reply.raw, rota);
  });

  for (const url of ['/preview/:porta', '/preview/:porta/*']) {
    app.route({
      method: 'GET',
      url,
      handler: async (_req, reply) => reply.code(404).send({ erro: 'porta inválida' }), // o gancho acima ja respondeu se a porta e valida
      wsHandler: (socket, req) => {
        const rota = rotaDePreview(req.raw, { webRaiz: config.web, proibidas });
        if (!rota) return socket.close(1008, 'porta inválida');
        proxiarWs(socket, req.raw, rota.porta, rota.caminho);
      },
    });
  }

  app.get('/api/preview/hrzz-preview.js', async (_req, reply) => {
    reply.header('content-type', 'text/javascript; charset=utf-8').header('cache-control', 'no-cache');
    return SCRIPT_PREVIEW;
  });

  // ---------- estado e servidor de dev ----------
  async function resumo(a: Alvo & { nome: string; projetoId: number | null }) {
    const [versoes, pontos] = await Promise.all([versionador.listarVersoes(a), versionador.listarPontos(a)]);
    return { alvo: { chave: a.chave, nome: a.nome, projetoId: a.projetoId }, preview: preview.estado(a.chave, a.pasta), versoes, podeDesfazer: pontos.length > 0 };
  }

  app.get('/api/preview/estado', async (req, reply) => {
    const a = exigirAlvo(req.query as Q, reply);
    return a ? resumo(a) : undefined;
  });

  app.post('/api/preview/iniciar', async (req, reply) => {
    if (veioDaCloudflare(req)) return reply.code(403).send({ erro: 'subir servidor de projeto fica bloqueado por esse caminho de acesso' });
    const q = corpoQ(req);
    const a = exigirAlvo(q, reply);
    if (!a) return;
    const como = q.como === 'npm' || q.como === 'estatico' ? q.como : undefined;
    try {
      await preview.iniciar(a.chave, a.pasta, como);
    } catch (e) {
      return reply.code(400).send({ erro: (e as Error).message });
    }
    return resumo(a);
  });

  app.post('/api/preview/porta', async (req, reply) => {
    if (veioDaCloudflare(req)) return reply.code(403).send({ erro: 'bloqueado por esse caminho de acesso' });
    const q = corpoQ(req);
    const a = exigirAlvo(q, reply);
    if (!a) return;
    const porta = portaValida(q.porta, proibidas);
    if (!porta) return reply.code(400).send({ erro: 'porta inválida (use de 1024 a 65535, e não a do próprio HRZZ)' });
    try {
      await preview.usarPorta(a.chave, porta);
    } catch (e) {
      return reply.code(400).send({ erro: (e as Error).message });
    }
    return resumo(a);
  });

  app.post('/api/preview/parar', async (req, reply) => {
    const a = exigirAlvo(corpoQ(req), reply);
    if (!a) return;
    preview.parar(a.chave);
    return resumo(a);
  });

  // ---------- versoes e desfazer ----------
  app.get('/api/versoes', async (req, reply) => {
    const a = exigirAlvo(req.query as Q, reply);
    return a ? await versionador.listarVersoes(a) : undefined;
  });

  app.post('/api/versoes', async (req, reply) => {
    const q = corpoQ(req);
    const a = exigirAlvo(q, reply);
    if (!a) return;
    try {
      const r = await versionador.salvarVersao(a, String(q.nome ?? ''));
      let captura = false;
      const porta = preview.portaDe(a.chave);
      if (porta && !r.igual) {
        try {
          await capturador.capturarPara(join(pastaCapturas(a.chave), `v${r.versao.n}.png`), porta);
          captura = true;
        } catch {
          /* sem navegador de captura: a versao fica salva mesmo assim */
        }
      }
      return { ...r, captura, versoes: await versionador.listarVersoes(a) };
    } catch (e) {
      return reply.code(500).send({ erro: (e as Error).message });
    }
  });

  app.post('/api/versoes/restaurar', async (req, reply) => {
    const q = corpoQ(req);
    const a = exigirAlvo(q, reply);
    if (!a) return;
    try {
      const r = await versionador.restaurarVersao(a, Number(q.n));
      if (!r.ok) return reply.code(404).send({ erro: r.mensagem });
      ctx.emitir({ tipo: 'preview_atualizado', chave: a.chave, motivo: 'versao', conversa: q.conversa ? Number(q.conversa) : undefined });
      return { ...r, ...(await resumo(a)) };
    } catch (e) {
      return reply.code(500).send({ erro: (e as Error).message });
    }
  });

  app.post('/api/desfazer', async (req, reply) => {
    const q = corpoQ(req);
    const a = exigirAlvo(q, reply);
    if (!a) return;
    try {
      const r = await versionador.desfazer(a);
      if (r.ok) ctx.emitir({ tipo: 'preview_atualizado', chave: a.chave, motivo: 'desfazer', conversa: q.conversa ? Number(q.conversa) : undefined });
      return { ...r, ...(await resumo(a)) };
    } catch (e) {
      return reply.code(500).send({ erro: (e as Error).message });
    }
  });

  // ---------- capturas (antes/depois) ----------
  app.get('/api/preview/captura', async (req, reply) => {
    const q = req.query as Q;
    const a = exigirAlvo(q, reply);
    if (!a) return;
    const ref = q.ref ?? 'agora';
    reply.header('cache-control', 'no-store').header('content-type', 'image/png');
    if (ref === 'agora') {
      const porta = preview.portaDe(a.chave);
      if (!porta) return reply.code(409).header('content-type', 'application/json').send({ erro: 'o preview não está rodando' });
      try {
        return await capturador.capturar(porta, { largura: Number(q.largura) || 1280, altura: Number(q.altura) || 800, caminho: q.caminho });
      } catch (e) {
        return reply.code(500).header('content-type', 'application/json').send({ erro: (e as Error).message });
      }
    }
    let arquivo: string | null = null;
    if (/^v\d+$/.test(ref)) arquivo = join(pastaCapturas(a.chave), `${ref}.png`);
    else if (ref === 'ultimo') {
      for (const p of await versionador.listarPontos(a)) {
        const f = join(pastaCapturas(a.chave), `ponto-${p.seq}.png`);
        if (existsSync(f)) {
          arquivo = f;
          break;
        }
      }
    }
    if (!arquivo || !existsSync(arquivo)) return reply.code(404).header('content-type', 'application/json').send({ erro: 'essa versão não tem captura (o preview estava desligado quando foi salva)' });
    return reply.send(createReadStream(arquivo));
  });

  // ---------- editar texto direto no arquivo ----------
  app.post('/api/preview/editar-texto', async (req, reply) => {
    const q = corpoQ(req);
    const a = exigirAlvo(q, reply);
    if (!a) return;
    const r = await acharETrocar(a.pasta, String(q.antes ?? ''), String(q.depois ?? ''), async () => {
      await versionador.criarPonto(a, 'antes de editar um texto no preview');
    });
    if (r.ok) ctx.emitir({ tipo: 'preview_atualizado', chave: a.chave, motivo: 'texto', conversa: q.conversa ? Number(q.conversa) : undefined });
    return r;
  });

  // ---------- rabisco: desenho + captura da pagina viram um anexo da proxima mensagem ----------
  app.post('/api/preview/rabisco', async (req, reply) => {
    const q = req.query as Q;
    const a = exigirAlvo(q, reply);
    if (!a) return;
    const desenho = req.body;
    if (!Buffer.isBuffer(desenho) || desenho.length === 0) return reply.code(400).send({ erro: 'desenho vazio' });
    const pasta = join(dados.anexos, new Date().toISOString().slice(0, 10));
    mkdirSync(pasta, { recursive: true });
    const nome = `rabisco-${randomBytes(3).toString('hex')}.png`;
    const caminho = join(pasta, nome);
    const porta = preview.portaDe(a.chave);
    let png: Buffer = desenho;
    let comPagina = false;
    if (porta) {
      try {
        png = await capturador.capturar(porta, { largura: Number(q.largura) || 1280, altura: Number(q.altura) || 800, caminho: q.caminho, rolagem: Number(q.rolagem) || 0, rabisco: desenho });
        comPagina = true;
      } catch {
        /* sem captura: o desenho vai sozinho */
      }
    }
    writeFileSync(caminho, png);
    return { nome, caminho, tipo: 'imagem', tamanho: png.length, comPagina };
  });

  // ---------- arquivos ----------
  function raizDe(id: string | undefined): string | null {
    if (!id) return null;
    if (id === 'a') return dados.anexos;
    if (id === 't') return dados.transcricoes;
    const [tipo, n] = id.split(':');
    if (tipo === 'p') return repo.obterProjeto(Number(n))?.pasta ?? null;
    if (tipo === 'c') {
      const c = repo.obterConversa(Number(n));
      return c ? orq.pastaDaConversa(c) : null;
    }
    return null;
  }
  function erroDeCaminho(e: unknown, reply: FastifyReply) {
    if (e instanceof CaminhoInvalido) return reply.code(403).send({ erro: e.message });
    const cod = (e as NodeJS.ErrnoException).code;
    if (cod === 'ENOENT' || cod === 'ENOTDIR') return reply.code(404).send({ erro: 'não achei esse arquivo' });
    return reply.code(500).send({ erro: (e as Error).message });
  }

  app.get('/api/arquivos', async (req, reply) => {
    const q = req.query as Q;
    const raiz = raizDe(q.raiz);
    if (!raiz) return reply.code(404).send({ erro: 'pasta não encontrada' });
    try {
      return await listarPasta(raiz, q.caminho ?? '');
    } catch (e) {
      return erroDeCaminho(e, reply);
    }
  });

  app.get('/api/arquivos/previa', async (req, reply) => {
    const q = req.query as Q;
    const raiz = raizDe(q.raiz);
    if (!raiz) return reply.code(404).send({ erro: 'pasta não encontrada' });
    try {
      return await previa(raiz, q.caminho ?? '');
    } catch (e) {
      return erroDeCaminho(e, reply);
    }
  });

  // arquivo cru (imagem, pdf, download). Tudo que o navegador poderia executar (html, svg) vai com sandbox.
  app.get('/api/arquivos/baixar', async (req, reply) => {
    const q = req.query as Q;
    const raiz = raizDe(q.raiz);
    if (!raiz) return reply.code(404).send({ erro: 'pasta não encontrada' });
    try {
      const arq = caminhoSeguro(raiz, q.caminho ?? '');
      if (!statSync(arq).isFile()) return reply.code(400).send({ erro: 'isso não é um arquivo' });
      const ext = basename(arq).split('.').pop()?.toLowerCase() ?? '';
      const tipo = CONTENT_TYPE[ext] ?? 'application/octet-stream';
      const inline = q.baixar !== '1' && !!CONTENT_TYPE[ext];
      reply
        .header('content-type', tipo)
        .header('content-disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(basename(arq))}`)
        .header('content-security-policy', 'sandbox; default-src \'none\'; img-src data:; style-src \'unsafe-inline\'')
        .header('x-content-type-options', 'nosniff')
        .header('cache-control', 'no-cache');
      // html e svg abertos direto poderiam rodar script com o cookie do HRZZ: vao num sandbox sem script
      if (ext === 'html' || ext === 'htm' || ext === 'svg') reply.header('content-security-policy', "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'");
      return reply.send(createReadStream(arq));
    } catch (e) {
      return erroDeCaminho(e, reply);
    }
  });

  // ---------- galeria ----------
  let cacheGaleria: { em: number; itens: GaleriaItem[] } | null = null;
  type GaleriaItem = Achado & { raiz: string; origem: string };

  async function montarGaleria(): Promise<GaleriaItem[]> {
    const raizes: { id: string; pasta: string; origem: string }[] = [];
    const vistas = new Set<string>();
    for (const p of repo.listarProjetos()) {
      raizes.push({ id: `p:${p.id}`, pasta: p.pasta, origem: p.nome });
      vistas.add(p.pasta.toLowerCase());
    }
    raizes.push({ id: 'a', pasta: dados.anexos, origem: 'anexos' });
    for (const c of repo.listarConversas()) {
      if (c.projetoId) continue;
      const pasta = join(config.dados, 'projetos', '_soltas', String(c.id));
      if (existsSync(pasta) && !vistas.has(pasta.toLowerCase())) raizes.push({ id: `c:${c.id}`, pasta, origem: c.titulo });
    }
    const itens: GaleriaItem[] = [];
    // transcricoes salvas: so o .txt de cada uma, com o titulo no lugar do nome do arquivo
    if (existsSync(dados.transcricoes)) {
      const titulos = new Map(listarSalvas(dados.transcricoes).map((t) => [`${t.id}.txt`, t.titulo]));
      const txts = await varrer(dados.transcricoes, { profundidade: 1, max: 400, filtro: (n) => n.endsWith('.txt') });
      for (const x of txts) itens.push({ ...x, nome: titulos.get(x.nome) ?? x.nome, raiz: 't', origem: 'transcrições' });
    }
    for (const r of raizes) {
      if (!existsSync(r.pasta)) continue;
      const achados = await varrer(r.pasta, { profundidade: 5, max: 400, filtro: (_n, t) => t !== 'codigo' && t !== 'texto' && t !== 'outro' });
      for (const x of achados) itens.push({ ...x, raiz: r.id, origem: r.origem });
    }
    return itens.sort((x, y) => y.mtime - x.mtime).slice(0, 800);
  }

  app.get('/api/galeria', async (req) => {
    const fresco = (req.query as Q).atualizar === '1';
    if (!cacheGaleria || fresco || Date.now() - cacheGaleria.em > 8000) cacheGaleria = { em: Date.now(), itens: await montarGaleria() };
    return cacheGaleria.itens;
  });

  // ---------- terminal ----------
  app.get('/api/term', { websocket: true }, async (socket, req) => {
    if (veioDaCloudflare(req)) {
      socket.send(JSON.stringify({ t: 'o', d: '\r\nterminal bloqueado por esse caminho de acesso.\r\n' }));
      return socket.close();
    }
    const q = req.query as Q;
    const a = alvoDe(q);
    if (!a) {
      socket.send(JSON.stringify({ t: 'o', d: '\r\nabra uma conversa ou um projeto primeiro.\r\n' }));
      return socket.close();
    }
    const cols = Math.min(Math.max(Number(q.cols) || 80, 10), 400);
    const rows = Math.min(Math.max(Number(q.rows) || 24, 3), 200);
    try {
      await terminais.anexar(a.chave, a.pasta, socket, { cols, rows });
    } catch (e) {
      socket.send(JSON.stringify({ t: 'o', d: `\r\nnão consegui abrir o terminal: ${(e as Error).message}\r\n` }));
      socket.close();
    }
  });
}

