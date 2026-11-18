import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { extrairBlocos, lerTodos } from './blocos.js';
import { LeitorDeFluxo } from './stream.js';
import { argsPermissao, classificarNegada, politicaDoModo } from './permissoes.js';
import { escolherModeloAuto, escolherMvp, lerModelosAgy, resolverModeloAgy } from './modelos.js';
import { montarArgsClaude } from './claude.js';
import { argumentoPedido, LIMITE_PEDIDO_NA_LINHA, montarArgsAgy } from './agy.js';
import { montarPromptSistema } from './prompt.js';
import type { Evento, OpcoesTurno } from './tipos.js';

const base: OpcoesTurno = {
  motor: 'claude',
  mensagem: 'oi',
  cwd: process.cwd(),
  modelo: 'sonnet',
  esforco: 1,
  pensar: 1,
  web: true,
  modo: 'mid',
  restrito: false,
  sessao: null,
  promptSistema: 'sistema',
  pastasExtras: [],
  liberadas: [],
};

test('blocos: tira <progresso> e <pergunta> do texto e le os itens', () => {
  const x = extrairBlocos(
    'Pronto, troquei.\n\n<progresso>\n[x] trocar menu\n[~] conferir alvos\n[ ] auditar\n</progresso>\n<pergunta>\nQual ícone?\n- mapa\n- pin\n</pergunta>',
  );
  assert.equal(x.texto, 'Pronto, troquei.');
  assert.deepEqual(x.progresso, [
    { texto: 'trocar menu', estado: 'feito' },
    { texto: 'conferir alvos', estado: 'fazendo' },
    { texto: 'auditar', estado: 'afazer' },
  ]);
  assert.deepEqual(x.pergunta, { pergunta: 'Qual ícone?', opcoes: ['mapa', 'pin'] });
});

test('blocos: texto sem blocos fica igual e pergunta sem opcoes e ignorada', () => {
  assert.equal(extrairBlocos('so texto').texto, 'so texto');
  assert.equal(extrairBlocos('<pergunta>\nso a pergunta\n</pergunta>').pergunta, undefined);
});

test('blocos: TodoWrite vira itens de progresso', () => {
  const itens = lerTodos({ todos: [{ content: 'a', status: 'completed' }, { content: 'b', status: 'in_progress' }, { content: 'c', status: 'pending' }] });
  assert.deepEqual(itens?.map((i) => i.estado), ['feito', 'fazendo', 'afazer']);
});

test('fluxo: traduz as linhas do claude em eventos e blocos', () => {
  const eventos: Evento[] = [];
  const l = new LeitorDeFluxo((e) => eventos.push(e), { cwd: process.cwd(), mostrarPensamento: true });
  const linhas = [
    { type: 'system', subtype: 'init', session_id: 'abc-123' },
    { type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'thinking' } } },
    { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hmm' } } },
    { type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'hmm' }] } },
    { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ol' } } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Write', input: { file_path: '/x/a.txt', content: 'oi' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'Feito.\n<progresso>\n[x] criar\n</progresso>' }] } },
    { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', unifiedWindows: { five_hour: { utilization: 0.09, resetsAt: 123 }, seven_day: { utilization: 0.37 } } } },
    { type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.01, duration_api_ms: 900, usage: { input_tokens: 2, output_tokens: 3 }, permission_denials: [] },
  ];
  for (const o of linhas) l.linha(JSON.stringify(o));

  assert.equal(l.sessao, 'abc-123');
  assert.ok(l.terminou);
  assert.deepEqual(
    l.blocos.map((b) => b.tipo),
    ['pensamento', 'ferramenta', 'texto'],
  );
  assert.equal((l.blocos[2] as { texto: string }).texto, 'Feito.');
  const tipos = eventos.map((e) => e.t);
  for (const esperado of ['sessao', 'pensando', 'pensando_delta', 'texto_delta', 'ferramenta', 'arquivo_alterado', 'ferramenta_fim', 'progresso', 'uso', 'fim']) {
    assert.ok(tipos.includes(esperado as Evento['t']), `faltou o evento ${esperado}`);
  }
  const uso = eventos.find((e) => e.t === 'uso');
  assert.deepEqual(uso && uso.t === 'uso' && [uso.cincoHoras, uso.seteDias], [9, 37]);
});

