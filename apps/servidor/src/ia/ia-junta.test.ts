// Testes unitarios da etapa 5 (IA junta): guardiao de cota, leitor de fluxo (limite e Gemini), dueto, servidor MCP,
// fila, cron, auditoria (parte sem navegador) e o banco (migracao e tarefas).
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { abrirBanco } from '../db.js';
import { Guardiao } from '../cota.js';
import { Repo } from '../repo.js';
import { proximaExecucao, validarCron } from '../fila.js';
import { LeitorDeFluxo, FERRAMENTA_GEMINI, pareceLimite } from './stream.js';
import { instrucoesDueto, prepararDueto, subpastaValida } from './dueto.js';
import { argsPermissao } from './permissoes.js';
import { itensDeAxe, montarPedidoCorrecao, type ResultadoAuditoria } from '../trabalho/auditoria.js';
import type { Bloco, Evento } from './tipos.js';

function repoNovo() {
  return new Repo(abrirBanco(':memory:'));
}

// ---------- guardiao de cota ----------
test('cota: nivel por porcentagem (80% avisa, 100% e limite)', () => {
  let agora = Date.UTC(2026, 10, 14, 12, 0, 0);
  const g = new Guardiao(repoNovo(), () => agora);
  assert.equal(g.estado().nivel, 'sem-dado');
  const renova = Math.floor(agora / 1000) + 3600;
  g.registrar({ cincoHoras: 50, seteDias: 10, renovaEm: renova });
  assert.equal(g.estado().nivel, 'ok');
  g.registrar({ cincoHoras: 80, renovaEm: renova });
  assert.equal(g.estado().nivel, 'alto');
  assert.equal(g.estado().seteDias, 10, 'um evento sem porcentagem nao apaga o que ja se sabe');
  g.registrar({ cincoHoras: 100, renovaEm: renova, estado: 'rejected' });
  assert.equal(g.estado().nivel, 'limite');
  agora += 2 * 3600 * 1000;
  assert.equal(g.estado().nivel, 'sem-dado', 'depois que a janela renova o dado antigo nao vale');
});

test('cota: o uso sobrevive a reiniciar o servidor', () => {
  const repo = repoNovo();
  const agora = Date.UTC(2026, 10, 14, 12, 0, 0);
  const renova = Math.floor(agora / 1000) + 3600;
  new Guardiao(repo, () => agora).registrar({ cincoHoras: 91, renovaEm: renova });
  const depois = new Guardiao(repo, () => agora + 60_000);
  assert.equal(depois.estado().cincoHoras, 91);
  assert.equal(depois.estado().nivel, 'alto');
});

test('cota: Haiku forcado vale ate a janela renovar e depois se desliga sozinho', () => {
  let agora = Date.UTC(2026, 10, 14, 12, 0, 0);
  const g = new Guardiao(repoNovo(), () => agora);
  const renova = Math.floor(agora / 1000) + 1800;
  g.registrar({ cincoHoras: 90, renovaEm: renova });
  const ate = g.ligarHaiku();
  assert.equal(ate, renova, 'usa o fim da janela que o claude informou');
  assert.equal(g.haikuAtivo(), true);
  agora += 31 * 60 * 1000;
  assert.equal(g.haikuAtivo(), false);
  assert.equal(g.estado().haikuAte, undefined);
  // sem janela conhecida: 5 h a partir de agora
  const g2 = new Guardiao(repoNovo(), () => agora);
  assert.equal(g2.ligarHaiku(), Math.floor(agora / 1000) + 5 * 3600);
  g2.desligarHaiku();
  assert.equal(g2.haikuAtivo(), false);
});

test('cota: horario de renovacao que ja passou nao derruba o dado recem chegado', () => {
  const agora = Date.UTC(2026, 10, 14, 12, 0, 0);
  const g = new Guardiao(repoNovo(), () => agora);
  g.registrar({ cincoHoras: 50, renovaEm: 1 });
  assert.equal(g.estado().cincoHoras, 50);
});

// ---------- leitor de fluxo: limite e Gemini ----------
function ler(linhas: object[]) {
  const eventos: Evento[] = [];
  const l = new LeitorDeFluxo((e) => eventos.push(e), { cwd: '/p', mostrarPensamento: true });
  for (const o of linhas) l.linha(JSON.stringify(o));
  return { l, eventos };
}

