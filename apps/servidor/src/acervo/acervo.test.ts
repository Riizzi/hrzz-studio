import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { construirApp } from '../app.js';
import { lerConfig } from '../config.js';
import { abrirBanco } from '../db.js';
import { montarArgsClaude } from '../ia/claude.js';
import { garantirMemoria, lerMemoria, montarPromptSistema } from '../ia/prompt.js';
import { LeitorDeFluxo } from '../ia/stream.js';
import type { Evento, OpcoesTurno } from '../ia/tipos.js';
import { apagarArquivoMemoria, gravarArquivoMemoria, importarMemoria, listarMemoria, nomeMemoriaValido } from './memoria.js';
import { descobrirSkills, gravarSkillHrzz, lerCabecalho, prepararPluginSkills, regrasSkillsDesligadas } from './skills.js';
import { expandirComando, garantirComandos, gravarComando, listarComandos } from './comandos.js';

const temp = () => mkdtempSync(join(tmpdir(), 'hrzz-acervo-'));

// ---------- memoria ----------
test('memoria: nomes validos e invalidos', () => {
  assert.ok(nomeMemoriaValido('perfil'));
  assert.ok(nomeMemoriaValido('areas/bhz-optica-site'));
  assert.ok(nomeMemoriaValido('preferências'));
  for (const ruim of ['', '../fora', 'a/../b', '/abs', 'a//b', 'a.b', 'a/b/c/d', 'x y', 'a\\b']) assert.ok(!nomeMemoriaValido(ruim), ruim);
});

test('memoria: grava, lista com subpastas, apaga e remove a subpasta vazia', () => {
  const pasta = temp();
  gravarArquivoMemoria(pasta, 'perfil', 'sou o João');
  gravarArquivoMemoria(pasta, 'areas/hrzz', 'app pessoal');
  assert.deepEqual(listarMemoria(pasta).map((a) => a.nome), ['areas/hrzz', 'perfil']);
  assert.ok(apagarArquivoMemoria(pasta, 'areas/hrzz'));
  assert.ok(!existsSync(join(pasta, 'areas')));
  assert.ok(!apagarArquivoMemoria(pasta, 'areas/hrzz'));
  assert.throws(() => gravarArquivoMemoria(pasta, '../fora', 'x'), /nome inválido/);
  assert.throws(() => gravarArquivoMemoria(pasta, 'grande', 'x'.repeat(201 * 1024)), /200 KB/);
  rmSync(pasta, { recursive: true, force: true });
});