test('fluxo: pensamento desligado nao aparece', () => {
  const eventos: Evento[] = [];
  const l = new LeitorDeFluxo((e) => eventos.push(e), { cwd: process.cwd(), mostrarPensamento: false });
  l.linha(JSON.stringify({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'thinking' } } }));
  l.linha(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text: 'oi' }] } }));
  assert.deepEqual(l.blocos.map((b) => b.tipo), ['texto']);
  assert.ok(!eventos.some((e) => e.t === 'pensando'));
});

test('fluxo: negativa de permissao vira pergunta e erro do motor vira bloco de erro', () => {
  const eventos: Evento[] = [];
  const l = new LeitorDeFluxo((e) => eventos.push(e), { cwd: process.cwd(), mostrarPensamento: true });
  l.linha(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'nao deu', permission_denials: [{ tool_name: 'Bash', tool_input: { command: 'rm a.txt' } }] }));
  const p = eventos.find((e) => e.t === 'permissao');
  assert.ok(p && p.t === 'permissao');
  assert.equal(p.negadas[0].categoria, 'apagar');

  const l2 = new LeitorDeFluxo((e) => eventos.push(e), { cwd: process.cwd(), mostrarPensamento: true });
  l2.linha(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in' }));
  assert.equal(l2.erro, 'Not logged in');
  assert.equal(l2.blocos[0].tipo, 'erro');
});

test('fluxo: linha que nao e JSON vira texto', () => {
  const l = new LeitorDeFluxo(() => {}, { cwd: process.cwd(), mostrarPensamento: true });
  l.linha('resposta em texto puro');
  assert.deepEqual(l.blocos, [{ tipo: 'texto', texto: 'resposta em texto puro' }]);
});

test('permissoes: yolo e mid liberam comandos; mid tambem bloqueia push; apagar bloqueia nos dois', () => {
  const yolo = politicaDoModo('yolo');
  const mid = politicaDoModo('mid');
  assert.ok(yolo.permitidas.includes('Bash'));
  assert.ok(yolo.bloqueadas.includes('Bash(rm *)'));
  assert.ok(!yolo.bloqueadas.includes('Bash(git push*)'));
  assert.ok(mid.bloqueadas.includes('Bash(git push*)'));
  assert.ok(mid.bloqueadas.includes('Bash(git * push*)'), 'pega git -C pasta push');
  assert.ok(mid.bloqueadas.includes('PowerShell(Remove-Item*)'));
});

test('permissoes: intern pergunta tudo (modo manual, sem Bash liberado)', () => {
  const p = politicaDoModo('intern');
  assert.equal(p.permissionMode, 'manual');
  assert.ok(!p.permitidas.includes('Bash'));
});

test('permissoes: aprovar "apagar" tira o bloqueio de apagar; restrito nao libera comando', () => {
  const normal = argsPermissao('mid', [], true, false);
  assert.ok(normal.includes('Bash(rm *)'));
  const liberado = argsPermissao('mid', ['cat:apagar'], true, false);
  assert.ok(!liberado.includes('Bash(rm *)'));
  const restrito = argsPermissao('yolo', ['Bash(npm *)'], true, true);
  assert.ok(restrito.includes('--restricted'));
  const iAllowed = restrito.indexOf('--allowedTools');
  assert.equal(iAllowed, -1, 'restrito nao deve liberar Bash nem PowerShell');
});

test('permissoes: web desligada bloqueia WebSearch e WebFetch', () => {
  const a = argsPermissao('mid', [], false, false);
  assert.ok(a.includes('WebSearch') && a.includes('WebFetch'));
});

test('permissoes: classifica comando, push, apagar e arquivo fora da pasta', () => {
  const cwd = process.cwd();
  assert.equal(classificarNegada('Bash', { command: 'git push origin main' }, cwd).categoria, 'push');
  assert.equal(classificarNegada('Bash', { command: 'ls && rm -rf x' }, cwd).categoria, 'apagar');
  assert.equal(classificarNegada('PowerShell', { command: 'Remove-Item a.txt' }, cwd).categoria, 'apagar');
  const c = classificarNegada('Bash', { command: 'npm install foo' }, cwd);
  assert.equal(c.categoria, 'comando');
  assert.equal(c.regra, 'Bash(npm *)');
  assert.equal(classificarNegada('Edit', { file_path: 'C:\\outra\\pasta\\a.txt' }, cwd).categoria, 'fora');
  assert.equal(classificarNegada('Edit', { file_path: `${cwd}/a.txt` }, cwd).categoria, 'edicao');
});