test('stream: limite batido vira bloco "limite" com a hora de renovar', () => {
  const { l, eventos } = ler([
    { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt: 1900000000, unifiedWindows: { five_hour: { utilization: 1, resetsAt: 1900000000 } } } },
    { type: 'result', subtype: 'success', is_error: true, result: "You've hit your usage limit · resets 3pm" },
  ]);
  const b = l.blocos.find((x) => x.tipo === 'limite') as Extract<Bloco, { tipo: 'limite' }>;
  assert.ok(b, 'tem o bloco de limite');
  assert.equal(b.renovaEm, 1900000000);
  assert.ok(eventos.some((e) => e.t === 'limite'));
  assert.ok(!l.blocos.some((x) => x.tipo === 'erro'), 'nao vira erro generico');
});

test('stream: erro comum continua sendo erro', () => {
  const { l } = ler([{ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'algo quebrou na ferramenta' }]);
  assert.ok(l.blocos.some((x) => x.tipo === 'erro'));
  assert.ok(!l.blocos.some((x) => x.tipo === 'limite'));
});

test('stream: texto de limite em portugues e ingles', () => {
  assert.ok(pareceLimite('Você atingiu o limite de uso da assinatura'));
  assert.ok(pareceLimite('Claude usage limit reached. Your limit will reset at 5pm'));
  assert.ok(!pareceLimite('arquivo nao encontrado'));
});

test('stream: resposta do Gemini no dueto vira bloco "gemini" com a tarefa inteira', () => {
  const tarefa = 'faca tres variacoes do logo '.repeat(10);
  const { l, eventos } = ler([
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'g1', name: FERRAMENTA_GEMINI, input: { tarefa, arquivos: ['logo.svg'] } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'g1', content: [{ type: 'text', text: 'Criei 3 arquivos' }] }] } },
    { type: 'result', subtype: 'success', is_error: false, result: 'ok' },
  ]);
  const g = l.blocos.find((x) => x.tipo === 'gemini') as Extract<Bloco, { tipo: 'gemini' }>;
  assert.ok(g);
  assert.equal(g.texto, 'Criei 3 arquivos');
  assert.equal(g.tarefa, tarefa, 'a tarefa vai inteira, sem o corte de 90 caracteres do resumo');
  assert.ok(eventos.some((e) => e.t === 'gemini'));
});

test('stream: resultado de ferramenta comum nao vira bloco gemini', () => {
  const { l } = ler([
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: '/p/a.txt' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'r1', content: 'conteudo' }] } },
  ]);
  assert.ok(!l.blocos.some((x) => x.tipo === 'gemini'));
});

// ---------- dueto ----------
test('dueto: subpasta sempre fica dentro do projeto', () => {
  assert.equal(subpastaValida('arte'), 'arte');
  assert.equal(subpastaValida('  imagens/ia/ '), 'imagens/ia');
  assert.equal(subpastaValida('..'), 'arte');
  assert.equal(subpastaValida('../fora'), 'arte');
  assert.equal(subpastaValida('a/../../b'), 'arte');
  assert.equal(subpastaValida(''), 'arte');
  assert.equal(subpastaValida(undefined), 'arte');
  assert.equal(subpastaValida('c:/windows'), 'arte');
  assert.match(instrucoesDueto('arte'), /pedir_ao_gemini/);
});

