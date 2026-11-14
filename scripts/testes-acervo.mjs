// Testes da etapa 4 (acervo) sem navegador: sobe um HRZZ isolado com o claude de mentira e confere se memoria, skills por
// projeto, comandos salvos e modelos de projeto chegam de verdade no que o HRZZ manda pro claude.
//   npm run testar:acervo
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { conversarPeloWs, subirServidorDeTeste } from './lib-teste.mjs';

let falhas = 0;
function ok(nome, cond, detalhe = '') {
  if (cond) console.log(`  [ok] ${nome}`);
  else {
    console.log(`  [--] ${nome}${detalhe ? ': ' + detalhe : ''}`);
    falhas++;
  }
}

const servidor = await subirServidorDeTeste({ porta: 7095 });
const api = (caminho, init = {}) => fetch(servidor.url + caminho, { ...init, headers: { cookie: servidor.cabecalhoCookie, ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) } });
const json = async (caminho, init) => (await api(caminho, init)).json();
const put = (caminho, corpo) => api(caminho, { method: 'PUT', body: JSON.stringify(corpo) });
const post = (caminho, corpo) => api(caminho, { method: 'POST', body: JSON.stringify(corpo) });
const valorDe = (args, flag) => args[args.indexOf(flag) + 1];
const depoisDe = (args, flag) => {
  const i = args.indexOf(flag);
  if (i < 0) return [];
  const fim = args.findIndex((a, j) => j > i && a.startsWith('--'));
  return args.slice(i + 1, fim < 0 ? undefined : fim);
};
const ultimaChamada = () => servidor.chamadas().at(-1);