test('modelo automatico: opus pra site/codigo/anexo/pedido longo, sonnet pro resto, haiku com cota alta', () => {
  const e = (texto: string, extra = {}) => escolherModeloAuto({ texto, anexos: 0, temProjeto: false, ...extra });
  assert.equal(e('crie um site para a minha loja'), 'opus');
  assert.equal(e('corrige esse bug no componente'), 'opus');
  assert.equal(e('qual a capital da Austrália?'), 'sonnet');
  assert.equal(e('oi, tudo bem?'), 'sonnet');
  assert.equal(e('resume isso', { anexos: 1 }), 'opus');
  assert.equal(e('x'.repeat(700)), 'opus');
  assert.equal(e('crie um site', { cotaPct: 85 }), 'haiku');
});

test('agy: lista de modelos mantem so os do Gemini', () => {
  const lista = lerModelosAgy('Fetching...\ngemini-4-argon-low\tGemini 4 Argon (Low)\nclaude-opus-5-5-low\tClaude Opus 5.5 (Low)\ngpt-oss\tGPT');
  assert.deepEqual(lista, [{ id: 'gemini-4-argon-low', nome: 'Gemini 4 Argon Low' }]);
});

// saida real do `agy models` na maquina do Joao (18/11/2026), colunas separadas por espacos
const SAIDA_AGY_REAL = [
  'gemini-4-argon-medium            Gemini 4 Argon (Medium)',
  'gemini-4-argon-high              Gemini 4 Argon (High)',
  'gemini-4-argon-low               Gemini 4 Argon (Low)',
  'gemini-4-hydrogen-high           Gemini 4 Hydrogen (High)',
  'gemini-4-hydrogen-xhigh          Gemini 4 Hydrogen (XHigh)',
  'gemini-4-hydrogen-medium         Gemini 4 Hydrogen (Medium)',
  'gemini-4-hydrogen-low            Gemini 4 Hydrogen (Low)',
  'gemini-pro-orchestrator-g1-pro   Orchestrator (Argon)',
  'gemini-3.8-flash-high            Gemini 3.8 Flash (High)',
  'gemini-3.8-flash-medium          Gemini 3.8 Flash (Medium)',
  'gemini-3.8-flash-low             Gemini 3.8 Flash (Low)',
  'claude-opus-5-5-low              Claude Opus 5.5 (Low)',
  'gpt-oss-120b-medium              GPT-OSS 120B (Medium)',
].join('\r\n');

test('agy: low/medium/high viram um item so; xhigh e orchestrator ficam separados', () => {
  assert.deepEqual(lerModelosAgy(SAIDA_AGY_REAL), [
    { id: 'gemini-4-argon-*', nome: 'Gemini 4 Argon', esforco: true },
    { id: 'gemini-4-hydrogen-*', nome: 'Gemini 4 Hydrogen', esforco: true },
    { id: 'gemini-4-hydrogen-xhigh', nome: 'Gemini 4 Hydrogen XHigh' },
    { id: 'gemini-pro-orchestrator-g1-pro', nome: 'Orchestrator Argon' },
    { id: 'gemini-3.8-flash-*', nome: 'Gemini 3.8 Flash', esforco: true },
  ]);
  assert.equal(resolverModeloAgy('gemini-4-argon-*', 0), 'gemini-4-argon-low');
  assert.equal(resolverModeloAgy('gemini-4-argon-*', 1), 'gemini-4-argon-medium');
  assert.equal(resolverModeloAgy('gemini-4-argon-*', 2), 'gemini-4-argon-high');
  assert.equal(resolverModeloAgy('gemini-4-hydrogen-xhigh', 0), 'gemini-4-hydrogen-xhigh');
});