test('memoria: a IA le tudo, inclusive subpastas', () => {
  const pasta = temp();
  garantirMemoria(pasta);
  gravarArquivoMemoria(pasta, 'areas/hrzz', 'o HRZZ usa Retro Ledger');
  const lida = lerMemoria(pasta);
  assert.match(lida, /### areas\/hrzz\.md/);
  assert.match(lida, /Retro Ledger/);
  assert.match(lida, /### preferencias\.md/);
  rmSync(pasta, { recursive: true, force: true });
});

test('memoria: importar do claude.ai divide por titulo, ou guarda inteiro', () => {
  const pasta = temp();
  const export1 = '## Work context\nAnalista técnico.\n\n## Personal context\nMora em BH.\n';
  const criados = importarMemoria(pasta, export1, true);
  assert.deepEqual(criados.sort(), ['claude-ai/personal-context', 'claude-ai/work-context']);
  assert.match(readFileSync(join(pasta, 'claude-ai', 'work-context.md'), 'utf8'), /Analista técnico/);
  // sem titulos: um arquivo so; de novo: nao sobrescreve
  assert.deepEqual(importarMemoria(pasta, 'só um parágrafo', true), ['claude-ai']);
  assert.deepEqual(importarMemoria(pasta, 'outro texto', false), ['claude-ai-2']);
  assert.throws(() => importarMemoria(pasta, '   ', true), /vazio/);
  rmSync(pasta, { recursive: true, force: true });
});

// ---------- skills ----------
function criarSkill(dir: string, nome: string, descricao: string, extra = '') {
  mkdirSync(join(dir, nome), { recursive: true });
  writeFileSync(join(dir, nome, 'SKILL.md'), `---\nname: ${nome}\ndescription: ${descricao}\n${extra}---\n\nfaça ${nome}\n`);
}

function ambienteClaude() {
  const home = temp();
  const sync = join(home, 'skills', 'synced', 'abc_def');
  criarSkill(sync, 'docx', '"Use para Word (docx)"');
  criarSkill(sync, 'estilo-joao-pedro', 'Estilo de texto do João');
  writeFileSync(join(sync, 'manifest.json'), JSON.stringify({ skills: [{ name: 'docx', source: 'anthropic' }, { name: 'estilo-joao-pedro', source: 'plugin' }] }));
  criarSkill(join(home, 'skills'), 'solta', 'Skill solta do usuário');
  const plug = join(home, 'plugins', 'synced', 'balde', 'id1');
  mkdirSync(join(plug, '.claude-plugin'), { recursive: true });
  writeFileSync(join(plug, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'humanizer' }));
  writeFileSync(join(plug, 'SKILL.md'), '---\nname: humanizer\ndescription: >\n  Tira marcas de IA\n  do texto\n---\ncorpo\n');
  // plugin sem plugin.json e ignorado
  mkdirSync(join(home, 'plugins', 'synced', 'balde', 'id2'), { recursive: true });
  writeFileSync(join(home, 'plugins', 'synced', 'balde', 'id2', 'SKILL.md'), '---\nname: fantasma\ndescription: x\n---\n');
  return home;
}

test('skills: cabecalho com aspas e bloco dobrado', () => {
  assert.equal(lerCabecalho('---\nname: a\ndescription: "oi: tudo"\n---\n').description, 'oi: tudo');
  assert.equal(lerCabecalho('---\ndescription: >\n  linha 1\n  linha 2\n---\n').description, 'linha 1 linha 2');
  assert.deepEqual(lerCabecalho('sem cabecalho'), {});
});

test('skills: descobre as do HRZZ, as soltas, as sincronizadas e as de plugin com o nome nativo certo', () => {
  const home = ambienteClaude();
  const dados = temp();
  gravarSkillHrzz(dados, 'minha-skill', 'Use quando eu disser banana', 'Responda BANANA.');
  const lista = descobrirSkills(dados, home);
  const por = new Map(lista.map((s) => [s.chave, s]));
  assert.deepEqual([...por.keys()].sort(), ['anthropic-skills:docx', 'anthropic-skills:estilo-joao-pedro', 'hrzz-skills:minha-skill', 'humanizer:humanizer', 'solta']);
  assert.equal(por.get('anthropic-skills:docx')!.origem, 'anthropic');
  assert.equal(por.get('anthropic-skills:docx')!.descricao, 'Use para Word (docx)');
  assert.equal(por.get('anthropic-skills:estilo-joao-pedro')!.origem, 'sua');
  assert.equal(por.get('humanizer:humanizer')!.descricao, 'Tira marcas de IA do texto');
  assert.ok(por.get('hrzz-skills:minha-skill')!.editavel);
  assert.ok(!por.get('anthropic-skills:docx')!.editavel);
  rmSync(home, { recursive: true, force: true });
  rmSync(dados, { recursive: true, force: true });
});

test('skills: plugin gerado so com as ligadas e so reescreve quando muda', () => {
  const skills = temp();
  const plugins = temp();
  criarSkill(skills, 'a', 'skill a');
  criarSkill(skills, 'b', 'skill b');
  const pasta = prepararPluginSkills(skills, plugins, 'escopo-0', ['hrzz-skills:b'])!;
  assert.ok(existsSync(join(pasta, 'skills', 'a', 'SKILL.md')));
  assert.ok(!existsSync(join(pasta, 'skills', 'b')));
  assert.equal(JSON.parse(readFileSync(join(pasta, '.claude-plugin', 'plugin.json'), 'utf8')).name, 'hrzz-skills');
  // sem mudanca: marca um arquivo extra e confere que nao foi refeito
  writeFileSync(join(pasta, 'marca.txt'), 'x');
  prepararPluginSkills(skills, plugins, 'escopo-0', ['hrzz-skills:b']);
  assert.ok(existsSync(join(pasta, 'marca.txt')));
  // ligando a b, refaz
  prepararPluginSkills(skills, plugins, 'escopo-0', []);
  assert.ok(existsSync(join(pasta, 'skills', 'b', 'SKILL.md')));
  assert.ok(!existsSync(join(pasta, 'marca.txt')));
  // tudo desligado: nenhum plugin
  assert.equal(prepararPluginSkills(skills, plugins, 'escopo-0', ['hrzz-skills:a', 'hrzz-skills:b']), undefined);
  assert.ok(!existsSync(pasta));
  assert.equal(prepararPluginSkills(join(skills, 'nao-existe'), plugins, 'escopo-1', []), undefined);
  rmSync(skills, { recursive: true, force: true });
  rmSync(plugins, { recursive: true, force: true });
});

test('skills: editar uma skill do HRZZ valida o nome e exige descricao e instrucoes', () => {
  const dados = temp();
  assert.throws(() => gravarSkillHrzz(dados, 'Nome Ruim', 'x', 'y'), /nome inválido/);
  assert.throws(() => gravarSkillHrzz(dados, 'ok', '', 'y'), /descrição/);
  assert.throws(() => gravarSkillHrzz(dados, 'ok', 'x', ' '), /instruções/);
  gravarSkillHrzz(dados, 'ok', 'quando usar: sempre', 'faça isso');
  const lista = descobrirSkills(dados, join(dados, 'sem-claude'));
  assert.equal(lista[0].descricao, 'quando usar: sempre');
  rmSync(dados, { recursive: true, force: true });
});

// ---------- comandos ----------
test('comandos: exemplos criados uma vez e expansao com {{texto}}', () => {
  const pasta = temp();
  garantirComandos(pasta);
  const nomes = listarComandos(pasta).map((c) => c.nome);
  assert.deepEqual(nomes, ['ata', 'grillme', 'revisar', 'site-loja']);
  assert.ok(listarComandos(pasta)[0].embutido);
  // apagado nao volta
  rmSync(join(pasta, 'grillme.md'));
  garantirComandos(pasta);
  assert.ok(!listarComandos(pasta).some((c) => c.nome === 'grillme'));

  const revisar = expandirComando('/revisar Segue o relatorio de ontem.', pasta)!;
  assert.match(revisar, /estilo-joao-pedro/);
  assert.match(revisar, /humanizer/);
  assert.match(revisar, /Segue o relatorio de ontem\.$/);
  assert.ok(!revisar.includes('{{texto}}'));

  gravarComando(pasta, 'resumo', 'resume', 'Resuma em 3 linhas.');
  assert.equal(expandirComando('/resumo', pasta), 'Resuma em 3 linhas.');
  assert.equal(expandirComando('/resumo texto longo', pasta), 'Resuma em 3 linhas.\n\ntexto longo');
  // nao e comando salvo: segue como veio
  assert.equal(expandirComando('/nao-existe oi', pasta), null);
  assert.equal(expandirComando('oi /resumo', pasta), null);
  assert.equal(expandirComando('/ata', pasta), null);
  assert.throws(() => gravarComando(pasta, 'ata', 'x', 'y'), /nome inválido/);
  assert.throws(() => gravarComando(pasta, '../x', 'x', 'y'), /nome inválido/);
  rmSync(pasta, { recursive: true, force: true });
});

// ---------- o que vai pro claude ----------
const base: OpcoesTurno = { motor: 'claude', mensagem: 'oi', cwd: '.', esforco: 1, pensar: 1, web: true, modo: 'mid', restrito: false, promptSistema: 'x', pastasExtras: [], liberadas: [] };

test('claude: plugin das skills e regras de skills desligadas entram nos argumentos', () => {
  const args = montarArgsClaude({ ...base, pluginDirs: ['C:/dados/skills-ativas/escopo-3'], bloqueadasExtra: regrasSkillsDesligadas(['anthropic-skills:docx']) });
  assert.equal(args[args.indexOf('--plugin-dir') + 1], 'C:/dados/skills-ativas/escopo-3');
  const bloqueadas = args.slice(args.indexOf('--disallowedTools') + 1);
  assert.ok(bloqueadas.includes('Skill(anthropic-skills:docx)'));
  assert.ok(bloqueadas.some((r) => r.startsWith('Bash(rm')), 'as regras de apagar continuam');
  const sem = montarArgsClaude(base);
  assert.ok(!sem.includes('--plugin-dir'));
  assert.ok(!sem.join(' ').includes('Skill('));
});

test('prompt: avisa quais skills estao desligadas', () => {
  const p = montarPromptSistema({ memoria: '', pensar: 1, nomeProjeto: 'bhz', skillsDesligadas: ['anthropic-skills:docx', 'humanizer:humanizer'] });
  assert.match(p, /neste projeto; não use: anthropic-skills:docx, humanizer:humanizer/);
  assert.ok(!montarPromptSistema({ memoria: '', pensar: 1 }).includes('desligou'));
});

test('stream: skill bloqueada de proposito nao vira pergunta de permissao', () => {
  const eventos: Evento[] = [];
  const leitor = new LeitorDeFluxo((e) => eventos.push(e), { cwd: '.', mostrarPensamento: true });
  leitor.linha(JSON.stringify({ type: 'system', subtype: 'init', session_id: 's1' }));
  leitor.linha(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Não posso usar essa skill.' }] } }));
  leitor.linha(
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      session_id: 's1',
      permission_denials: [{ tool_name: 'Skill', tool_input: { skill: 'anthropic-skills:docx' } }],
    }),
  );
  assert.ok(!eventos.some((e) => e.t === 'permissao'));
  assert.ok(!leitor.resultadoFinal().blocos.some((b) => b.tipo === 'permissao'));
});

