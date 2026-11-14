// Teste do motor com o claude de verdade (gasta poucas mensagens, usa o Haiku):
// modos de permissao, bloqueio de apagar e de push, anexo de imagem e memoria nas instrucoes.
// Uso: npm run testar:claude   (precisa do build: npm run build)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rodarClaude } from '../apps/servidor/dist/ia/claude.js';
import { montarPromptSistema } from '../apps/servidor/dist/ia/prompt.js';

let falhas = 0;
const ok = (nome, cond, detalhe = '') => {
  console.log(`  [${cond ? 'ok' : '--'}] ${nome}${cond || !detalhe ? '' : ': ' + String(detalhe).slice(0, 300)}`);
  if (!cond) falhas++;
};

async function turno(opcoes) {
  const eventos = [];
  const t = rodarClaude(
    { claudeBin: 'claude' },
    {
      motor: 'claude',
      modelo: 'haiku',
      esforco: 0,
      pensar: 1,
      web: false,
      modo: 'mid',
      restrito: false,
      sessao: null,
      promptSistema: montarPromptSistema({ memoria: '', pensar: 1 }),
      pastasExtras: [],
      liberadas: [],
      ...opcoes,
    },
    (e) => eventos.push(e),
  );
  const r = await t.terminou;
  return { ...r, eventos, negadas: r.blocos.filter((b) => b.tipo === 'permissao').flatMap((b) => b.negadas) };
}

const pasta = mkdtempSync(join(tmpdir(), 'hrzz-motor-'));
const nova = (nome) => {
  const p = join(pasta, nome);
  mkdirSync(p, { recursive: true });
  return p;
};

console.log('motor claude (real)');

// 1. mid: cria arquivo sem perguntar, mas apagar e negado
{
  const cwd = nova('mid');
  writeFileSync(join(cwd, 'velho.txt'), 'x');
  const r = await turno({ cwd, mensagem: 'Crie o arquivo novo.txt com a palavra oi. Depois apague o arquivo velho.txt usando o comando rm no Bash. Responda curto.' });
  ok('mid: cria arquivo sem perguntar', existsSync(join(cwd, 'novo.txt')), JSON.stringify(r.blocos).slice(0, 300));
  ok('mid: apagar vira pedido de permissao (categoria apagar)', r.negadas.some((n) => n.categoria === 'apagar'), JSON.stringify(r.negadas));
  ok('mid: o arquivo nao foi apagado', existsSync(join(cwd, 'velho.txt')));
}

// 2. mid: push e negado
{
  const cwd = nova('push');
  const remoto = nova('remoto.git');
  const g = (...a) => spawnSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  spawnSync('git', ['init', '--bare', '-b', 'main', remoto]);
  g('init', '-b', 'main');
  writeFileSync(join(cwd, 'a.txt'), 'a');
  g('add', '-A');
  g('commit', '-m', 'um');
  g('remote', 'add', 'origin', remoto);
  const r = await turno({ cwd, mensagem: 'Use a ferramenta Bash agora para executar o comando: git push origin main. Eu autorizo. Depois diga em uma frase o resultado.' });
  ok('mid: git push vira pedido de permissao', r.negadas.some((n) => n.categoria === 'push'), JSON.stringify(r.negadas));
  ok('mid: nada foi enviado pro remoto', g('ls-remote', 'origin').stdout.trim() === '');
}

// 3. intern: nem criar arquivo sem perguntar
{
  const cwd = nova('intern');
  const r = await turno({ cwd, modo: 'intern', mensagem: 'Crie o arquivo a.txt com a palavra oi. Responda curto.' });
  ok('intern: criar arquivo vira pedido de permissao', r.negadas.length > 0 && !existsSync(join(cwd, 'a.txt')), JSON.stringify(r.negadas));
}

// 4. aprovar "apagar" libera o rm (e so ele)
{
  const cwd = nova('liberado');
  writeFileSync(join(cwd, 'velho.txt'), 'x');
  const r = await turno({ cwd, liberadas: ['cat:apagar'], mensagem: 'Apague o arquivo velho.txt usando o comando rm no Bash. Responda curto.' });
  ok('apagar liberado: o arquivo some', !existsSync(join(cwd, 'velho.txt')), JSON.stringify(r.negadas));
}

// 5. imagem anexada: o modelo enxerga
{
  const cwd = nova('imagem');
  const png = join('dados', 'testes-layout', '360-chat.png');
  if (existsSync(png)) {
    const destino = join(pasta, 'anexo.png');
    copyFileSync(png, destino);
    const r = await turno({ cwd, pastasExtras: [pasta], mensagem: `Descreva em uma frase curta o que aparece nesta imagem (leia pelo caminho): ${destino}` });
    const texto = r.blocos.filter((b) => b.tipo === 'texto').map((b) => b.texto).join(' ');
    ok('imagem anexada: o claude descreve a imagem', texto.length > 20 && !r.erro, texto || r.erro);
  } else {
    console.log('  (sem captura em dados/testes-layout: pulei o teste de imagem; rode npm run testar:layout antes)');
  }
}

// 6. memoria entra nas instrucoes
{
  const cwd = nova('memoria');
  const r = await turno({
    cwd,
    promptSistema: montarPromptSistema({ memoria: '### preferencias.md\nSempre que eu perguntar a cor do céu, responda exatamente: AZUL-HRZZ.', pensar: 1 }),
    mensagem: 'Qual a cor do céu?',
  });
  const texto = r.blocos.filter((b) => b.tipo === 'texto').map((b) => b.texto).join(' ');
  ok('memoria: o claude segue o que esta nos arquivos de memoria', /AZUL-HRZZ/.test(texto), texto);
}

// 7. retomar sessao
{
  const cwd = nova('sessao');
  const a = await turno({ cwd, mensagem: 'Guarde este numero: 7391. Responda só "ok".' });
  const b = await turno({ cwd, sessao: a.sessao, mensagem: 'Qual numero eu pedi pra guardar? Responda só o numero.' });
  const texto = b.blocos.filter((x) => x.tipo === 'texto').map((x) => x.texto).join(' ');
  ok('sessao: segunda mensagem lembra da primeira (--resume)', !!a.sessao && /7391/.test(texto), texto);
}

if (falhas) {
  console.log(`\n${falhas} verificacao(oes) falharam.`);
  process.exit(1);
}
console.log('\nMotor claude ok.');