test('mvp: escolhe entre Claude e Gemini pela tarefa', () => {
  const google = lerModelosAgy(SAIDA_AGY_REAL);
  const e = (texto: string, extra: Partial<Parameters<typeof escolherMvp>[0]> = {}) => escolherMvp({ texto, anexos: 0, temProjeto: false, google, ...extra });
  assert.deepEqual(e('crie um site pra um posto de gasolina'), { motor: 'claude', modelo: 'opus' });
  assert.deepEqual(e('faz um site com fotos do posto'), { motor: 'claude', modelo: 'opus' });
  assert.deepEqual(e('faz um logo pro posto'), { motor: 'agy', modelo: 'gemini-4-hydrogen-*' });
  assert.deepEqual(e('pesquisa os preços médios da gasolina em BH'), { motor: 'agy', modelo: 'gemini-4-hydrogen-*' });
  assert.deepEqual(e('qual a capital da Austrália?'), { motor: 'agy', modelo: 'gemini-3.8-flash-*' });
  assert.deepEqual(e('me explica com calma como funciona o sistema de cotas da UFMG, quais as modalidades e como a nota de corte muda entre elas ao longo dos anos, com exemplos de cursos concorridos como medicina, direito e engenharia, e o que mudou depois da última lei'), { motor: 'claude', modelo: 'sonnet' });
  assert.deepEqual(e('resume isso', { anexos: 1 }), { motor: 'claude', modelo: 'opus' });
  // cota alta: Gemini no lugar do Haiku
  assert.deepEqual(e('crie um site', { cotaPct: 85 }), { motor: 'agy', modelo: 'gemini-4-hydrogen-*' });
  assert.deepEqual(e('oi', { cotaPct: 85 }), { motor: 'agy', modelo: 'gemini-3.8-flash-*' });
  // sem agy instalado ou no dueto (quem coordena e o Claude): tudo no Claude
  assert.deepEqual(e('crie um site', { cotaPct: 85, google: [] }), { motor: 'claude', modelo: 'haiku' });
  assert.deepEqual(e('faz um logo pro posto', { dueto: true }), { motor: 'claude', modelo: 'sonnet' });
  assert.deepEqual(e('qual a capital da Austrália?', { google: [] }), { motor: 'claude', modelo: 'sonnet' });
});