// ---------- rotas ----------
async function appComPin() {
  const pasta = temp();
  const home = ambienteClaude();
  const config = lerConfig({ HRZZ_DADOS: pasta, HRZZ_WEB: join(pasta, 'sem-web'), HRZZ_CLAUDE_HOME: home });
  const app = await construirApp(config, { banco: abrirBanco(':memory:') });
  const def = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: '1234' } });
  const cookie = String(def.headers['set-cookie']).split(';')[0];
  const chama = (metodo: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, payload?: unknown) => app.inject({ method: metodo, url, headers: { cookie }, payload: payload as object | undefined });
  const fim = async () => {
    await app.close();
    rmSync(pasta, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  };
  return { app, chama, fim, pasta };
}

test('rotas do acervo: todas exigem o PIN', async () => {
  const { app, fim } = await appComPin();
  for (const url of ['/api/memoria', '/api/skills', '/api/comandos', '/api/modelos-projeto']) {
    assert.equal((await app.inject({ method: 'GET', url })).statusCode, 401, url);
  }
  assert.equal((await app.inject({ method: 'PUT', url: '/api/memoria/arquivo', payload: { nome: 'x', conteudo: 'y' } })).statusCode, 401);
  await fim();
});

test('rotas da memoria: criar, ler, editar, apagar, nome ruim e importar', async () => {
  const { chama, fim, pasta } = await appComPin();
  assert.equal((await chama('PUT', '/api/memoria/arquivo', { nome: 'areas/hrzz', conteudo: '# hrzz\nteste' })).statusCode, 200);
  const lida = (await chama('GET', '/api/memoria/arquivo?nome=areas%2Fhrzz')).json();
  assert.equal(lida.conteudo, '# hrzz\nteste');
  const lista = (await chama('GET', '/api/memoria')).json();
  assert.ok(lista.arquivos.some((a: { nome: string }) => a.nome === 'areas/hrzz'));
  assert.equal(lista.limite, 12000);
  assert.equal((await chama('PUT', '/api/memoria/arquivo', { nome: '../fora', conteudo: 'x' })).statusCode, 400);
  assert.equal((await chama('GET', '/api/memoria/arquivo?nome=..%2Fx')).statusCode, 404);
  assert.ok(!existsSync(join(pasta, 'fora.md')));
  const imp = (await chama('POST', '/api/memoria/importar', { texto: '## A\num\n\n## B\ndois', dividir: true })).json();
  assert.equal(imp.criados.length, 2);
  assert.equal((await chama('POST', '/api/memoria/importar', { texto: '' })).statusCode, 400);
  assert.equal((await chama('DELETE', '/api/memoria/arquivo?nome=areas%2Fhrzz')).statusCode, 200);
  assert.equal((await chama('DELETE', '/api/memoria/arquivo?nome=areas%2Fhrzz')).statusCode, 404);
  await fim();
});