test('dueto: arquivo de conectores aponta pro servidor MCP e leva o modo do agy', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'hrzz-dueto-'));
  try {
    const p = prepararDueto(
      { raiz: '/hrzz', agyBin: join(pasta, 'agy-x') },
      { pastaDueto: join(pasta, 'dueto'), conversa: 7, pastaProjeto: '/proj', subpasta: 'arte', modo: 'yolo', modeloAgy: 'gemini-3-pro' },
    );
    const cfg = JSON.parse(readFileSync(p.mcpConfig, 'utf8'));
    const s = cfg.mcpServers['hrzz-gemini'];
    assert.equal(s.command, process.execPath);
    assert.match(s.args[0].replace(/\\/g, '/'), /apps\/servidor\/mcp\/gemini\.mjs$/);
    assert.equal(s.env.HRZZ_MCP_MODO, 'auto');
    assert.equal(s.env.HRZZ_MCP_MODELO, 'gemini-3-pro');
    assert.equal(s.env.HRZZ_MCP_PASTA, '/proj');
    assert.deepEqual(p.permitidas, [FERRAMENTA_GEMINI]);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('dueto: a ferramenta do Gemini entra nas permitidas do claude', () => {
  const args = argsPermissao('mid', [], true, false, [], [FERRAMENTA_GEMINI]);
  const i = args.indexOf('--allowedTools');
  assert.ok(i >= 0 && args.slice(i + 1).includes(FERRAMENTA_GEMINI));
});

// ---------- servidor MCP (funcoes) ----------
test('mcp gemini: confere arquivos e a subpasta', async () => {
  process.env.HRZZ_MCP_PASTA = tmpdir();
  const mod = (await import(new URL('../../mcp/gemini.mjs', import.meta.url).href)) as typeof import('../../mcp/gemini.mjs');
  const pasta = mkdtempSync(join(tmpdir(), 'hrzz-mcp-'));
  try {
    writeFileSync(join(pasta, 'a.txt'), 'x');
    const r = mod.conferirArquivos(pasta, ['a.txt', '../fora.txt', 'nao-existe.txt', 42]);
    assert.equal(r.bons.length, 1);
    assert.equal(r.ruins.length, 2);
    assert.equal(mod.subpastaSegura(pasta, '../x'), 'arte');
    assert.equal(mod.subpastaSegura(pasta, 'imagens'), 'imagens');
    assert.equal(mod.FERRAMENTA.name, 'pedir_ao_gemini');
    assert.deepEqual(mod.FERRAMENTA.inputSchema.required, ['tarefa']);
    assert.match(mod.montarPedido({ tarefa: 'fazer X', arquivos: [join(pasta, 'a.txt')], subpasta: 'arte' }), /fazer X[\s\S]*a\.txt/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

// ---------- cron e fila ----------
test('cron: so aceita 5 campos e mostra a proxima execucao', () => {
  assert.equal(validarCron('0 8 * * 1-5'), null);
  assert.match(validarCron('*/5 * * * * *') ?? '', /5 campos/);
  assert.match(validarCron('banana') ?? '', /5 campos/);
  assert.ok(validarCron('99 99 * * *'));
  const prox = proximaExecucao('30 7 * * 1-5', new Date(2026, 10, 14, 12, 0, 0)); // sabado
  assert.ok(prox);
  assert.equal(prox!.getHours(), 7);
  assert.equal(prox!.getMinutes(), 30);
  assert.equal(prox!.getDay(), 1, 'sabado -> segunda');
});

// ---------- banco ----------
test('banco: bancos antigos ganham a coluna "parceria" sem perder dados', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'hrzz-db-'));
  const arq = join(pasta, 'velho.db');
  try {
    const velho = new DatabaseSync(arq);
    velho.exec(`create table projetos(id integer primary key autoincrement, nome text not null, pasta text not null, criado text not null default (datetime('now')));
      create table conversas(id integer primary key autoincrement, projeto_id integer, titulo text not null default 'nova conversa', motor text not null default 'claude', modelo text, modelo_auto integer not null default 1, modo text not null default 'mid', pensar integer not null default 1, esforco integer not null default 1, web integer not null default 1, sessao_claude text, sessao_agy text, liberadas text not null default '[]', criada text not null default (datetime('now')), atualizada text not null default (datetime('now')));
      insert into conversas(titulo) values('antiga');`);
    velho.close();
    const aberto = abrirBanco(arq);
    const repo = new Repo(aberto);
    const c = repo.listarConversas();
    assert.equal(c.length, 1);
    assert.equal(c[0].titulo, 'antiga');
    assert.equal(c[0].parceria, '');
    repo.atualizarConversa(c[0].id, { parceria: 'dueto' });
    assert.equal(repo.obterConversa(c[0].id)!.parceria, 'dueto');
    // abrir de novo nao tenta criar a coluna outra vez
    const outra = abrirBanco(arq);
    new Repo(outra);
    outra.close();
    aberto.close();
  } finally {
    rmSync(pasta, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('banco: tarefas — ordem, interrompidas voltam pra fila, recentes limitadas', () => {
  const repo = repoNovo();
  const a = repo.criarTarefa({ titulo: 'a', pedido: 'pa' });
  const b = repo.criarTarefa({ titulo: 'b', pedido: 'pb' });
  assert.equal(repo.proximaTarefa()!.id, a.id);
  repo.mudarTarefa(a.id, { estado: 'rodando', iniciou: true });
  assert.equal(repo.proximaTarefa()!.id, b.id);
  assert.equal(repo.recolocarTarefasInterrompidas(), 1);
  assert.equal(repo.obterTarefa(a.id)!.estado, 'fila');
  assert.equal(repo.obterTarefa(a.id)!.iniciou, null);
  for (let i = 0; i < 20; i++) {
    const t = repo.criarTarefa({ titulo: 't' + i, pedido: 'x' });
    repo.mudarTarefa(t.id, { estado: 'pronta', terminou: true });
  }
  const lista = repo.listarTarefas(15);
  assert.equal(lista.length, 2 + 15, 'as abertas e so as 15 mais recentes que terminaram');
  assert.equal(lista[0].estado, 'fila');
});

test('banco: agendamentos — criar, mudar, apagar; tarefa guarda a origem', () => {
  const repo = repoNovo();
  const ag = repo.criarAgendamento({ titulo: 'diario', pedido: 'resumo', cron: '0 8 * * *' });
  assert.equal(ag.ligado, true);
  assert.equal(ag.modo, 'mid');
  repo.mudarAgendamento(ag.id, { ligado: false, cron: '0 9 * * *', ultimo: true });
  const depois = repo.obterAgendamento(ag.id)!;
  assert.equal(depois.ligado, false);
  assert.equal(depois.cron, '0 9 * * *');
  assert.ok(depois.ultimo);
  const t = repo.criarTarefa({ titulo: 'diario', pedido: 'resumo', origem: 'agenda', agendamentoId: ag.id });
  assert.equal(t.origem, 'agenda');
  repo.apagarAgendamento(ag.id);
  assert.equal(repo.obterAgendamento(ag.id), undefined);
  assert.equal(repo.obterTarefa(t.id)!.agendamentoId, null, 'a tarefa fica, sem o vinculo');
});

test('banco: config guarda e apaga chaves', () => {
  const repo = repoNovo();
  assert.equal(repo.lerConfig('x'), undefined);
  repo.gravarConfig('x', '1');
  repo.gravarConfig('x', '2');
  assert.equal(repo.lerConfig('x'), '2');
  repo.apagarConfig('x');
  assert.equal(repo.lerConfig('x'), undefined);
});

// ---------- auditoria (parte sem navegador) ----------
test('auditoria: itens do axe trazem seletor, regra e a razao de contraste', () => {
  const r = itensDeAxe([
    { id: 'image-alt', impact: 'critical', help: 'Imagens precisam de texto alternativo', nodes: [{ target: ['img'], html: '<img src="x.png">' }] },
    { id: 'color-contrast', impact: 'serious', help: 'contraste', nodes: [{ target: ['.claro'], html: '<p class="claro">x</p>', any: [{ data: { contrastRatio: 2.32, expectedContrastRatio: '4.5:1' } }] }] },
  ]);
  assert.equal(r.total, 2);
  assert.match(r.itens[0].detalhe, /image-alt, critical/);
  assert.equal(r.itens[1].detalhe, 'contraste 2.32:1 (o mínimo é 4.5:1)');
  const muitos = itensDeAxe([{ id: 'x', help: 'h', nodes: Array.from({ length: 40 }, () => ({ target: ['a'] })) }], 25);
  assert.equal(muitos.total, 40);
  assert.equal(muitos.itens.length, 25, 'a lista mostra so os primeiros, o total continua certo');
});

test('auditoria: o pedido pro Claude lista so o que falhou', () => {
  const r: ResultadoAuditoria = {
    quando: '2026-11-14T00:00:00Z',
    porta: 5173,
    caminho: '/',
    larguras: [360, 1280],
    problemas: 3,
    verificacoes: [
      { id: 'estouro', titulo: 'nada passa da lateral (360 e 1280 px)', ok: true, total: 0, itens: [] },
      { id: 'alvos', titulo: 'alvos de toque de 44 px (celular)', ok: false, total: 3, itens: [{ onde: 'button.pq', detalhe: 'mede 20 x 20 px (o mínimo é 44 x 44)', texto: 'x' }] },
    ],
  };
  const p = montarPedidoCorrecao(r);
  assert.match(p, /3 problemas/);
  assert.match(p, /button\.pq/);
  assert.match(p, /e mais 2/);
  assert.ok(!p.includes('nada passa da lateral'), 'o que passou nao entra no pedido');
  assert.match(montarPedidoCorrecao({ ...r, problemas: 0, verificacoes: r.verificacoes.map((v) => ({ ...v, ok: true, total: 0 })) }), /não achou problemas/);
});

test('arquivos de teste existem', () => {
  assert.ok(existsSync(new URL('../../mcp/gemini.mjs', import.meta.url)));
  void mkdirSync;
});
