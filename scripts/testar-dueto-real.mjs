// Teste do dueto com o `claude` DE VERDADE (Haiku, uma mensagem) e o agy de MENTIRA: confere se o Claude Code oficial
// carrega o servidor MCP do HRZZ, enxerga a ferramenta pedir_ao_gemini e consegue chamar. Gasta uma mensagem curta da
// assinatura do Claude; nao chama o Gemini (docs/automatico.md).
//   npm run testar:dueto-real
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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

const servidor = await subirServidorDeTeste({ porta: 7099, claudeReal: true, agyFalso: true });
try {
  const pasta = join(servidor.pasta, 'p-dueto-real');
  mkdirSync(pasta, { recursive: true });
  writeFileSync(join(pasta, 'logo.txt'), 'logo');
  const h = { cookie: servidor.cabecalhoCookie, 'content-type': 'application/json' };
  const projeto = await (await fetch(servidor.url + '/api/projetos', { method: 'POST', headers: h, body: JSON.stringify({ nome: 'dueto real', pasta }) })).json();
  console.log('dueto com o claude real (Haiku) e o agy de mentira');
  const fim = await conversarPeloWs(
    servidor,
    {
      texto: 'Chame a ferramenta pedir_ao_gemini com a tarefa "arte-teste: crie um arquivo de exemplo" e depois responda em uma linha o que o Gemini disse.',
      projeto: projeto.id,
      parceria: 'dueto',
      modelo: 'haiku',
    },
    { limiteMs: 150000 },
  );
  const d = await (await fetch(`${servidor.url}/api/conversas/${fim.conversa}`, { headers: h })).json();
  const blocos = d.mensagens.filter((m) => m.papel === 'ia').flatMap((m) => m.conteudo);
  ok('o agy de mentira foi chamado pelo servidor MCP', servidor.chamadasAgy().length >= 1, JSON.stringify(blocos.map((b) => [b.tipo, b.nome ?? b.texto?.slice(0, 80)])));
  ok('a conversa guarda o bloco "gemini"', blocos.some((b) => b.tipo === 'gemini' && /Criei variacao\.svg/.test(b.texto)), JSON.stringify(blocos).slice(0, 500));
  ok('o Gemini trabalhou na subpasta arte/', existsSync(join(pasta, 'arte', 'variacao.svg')));
  ok('sem erro na conversa', !blocos.some((b) => b.tipo === 'erro'), JSON.stringify(blocos.filter((b) => b.tipo === 'erro')));

  // duelo: o claude de verdade numa copia da pasta (sessao guardada por lado), o agy de mentira na outra
  console.log('duelo com o claude real (Haiku) e o agy de mentira');
  const f1 = await conversarPeloWs(servidor, { texto: 'Responda apenas com a palavra: azul', projeto: projeto.id, parceria: 'duelo', modelo: 'haiku' }, { limiteMs: 150000 });
  const m1 = (await (await fetch(`${servidor.url}/api/conversas/${f1.conversa}`, { headers: h })).json()).mensagens.filter((m) => m.papel === 'ia').at(-1);
  const duelo = m1.conteudo.find((b) => b.tipo === 'duelo');
  const textoClaude = (duelo?.lados[0].blocos ?? []).filter((b) => b.tipo === 'texto').map((b) => b.texto).join(' ');
  ok('duelo real: o lado do Claude respondeu', /azul/i.test(textoClaude), textoClaude.slice(0, 120));
  ok('duelo real: o lado do Gemini (de mentira) respondeu', (duelo?.lados[1].blocos ?? []).some((b) => b.tipo === 'texto'));
  const esc = await fetch(servidor.url + '/api/duelo/escolher', { method: 'POST', headers: h, body: JSON.stringify({ conversa: f1.conversa, mensagem: m1.id, lado: 0 }) });
  ok('duelo real: usar a resposta do Claude', esc.status === 200);
  const f2 = await conversarPeloWs(servidor, { texto: 'Qual palavra eu pedi na mensagem anterior? Responda apenas com ela.', conversa: f1.conversa, parceria: 'duelo' }, { limiteMs: 150000 });
  const m2 = (await (await fetch(`${servidor.url}/api/conversas/${f2.conversa}`, { headers: h })).json()).mensagens.filter((m) => m.papel === 'ia').at(-1);
  const t2 = (m2.conteudo.find((b) => b.tipo === 'duelo')?.lados[0].blocos ?? []).filter((b) => b.tipo === 'texto').map((b) => b.texto).join(' ');
  ok('duelo real: a sessao do lado do Claude continua entre as rodadas (retomou na mesma copia)', /azul/i.test(t2), t2.slice(0, 160));
} finally {
  await servidor.parar();
}
console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
