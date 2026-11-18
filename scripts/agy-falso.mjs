// "agy" de mentira, so pra testes: nao fala com o Gemini nem gasta a assinatura do Google (docs/automatico.md).
// Entende `agy models` e `agy -p ...` (prompt pela entrada padrao). Escreve o que recebeu em HRZZ_AGY_LOG.
import { appendFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);

if (args[0] === 'models') {
  console.log('gemini-3-pro\tGemini 3 Pro');
  console.log('gemini-3-flash\tGemini 3 Flash');
  console.log('claude-qualquer\tNao deve aparecer');
  process.exit(0);
}

// como o agy real: o pedido vem no -p (-p=texto ou -p texto). Sem -p com valor, quebra igual ao real.
function pedidoDoP() {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('-p=') || a.startsWith('--print=')) return a.slice(a.indexOf('=') + 1);
    if (a === '-p' || a === '--print') return args[i + 1];
  }
  return undefined;
}
const doP = pedidoDoP();
if (doP === undefined || doP.startsWith('--')) {
  console.error(`Error: -p took "${doP}" as its prompt, so the intended prompt was left as an argument and ignored.`);
  process.exit(2);
}
// pedido grande vem num arquivo que o -p manda ler
const noArquivo = doP.match(/está no arquivo (.+?\.md)\. Leia/);
const prompt = noArquivo ? readFileSync(noArquivo[1], 'utf8') : doP;
if (process.env.HRZZ_AGY_LOG) appendFileSync(process.env.HRZZ_AGY_LOG, JSON.stringify({ args, prompt, cwd: process.cwd() }) + '\n');
const valor = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const formato = valor('--output-format') ?? 'text';
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

if (prompt.includes('lento')) await pausa(4000);
if (prompt.includes('quebrar-agy')) {
  console.error('erro de mentira do agy');
  process.exit(3);
}

let texto = 'Pronto. Fiz o que o Claude pediu.';
// dueto: cria um arquivo na pasta atual (a subpasta do Gemini)
if (prompt.includes('arte-teste')) {
  writeFileSync(join(process.cwd(), 'variacao.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
  texto = 'Criei variacao.svg com tres variacoes.';
}
// duelo: escreve uma versao propria do site na copia dele
if (prompt.includes('criar-site')) {
  mkdirSync(process.cwd(), { recursive: true });
  writeFileSync(join(process.cwd(), 'index.html'), '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Versao do Gemini</title></head><body><h1>Versao do Gemini</h1></body></html>');
  writeFileSync(join(process.cwd(), 'so-do-gemini.txt'), 'arquivo criado so pelo gemini');
  texto = 'Criei o site do meu jeito em index.html.';
}

if (formato === 'stream-json') {
  console.log(JSON.stringify({ type: 'system', subtype: 'init', conversation_id: valor('--conversation') ?? 'agy-falso-1' }));
  console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: texto }] } }));
  console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: texto }));
} else {
  console.log(texto);
}