try {
  console.log('acervo: protecao');
  for (const caminho of ['/api/memoria', '/api/skills', '/api/comandos', '/api/modelos-projeto']) {
    ok(`sem o cookie do PIN: 401 em ${caminho}`, (await fetch(servidor.url + caminho)).status === 401);
  }

  console.log('acervo: memoria entra nas instrucoes do claude');
  ok('arquivo novo em subpasta', (await put('/api/memoria/arquivo', { nome: 'areas/bhz-optica', conteudo: '# BHZ Optica\nA loja fica no Street Shopping Planalto, codigo-banana-42.' })).status === 200);
  await conversarPeloWs(servidor, { texto: 'oi' });
  ok('o texto da memoria vai em --append-system-prompt', valorDe(ultimaChamada().args, '--append-system-prompt').includes('codigo-banana-42'));
  const imp = await (await post('/api/memoria/importar', { texto: '## Contexto\nBH\n\n## Gostos\ncafe', dividir: true })).json();
  ok('importar do claude.ai divide por titulo', imp.criados?.length === 2 && existsSync(join(servidor.pasta, 'memoria', 'claude-ai', 'gostos.md')));
  await api('/api/memoria/arquivo?nome=areas%2Fbhz-optica', { method: 'DELETE' });
  await conversarPeloWs(servidor, { texto: 'oi de novo' });
  ok('apagado da memoria, a IA nao le mais', !valorDe(ultimaChamada().args, '--append-system-prompt').includes('codigo-banana-42'));

  console.log('acervo: skills por projeto');
  const pA = await json('/api/projetos', { method: 'POST', body: JSON.stringify({ nome: 'projeto a' }) });
  const pB = await json('/api/projetos', { method: 'POST', body: JSON.stringify({ nome: 'projeto b' }) });
  const lista = await json(`/api/skills?projeto=${pA.id}`);
  const chaves = lista.skills.map((s) => s.chave);
  ok('acha as skills sincronizadas com o nome nativo', ['anthropic-skills:docx', 'anthropic-skills:xlsx', 'anthropic-skills:estilo-joao-pedro'].every((c) => chaves.includes(c)), chaves.join(','));
  ok('docx e da anthropic, estilo-joao-pedro e sua', lista.skills.find((s) => s.chave === 'anthropic-skills:docx').origem === 'anthropic' && lista.skills.find((s) => s.chave === 'anthropic-skills:estilo-joao-pedro').origem === 'sua');

  ok('cria uma skill do Joao', (await put('/api/skills/hrzz/tom-de-oficio', { descricao: 'Use ao redigir oficios', instrucoes: 'Escreva em tom formal.' })).status === 200);
  await conversarPeloWs(servidor, { texto: 'oi', projeto: pA.id });
  let args = ultimaChamada().args;
  const plugin = valorDe(args, '--plugin-dir');
  ok('a skill ligada entra por --plugin-dir', !!plugin && existsSync(join(plugin, 'skills', 'tom-de-oficio', 'SKILL.md')) && JSON.parse(readFileSync(join(plugin, '.claude-plugin', 'plugin.json'), 'utf8')).name === 'hrzz-skills', plugin);
  ok('o plugin e so do projeto a', /escopo-\d+$/.test(plugin.replace(/\\/g, '/')) && plugin.includes(`escopo-${pA.id}`));
  ok('a pasta das skills entra em --add-dir pra o claude poder ler os arquivos delas', depoisDe(args, '--add-dir').some((d) => d.endsWith('skills-ativas')));

  await put('/api/skills/ligada', { projeto: pA.id, chave: 'hrzz-skills:tom-de-oficio', ligada: false });
  await put('/api/skills/ligada', { projeto: pA.id, chave: 'anthropic-skills:docx', ligada: false });
  await conversarPeloWs(servidor, { texto: 'oi', projeto: pA.id });
  args = ultimaChamada().args;
  ok('desligada, a skill do Joao sai do plugin', !args.includes('--plugin-dir'));
  ok('skill nativa desligada vira regra Skill(...) em --disallowedTools', depoisDe(args, '--disallowedTools').includes('Skill(anthropic-skills:docx)'));
  ok('o prompt avisa quais skills estao desligadas', valorDe(args, '--append-system-prompt').includes('anthropic-skills:docx'));
  ok('as regras de apagar continuam', depoisDe(args, '--disallowedTools').some((r) => r.startsWith('Bash(rm')));

  await conversarPeloWs(servidor, { texto: 'oi', projeto: pB.id });
  args = ultimaChamada().args;
  ok('o projeto b nao e afetado', !depoisDe(args, '--disallowedTools').some((r) => r.startsWith('Skill(')) && !!valorDe(args, '--plugin-dir')?.includes(`escopo-${pB.id}`));
  await conversarPeloWs(servidor, { texto: 'oi' });
  args = ultimaChamada().args;
  ok('conversa sem projeto tambem e independente', !depoisDe(args, '--disallowedTools').some((r) => r.startsWith('Skill(')) && !!valorDe(args, '--plugin-dir')?.includes('escopo-0'));

  await put('/api/skills/ligada', { projeto: pA.id, chave: 'anthropic-skills:docx', ligada: true });
  await put('/api/skills/ligada', { projeto: pA.id, chave: 'hrzz-skills:tom-de-oficio', ligada: true });
  await conversarPeloWs(servidor, { texto: 'oi', projeto: pA.id });
  args = ultimaChamada().args;
  ok('religar volta tudo', !depoisDe(args, '--disallowedTools').some((r) => r.startsWith('Skill(')) && !!valorDe(args, '--plugin-dir'));

  console.log('acervo: comandos salvos');
  const cmds = await json('/api/comandos');
  ok('exemplos prontos: ata, grillme, revisar e site-loja', cmds.map((c) => c.nome).join(',') === 'ata,grillme,revisar,site-loja');
  ok('cria um comando', (await put('/api/comandos/resumo', { descricao: 'resume em tres linhas', corpo: 'Resuma em tres linhas: {{texto}}' })).status === 200);
  const fim = await conversarPeloWs(servidor, { texto: '/resumo a reuniao de ontem foi longa' });
  ok('/resumo manda o pedido do arquivo com o texto no lugar', ultimaChamada().prompt.includes('Resuma em tres linhas: a reuniao de ontem foi longa'), ultimaChamada().prompt);
  const msgs = await json(`/api/conversas/${fim.conversa}`);
  ok('a conversa guarda o pedido expandido', JSON.stringify(msgs.mensagens[0].conteudo).includes('Resuma em tres linhas'));
  await conversarPeloWs(servidor, { texto: '/revisar O relatorio segue anexo.' });
  const p = ultimaChamada().prompt;
  ok('/revisar pede as skills estilo-joao-pedro e humanizer', p.includes('estilo-joao-pedro') && p.includes('humanizer') && p.includes('O relatorio segue anexo.'));
  await conversarPeloWs(servidor, { texto: '/naoexiste oi' });
  ok('comando que nao existe segue como mensagem normal', ultimaChamada().prompt.startsWith('/naoexiste oi'));
  ok('o nome "ata" e reservado', (await put('/api/comandos/ata', { descricao: 'x', corpo: 'y' })).status === 400);
  await api('/api/comandos/resumo', { method: 'DELETE' });
  await conversarPeloWs(servidor, { texto: '/resumo oi' });
  ok('apagado, o comando deixa de expandir', ultimaChamada().prompt.startsWith('/resumo oi'));

  console.log('acervo: modelos de projeto');
  const modelos = await json('/api/modelos-projeto');
  ok('tres modelos', modelos.map((m) => m.id).join(',') === 'site-loja,retro-ledger,relatorio');
  const novo = await (await post('/api/modelos-projeto/relatorio/criar', { nome: 'Relatorio de outubro' })).json();
  ok('cria o projeto com o CLAUDE.md do modelo', existsSync(join(novo.projeto.pasta, 'CLAUDE.md')) && readFileSync(join(novo.projeto.pasta, 'CLAUDE.md'), 'utf8').includes('estilo-joao-pedro'));
  ok('o projeto aparece na lista e o pedido vem pronto', (await json('/api/projetos')).some((x) => x.id === novo.projeto.id) && novo.pedido.includes('[assunto]'));
  await conversarPeloWs(servidor, { texto: 'oi', projeto: novo.projeto.id });
  ok('a conversa roda na pasta do modelo', ultimaChamada().cwd.replace(/\\/g, '/').endsWith('relatorio-de-outubro'), ultimaChamada().cwd);
} catch (e) {
  console.log('  [--] erro inesperado:', e.stack ?? e.message);
  falhas++;
} finally {
  await servidor.parar();
}
console.log(falhas ? `\n${falhas} verificacao(oes) falharam.` : '\nAcervo ok.');
process.exit(falhas ? 1 : 0);