test('rotas das skills: ligar e desligar por projeto, cada projeto na sua', async () => {
  const { chama, fim } = await appComPin();
  const projeto = (await chama('POST', '/api/projetos', { nome: 'loja' })).json();
  const ligada = async (escopo: number, chave: string) => {
    const r = (await chama('GET', `/api/skills?projeto=${escopo}`)).json();
    return r.skills.find((s: { chave: string }) => s.chave === chave).ligada;
  };
  assert.equal(await ligada(projeto.id, 'anthropic-skills:docx'), true);
  assert.equal((await chama('PUT', '/api/skills/ligada', { projeto: projeto.id, chave: 'anthropic-skills:docx', ligada: false })).statusCode, 200);
  assert.equal(await ligada(projeto.id, 'anthropic-skills:docx'), false);
  assert.equal(await ligada(0, 'anthropic-skills:docx'), true, 'o escopo geral nao muda');
  assert.equal((await chama('PUT', '/api/skills/ligada', { projeto: projeto.id, chave: 'anthropic-skills:docx', ligada: true })).statusCode, 200);
  assert.equal(await ligada(projeto.id, 'anthropic-skills:docx'), true);
  assert.equal((await chama('PUT', '/api/skills/ligada', { projeto: projeto.id, chave: 'nao-existe', ligada: false })).statusCode, 404);
  assert.equal((await chama('PUT', '/api/skills/ligada', { projeto: 999, chave: 'anthropic-skills:docx', ligada: false })).statusCode, 404);
  assert.equal((await chama('GET', '/api/skills?projeto=999')).statusCode, 404);
  // skill do HRZZ: criar, aparece editavel, apagar
  assert.equal((await chama('PUT', '/api/skills/hrzz/minha', { descricao: 'quando usar', instrucoes: 'faça' })).statusCode, 200);
  const r = (await chama('GET', '/api/skills')).json();
  assert.ok(r.skills.find((s: { chave: string; editavel: boolean }) => s.chave === 'hrzz-skills:minha')?.editavel);
  assert.equal((await chama('PUT', '/api/skills/hrzz/Ruim Nome', { descricao: 'x', instrucoes: 'y' })).statusCode, 400);
  assert.equal((await chama('DELETE', '/api/skills/hrzz/minha')).statusCode, 200);
  assert.equal((await chama('GET', '/api/skills/hrzz/minha')).statusCode, 404);
  await fim();
});