test('claude: argumentos usam as flags conferidas no --help', () => {
  const a = montarArgsClaude({ ...base, esforco: 2, sessao: 'sessao-1', web: false });
  assert.deepEqual(a.slice(0, 5), ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages']);
  assert.equal(a[a.indexOf('--effort') + 1], 'max');
  assert.equal(a[a.indexOf('--resume') + 1], 'sessao-1');
  assert.equal(a[a.indexOf('--model') + 1], 'sonnet');
  assert.ok(a.includes('--permission-prompts') && a.includes('none'));
  assert.ok(a.includes('--disallowedTools'));
  assert.ok(!a.some((x) => /API_KEY/i.test(x)));
});

test('claude: esforco leve=low, medio=high', () => {
  assert.equal(montarArgsClaude({ ...base, esforco: 0 }).includes('low'), true);
  const m = montarArgsClaude({ ...base, esforco: 1 });
  assert.equal(m[m.indexOf('--effort') + 1], 'high');
});

test('agy: o pedido vai colado no -p (o -p do agy recebe valor)', () => {
  const a = montarArgsAgy({ ...base, motor: 'agy', modelo: 'gemini-4-argon-*', esforco: 2, modo: 'mid' }, 'faz um site\ncom duas linhas');
  assert.equal(a[0], '-p=faz um site\ncom duas linhas');
  assert.equal(a[a.indexOf('--model') + 1], 'gemini-4-argon-high');
  assert.ok(!a.includes('-p'));
  assert.ok(!a.includes('--sandbox'));
  assert.ok(montarArgsAgy({ ...base, motor: 'agy', restrito: true }, 'oi').includes('--sandbox'));
  const longo = argumentoPedido('x'.repeat(LIMITE_PEDIDO_NA_LINHA + 1), mkdtempSync(join(tmpdir(), 'hrzz-agy-teste-')));
  assert.match(longo, /^-p=O pedido completo .* está no arquivo .+\.md\. Leia/);
  assert.ok(longo.length < 400);
});

test('agy: modos de execucao e sessao', () => {
  const a = montarArgsAgy({ ...base, motor: 'agy', modelo: 'gemini-x', modo: 'yolo', sessao: 'c1' });
  assert.equal(a[a.indexOf('--mode') + 1], 'auto');
  assert.equal(a[a.indexOf('--conversation') + 1], 'c1');
  assert.equal(montarArgsAgy({ ...base, modo: 'mid' })[montarArgsAgy({ ...base, modo: 'mid' }).indexOf('--mode') + 1], 'accept-edits');
});

test('prompt: tem as regras do HRZZ, a memoria e o aviso de pensamento', () => {
  const p = montarPromptSistema({ memoria: '### a.md\nfalo pt-BR', pensar: 0, nomeProjeto: 'Site' });
  assert.match(p, /<progresso>/);
  assert.match(p, /<pergunta>/);
  assert.match(p, /falo pt-BR/);
  assert.match(p, /Projeto atual: Site/);
  assert.match(p, /sem raciocínio estendido/);
  assert.match(p, /skills de documentos/);
});

// saida real do agy na maquina do Joao (18/11/2026): `agy -p="oi" --output-format stream-json`
test('agy: leitor entende o formato real do agy (event/step_update/result)', () => {
  const eventos: Evento[] = [];
  const l = new LeitorDeFluxo((e) => eventos.push(e), { cwd: process.cwd(), mostrarPensamento: true });
  const linhas = [
    '{"event":"init","conversation_id":"9aed13a5-4a9d-49c4-bf6e-2bf0db0be4cf","init":{"model":"gemini-3.8-flash-low","cwd":"C:\\\\Users","tools":["list_dir"],"permission_mode":"request-review"}}',
    '{"event":"step_update","step_update":{"conversation_id":"9aed13a5-4a9d-49c4-bf6e-2bf0db0be4cf","step_index":0,"state":"DONE","step_type":"user_input"}}',
    '{"event":"step_update","step_update":{"conversation_id":"9aed13a5-4a9d-49c4-bf6e-2bf0db0be4cf","step_index":1,"state":"ACTIVE","step_type":"agent_response","text_delta":"Olá!"}}',
    '{"event":"step_update","step_update":{"conversation_id":"9aed13a5-4a9d-49c4-bf6e-2bf0db0be4cf","step_index":1,"state":"ACTIVE","step_type":"agent_response","text_delta":" Como posso ajudar você no projeto **hrzz-studi"}}',
    '{"event":"step_update","step_update":{"conversation_id":"9aed13a5-4a9d-49c4-bf6e-2bf0db0be4cf","step_index":1,"state":"ACTIVE","step_type":"agent_response","text_delta":"o** hoje?"}}',
    '{"event":"step_update","step_update":{"conversation_id":"9aed13a5-4a9d-49c4-bf6e-2bf0db0be4cf","step_index":1,"state":"DONE","step_type":"agent_response","text_delta":"\\n","duration_seconds":1.94,"usage":{"input_tokens":8744,"output_tokens":16,"thinking_tokens":0,"cache_read_tokens":0,"total_tokens":8760}}}',
    '{"event":"result","result":{"conversation_id":"9aed13a5-4a9d-49c4-bf6e-2bf0db0be4cf","status":"SUCCESS","response":"Olá! Como posso ajudar você no projeto **hrzz-studio** hoje?\\n","duration_seconds":1.9795897,"num_turns":1,"usage":{"input_tokens":8744,"output_tokens":16,"thinking_tokens":0,"cache_read_tokens":0,"total_tokens":8760}}}',
  ];
  for (const x of linhas) l.linha(x);
  const r = l.resultadoFinal();
  assert.equal(r.sessao, '9aed13a5-4a9d-49c4-bf6e-2bf0db0be4cf');
  assert.equal(r.erro, undefined);
  const textos = r.blocos.filter((b) => b.tipo === 'texto');
  assert.equal(textos.length, 1, 'o texto nao pode sair repetido (deltas + response final)');
  assert.equal((textos[0] as { texto: string }).texto.trim(), 'Olá! Como posso ajudar você no projeto **hrzz-studio** hoje?');
  assert.ok(eventos.some((e) => e.t === 'texto_delta'));
  const fim = eventos.find((e) => e.t === 'fim') as { tokens?: number; duracaoMs?: number } | undefined;
  assert.ok(fim);
  assert.equal(fim!.tokens, 8760);
  assert.equal(l.terminou, true);
});

test('agy: passo de ferramenta vira bloco de ferramenta e status de erro vira erro', () => {
  const eventos: Evento[] = [];
  const l = new LeitorDeFluxo((e) => eventos.push(e), { cwd: process.cwd(), mostrarPensamento: false });
  l.linha('{"event":"step_update","step_update":{"conversation_id":"c1","step_index":1,"state":"ACTIVE","step_type":"list_dir"}}');
  l.linha('{"event":"step_update","step_update":{"conversation_id":"c1","step_index":1,"state":"DONE","step_type":"list_dir"}}');
  l.linha('{"event":"result","result":{"conversation_id":"c1","status":"ERROR","response":"algo deu errado"}}');
  const r = l.resultadoFinal();
  assert.ok(r.blocos.some((b) => b.tipo === 'ferramenta' && b.nome === 'list_dir'));
  assert.ok(eventos.some((e) => e.t === 'ferramenta_fim'));
  assert.equal(r.erro, 'algo deu errado');
});
