// Rotas /api/transcricao/*: repassam pro servico Python (depois do PIN, que o gancho de rotas.ts ja confere).
// Em fluxo, sem guardar o arquivo na memoria: um video grande passa direto.
import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import type { Config } from '../config.js';
import { caminhosDados } from '../config.js';
import { comoAnexo, idValido, listarSalvas, SUGESTOES } from './ata.js';
import type { Transcritor } from './servico.js';

export const TIPO_MIDIA = 'application/x-hrzz-midia';
const LIMITE_MIDIA = 6 * 1024 * 1024 * 1024; // 6 GB

// so estas rotas do servico Python ficam abertas pela interface
const PERMITIDAS: { metodo: string; re: RegExp }[] = [
  { metodo: 'GET', re: /^\/(saude|modelos|fontes|tarefas|transcricoes)$/ },
  { metodo: 'GET', re: /^\/tarefas\/[a-f0-9]{6,16}$/ },
  { metodo: 'POST', re: /^\/tarefas\/[a-f0-9]{6,16}\/cancelar$/ },
  { metodo: 'POST', re: /^\/(arquivo|youtube|ditado)$/ },
  { metodo: 'GET', re: /^\/transcricoes\/[a-z0-9-]+\.(txt|srt|json)$/ },
  { metodo: 'PATCH', re: /^\/transcricoes\/[a-z0-9-]+$/ },
  { metodo: 'DELETE', re: /^\/transcricoes\/[a-z0-9-]+$/ },
  { metodo: 'POST', re: /^\/transcricoes\/[a-z0-9-]+\/refazer$/ },
];

export function registrarRotasTranscricao(app: FastifyInstance, ctx: { config: Config; transcritor: Transcritor }): void {
  const { config, transcritor } = ctx;
  const dados = caminhosDados(config);

  // o corpo do arquivo chega como fluxo (nao e lido aqui)
  app.addContentTypeParser(TIPO_MIDIA, (_req, payload, feito) => feito(null, payload));

  // ---------- coisas que o proprio servidor resolve (nao dependem do Python estar no ar) ----------
  app.get('/api/transcricao/estado', async () => {
    const ligado = await transcritor.ligado();
    let saude: unknown = null;
    if (ligado) {
      try {
        saude = await transcritor.json('/saude');
      } catch {
        /* sem detalhes */
      }
    }
    return { ligado, saude, salvas: listarSalvas(dados.transcricoes).length };
  });

  app.post('/api/transcricao/transcricoes/:id/chat', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!idValido(id)) return reply.code(400).send({ erro: 'transcrição inválida' });
    const anexo = comoAnexo(dados.transcricoes, dados.anexos, id);
    if (!anexo) return reply.code(404).send({ erro: 'não achei o texto dessa transcrição' });
    return { anexo: { nome: `${anexo.titulo}.txt`, caminho: anexo.caminho, tipo: anexo.tipo }, titulo: anexo.titulo, sugestoes: SUGESTOES };
  });

  // ---------- repasse pro servico ----------
  app.all('/api/transcricao/*', async (req, reply) => {
    const resto = '/' + (req.params as Record<string, string>)['*'];
    const metodo = req.method.toUpperCase();
    if (!PERMITIDAS.some((p) => p.metodo === metodo && p.re.test(resto))) return reply.code(404).send({ erro: 'rota não encontrada' });

    const consulta = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const cabecalhos: Record<string, string> = {};
    let corpo: BodyInit | undefined;
    if (metodo === 'POST' || metodo === 'PATCH') {
      const tipo = String(req.headers['content-type'] ?? '');
      if (tipo.startsWith(TIPO_MIDIA)) {
        const tam = Number(req.headers['content-length'] ?? 0);
        if (tam > LIMITE_MIDIA) return reply.code(413).send({ erro: 'arquivo grande demais (limite de 6 GB)' });
        cabecalhos['content-type'] = 'application/octet-stream';
        if (tam) cabecalhos['content-length'] = String(tam);
        corpo = Readable.toWeb(req.body as Readable) as unknown as BodyInit;
      } else if (req.body !== undefined && req.body !== null) {
        cabecalhos['content-type'] = 'application/json';
        corpo = JSON.stringify(req.body);
      }
    }
    let r: Response;
    try {
      const init: RequestInit & { duplex?: 'half' } = { method: metodo, headers: transcritor.cabecalhos(cabecalhos), body: corpo };
      if (corpo && typeof corpo !== 'string') init.duplex = 'half';
      r = await fetch(transcritor.url + resto + consulta, init);
    } catch {
      return reply.code(503).send({ erro: 'o transcritor não está rodando. Ele sobe junto com o HRZZ (npm run dev ou o vigia); veja dados/logs/transcritor.log.' });
    }
    // o servico pode responder antes de ler o arquivo inteiro (ex.: idioma invalido): descarta o resto do envio,
    // senao a conexao de quem esta enviando e derrubada
    if (corpo && typeof corpo !== 'string') (req.body as Readable).resume();
    reply.code(r.status);
    for (const h of ['content-type', 'content-disposition']) {
      const v = r.headers.get(h);
      if (v) reply.header(h, v);
    }
    if (!r.body) return reply.send();
    return reply.send(Readable.fromWeb(r.body as never));
  });

  // ---------- ao vivo: o navegador manda audio, o servico devolve texto ----------
  app.get('/api/transcricao/ao-vivo', { websocket: true }, (socket, req) => {
    const consulta = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const falar = (m: object) => socket.readyState === 1 && socket.send(JSON.stringify(m));
    const para = new WebSocket(transcritor.urlWs + '/ao-vivo' + consulta, { headers: transcritor.cabecalhos() });
    const espera: { dado: WebSocket.RawData; binario: boolean }[] = [];
    let aberto = false;
    para.on('open', () => {
      aberto = true;
      for (const e of espera.splice(0)) para.send(e.dado, { binary: e.binario });
    });
    para.on('message', (dado, binario) => {
      if (socket.readyState === 1) socket.send(dado, { binary: binario });
    });
    para.on('close', () => socket.readyState === 1 && socket.close());
    para.on('error', () => {
      falar({ tipo: 'erro', texto: 'o transcritor não está rodando.' });
      socket.close();
    });
    socket.on('message', (dado: WebSocket.RawData, binario: boolean) => {
      if (aberto) para.send(dado, { binary: binario });
      else espera.push({ dado, binario });
    });
    socket.on('close', () => {
      // se o navegador sumiu sem avisar, pede pra salvar o que ja tem
      if (para.readyState === WebSocket.OPEN) para.send('parar');
      else if (para.readyState === WebSocket.CONNECTING) para.terminate();
    });
  });
}