test('rotas dos comandos e dos modelos de projeto', async () => {
  const { chama, fim, pasta } = await appComPin();
  const lista = (await chama('GET', '/api/comandos')).json();
  assert.deepEqual(lista.map((c: { nome: string }) => c.nome), ['ata', 'grillme', 'revisar', 'site-loja']);
  assert.equal((await chama('PUT', '/api/comandos/ata', { descricao: 'x', corpo: 'y' })).statusCode, 400);
  assert.equal((await chama('PUT', '/api/comandos/novo', { descricao: 'x', corpo: '' })).statusCode, 400);
  assert.equal((await chama('PUT', '/api/comandos/novo', { descricao: 'x', corpo: 'faça {{texto}}' })).statusCode, 200);
  assert.equal((await chama('GET', '/api/comandos/novo')).json().corpo, 'faça {{texto}}');
  assert.equal((await chama('DELETE', '/api/comandos/novo')).statusCode, 200);

  const modelos = (await chama('GET', '/api/modelos-projeto')).json();
  assert.deepEqual(modelos.map((m: { id: string }) => m.id), ['site-loja', 'retro-ledger', 'relatorio']);
  assert.equal((await chama('POST', '/api/modelos-projeto/nao-existe/criar', { nome: 'x' })).statusCode, 404);
  assert.equal((await chama('POST', '/api/modelos-projeto/site-loja/criar', { nome: ' ' })).statusCode, 400);
  const criado = (await chama('POST', '/api/modelos-projeto/site-loja/criar', { nome: 'Ótica Nova' })).json();
  assert.match(criado.projeto.pasta, /otica-nova$/);
  assert.match(readFileSync(join(criado.projeto.pasta, 'CLAUDE.md'), 'utf8'), /sites-de-loja/);
  assert.match(criado.pedido, /\[nome da loja\]/);
  // de novo com o mesmo nome: pasta nova, a anterior intacta
  const outro = (await chama('POST', '/api/modelos-projeto/site-loja/criar', { nome: 'Ótica Nova' })).json();
  assert.match(outro.projeto.pasta, /otica-nova-2$/);
  // pasta do Joao: nao sobrescreve o CLAUDE.md que ja existe
  const minha = join(pasta, 'minha-pasta');
  mkdirSync(minha);
  writeFileSync(join(minha, 'CLAUDE.md'), 'meu');
  assert.equal((await chama('POST', '/api/modelos-projeto/relatorio/criar', { nome: 'r', pasta: minha })).statusCode, 400);
  assert.equal(readFileSync(join(minha, 'CLAUDE.md'), 'utf8'), 'meu');
  assert.equal((await chama('POST', '/api/modelos-projeto/relatorio/criar', { nome: 'r', pasta: join(pasta, 'nao-existe') })).statusCode, 400);
  await fim();
});
