// Rotas do acervo (etapa 4): memoria, skills, comandos salvos e modelos de projeto.
// O PIN ja e exigido pelo gancho de rotas.ts (tudo em /api/ menos saude e auth).
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { caminhosDados, type Config } from '../config.js';
import type { Repo } from '../repo.js';
import { LIMITE_MEMORIA_PROMPT, apagarArquivoMemoria, gravarArquivoMemoria, importarMemoria, lerArquivoMemoria, listarMemoria, nomeMemoriaValido, slugMemoria, tamanhoTotalMemoria } from './memoria.js';
import { apagarSkillHrzz, descobrirSkills, gravarSkillHrzz, lerSkillHrzz, nomeSkillValido } from './skills.js';
import { apagarComando, gravarComando, garantirComandos, lerComando, listarComandos, nomeComandoValido } from './comandos.js';
import { MODELOS_PROJETO, criarArquivosEm, criarPastaDoModelo, modeloPorId } from './modelos-projeto.js';

type Corpo = Record<string, unknown>;

export function registrarRotasAcervo(app: FastifyInstance, ctx: { config: Config; repo: Repo }): void {
  const { config, repo } = ctx;
  const dados = caminhosDados(config);
  garantirComandos(dados.comandos);

  const texto = (v: unknown) => (typeof v === 'string' ? v : '');
  const erro400 = (e: unknown) => ({ erro: (e as Error).message });

  // ---------- memoria ----------
  app.get('/api/memoria', async () => ({ arquivos: listarMemoria(dados.memoria), total: tamanhoTotalMemoria(dados.memoria), limite: LIMITE_MEMORIA_PROMPT }));

  app.get('/api/memoria/arquivo', async (req, reply) => {
    const nome = (req.query as { nome?: string }).nome;
    const conteudo = nomeMemoriaValido(nome) ? lerArquivoMemoria(dados.memoria, nome) : null;
    if (conteudo === null) return reply.code(404).send({ erro: 'arquivo não encontrado' });
    return { nome, conteudo };
  });

  app.put('/api/memoria/arquivo', async (req, reply) => {
    const c = (req.body ?? {}) as Corpo;
    try {
      if (!nomeMemoriaValido(c.nome)) throw new Error('nome inválido: use letras, números, - e _ (e / pra subpasta)');
      gravarArquivoMemoria(dados.memoria, c.nome, texto(c.conteudo));
      return { ok: true, nome: c.nome };
    } catch (e) {
      return reply.code(400).send(erro400(e));
    }
  });

  app.delete('/api/memoria/arquivo', async (req, reply) => {
    const nome = (req.query as { nome?: string }).nome;
    if (!nomeMemoriaValido(nome) || !apagarArquivoMemoria(dados.memoria, nome)) return reply.code(404).send({ erro: 'arquivo não encontrado' });
    return { ok: true };
  });

  app.post('/api/memoria/importar', async (req, reply) => {
    const c = (req.body ?? {}) as Corpo;
    try {
      const criados = importarMemoria(dados.memoria, texto(c.texto), c.dividir !== false);
      return { ok: true, criados };
    } catch (e) {
      return reply.code(400).send(erro400(e));
    }
  });

  // ---------- skills ----------
  // escopo: id do projeto; 0 = conversas sem projeto
  const escopoDe = (v: unknown): number | null => {
    const n = v === undefined || v === '' || v === null ? 0 : Number(v);
    if (!Number.isInteger(n) || n < 0) return null;
    return n === 0 || repo.obterProjeto(n) ? n : null;
  };

  app.get('/api/skills', async (req, reply) => {
    const escopo = escopoDe((req.query as { projeto?: string }).projeto);
    if (escopo === null) return reply.code(404).send({ erro: 'projeto não encontrado' });
    const desligadas = new Set(repo.skillsDesligadas(escopo));
    const skills = descobrirSkills(dados.skills, config.claudeHome).map(({ caminho: _caminho, ...s }) => ({ ...s, ligada: !desligadas.has(s.chave) }));
    return { escopo, skills };
  });

  app.put('/api/skills/ligada', async (req, reply) => {
    const c = (req.body ?? {}) as Corpo;
    const escopo = escopoDe(c.projeto);
    if (escopo === null) return reply.code(404).send({ erro: 'projeto não encontrado' });
    const chave = texto(c.chave);
    if (!descobrirSkills(dados.skills, config.claudeHome).some((s) => s.chave === chave)) return reply.code(404).send({ erro: 'skill não encontrada' });
    repo.ligarSkill(escopo, chave, c.ligada !== false);
    return { ok: true };
  });

  app.get('/api/skills/hrzz/:nome', async (req, reply) => {
    const s = lerSkillHrzz(dados.skills, (req.params as { nome: string }).nome);
    return s ?? reply.code(404).send({ erro: 'skill não encontrada' });
  });

  app.put('/api/skills/hrzz/:nome', async (req, reply) => {
    const nome = (req.params as { nome: string }).nome;
    const c = (req.body ?? {}) as Corpo;
    try {
      if (!nomeSkillValido(nome)) throw new Error('nome inválido: use letras minúsculas, números e -');
      gravarSkillHrzz(dados.skills, nome, texto(c.descricao), texto(c.instrucoes));
      return { ok: true, chave: `hrzz-skills:${nome}` };
    } catch (e) {
      return reply.code(400).send(erro400(e));
    }
  });

  app.delete('/api/skills/hrzz/:nome', async (req, reply) => {
    const nome = (req.params as { nome: string }).nome;
    if (!apagarSkillHrzz(dados.skills, nome)) return reply.code(404).send({ erro: 'skill não encontrada' });
    for (const p of [0, ...repo.listarProjetos().map((x) => x.id)]) repo.ligarSkill(p, `hrzz-skills:${nome}`, true);
    return { ok: true };
  });

  // ---------- comandos salvos ----------
  app.get('/api/comandos', async () => listarComandos(dados.comandos));

  app.get('/api/comandos/:nome', async (req, reply) => {
    const c = lerComando(dados.comandos, (req.params as { nome: string }).nome);
    return c ?? reply.code(404).send({ erro: 'comando não encontrado' });
  });

  app.put('/api/comandos/:nome', async (req, reply) => {
    const nome = (req.params as { nome: string }).nome;
    const c = (req.body ?? {}) as Corpo;
    try {
      if (!nomeComandoValido(nome)) throw new Error('nome inválido: use letras minúsculas, números e - (e não use "ata")');
      gravarComando(dados.comandos, nome, texto(c.descricao), texto(c.corpo));
      return { ok: true };
    } catch (e) {
      return reply.code(400).send(erro400(e));
    }
  });

  app.delete('/api/comandos/:nome', async (req, reply) => {
    if (!apagarComando(dados.comandos, (req.params as { nome: string }).nome)) return reply.code(404).send({ erro: 'comando não encontrado' });
    return { ok: true };
  });

  // ---------- modelos de projeto ----------
  app.get('/api/modelos-projeto', async () => MODELOS_PROJETO.map(({ id, nome, descricao }) => ({ id, nome, descricao })));

  app.post('/api/modelos-projeto/:id/criar', async (req, reply) => {
    const modelo = modeloPorId((req.params as { id: string }).id);
    if (!modelo) return reply.code(404).send({ erro: 'modelo não encontrado' });
    const c = (req.body ?? {}) as Corpo;
    const nome = texto(c.nome).trim();
    if (!nome) return reply.code(400).send({ erro: 'dê um nome ao projeto' });
    let pasta: string;
    const pedida = texto(c.pasta).trim();
    if (pedida) {
      // pasta que o Joao escolheu: precisa existir e nao ter ja o arquivo do modelo (nada e sobrescrito)
      pasta = resolve(pedida);
      if (!existsSync(pasta) || !statSync(pasta).isDirectory()) return reply.code(400).send({ erro: `a pasta não existe: ${pasta}` });
      for (const arq of Object.keys(modelo.arquivos)) {
        if (existsSync(join(pasta, arq))) return reply.code(400).send({ erro: `a pasta já tem ${arq}. Escolha outra pasta ou deixe em branco.` });
      }
      criarArquivosEm(pasta, modelo);
    } else {
      pasta = criarPastaDoModelo(join(config.dados, 'projetos'), slugMemoria(nome), modelo);
    }
    const projeto = repo.criarProjeto(nome, pasta);
    return { projeto, pedido: modelo.pedido };
  });
}
