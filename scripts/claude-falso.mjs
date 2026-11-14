// "claude" de mentira, so pra testes de interface e de layout: nao gasta mensagem da assinatura.
// Le o prompt da entrada padrao e responde no formato do `claude -p --output-format stream-json`.
import { appendFileSync, readFileSync } from 'node:fs';

const prompt = readFileSync(0, 'utf8');
const args = process.argv.slice(2);
const sid = args.includes('--resume') ? args[args.indexOf('--resume') + 1] : 'sessao-falsa-' + Date.now();
// os testes de acervo conferem o que o HRZZ mandou: argumentos e prompt de cada chamada
if (process.env.HRZZ_FALSO_LOG) appendFileSync(process.env.HRZZ_FALSO_LOG, JSON.stringify({ prompt, cwd: process.cwd() }) + '\n');
const out = (o) => console.log(JSON.stringify(o));
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

out({ type: 'system', subtype: 'init', session_id: sid });

// tarefa em segundo plano que demora (testa cancelar)
if (prompt.includes('lento')) await pausa(3500);

// limite da assinatura batido
if (prompt.includes('limite-teste')) {
  out({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt: Math.floor(Date.now() / 1000) + 3600, unifiedWindows: { five_hour: { utilization: 1, resetsAt: Math.floor(Date.now() / 1000) + 3600 } } } });
  out({ type: 'result', subtype: 'success', is_error: true, session_id: sid, result: "You've hit your usage limit · resets in 1 hour", permission_denials: [] });
  process.exit(0);
}

// dueto: faz o papel do Claude Code com --mcp-config: sobe o servidor MCP do HRZZ, lista as ferramentas e chama pedir_ao_gemini
// (o .cmd de mentira do Windows corta os argumentos no primeiro enter do prompt de fundo: os argumentos inteiros vem do registro do servidor)
const argsInteiros = (() => {
  try {
    const linhas = readFileSync(process.env.HRZZ_REGISTRAR_CHAMADAS, 'utf8').split(String.fromCharCode(10)).filter(Boolean);
    return JSON.parse(linhas[linhas.length - 1]).args;
  } catch {
    return args;
  }
})();
if (prompt.includes('dueto-teste') && argsInteiros.includes('--mcp-config')) {
  const { spawn } = await import('node:child_process');
  const cfg = JSON.parse(readFileSync(argsInteiros[argsInteiros.indexOf('--mcp-config') + 1], 'utf8'));
  const servidor = Object.values(cfg.mcpServers)[0];
  const filho = spawn(servidor.command, servidor.args, { env: { ...process.env, ...servidor.env }, stdio: ['pipe', 'pipe', 'inherit'] });
  const esperando = new Map();
  let buf = '';
  filho.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const linha = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (linha.trim()) {
        const m = JSON.parse(linha);
        esperando.get(m.id)?.(m);
      }
    }
  });
  const chamar = (id, method, params) =>
    new Promise((res) => {
      esperando.set(id, res);
      filho.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  await chamar(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-falso', version: '0' } });
  filho.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const lista = await chamar(2, 'tools/list', {});
  const nome = lista.result?.tools?.[0]?.name;
  const entrada = { tarefa: 'arte-teste: tres variacoes do logo', arquivos: ['index.html', '../fora.txt'] };
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tg1', name: 'mcp__hrzz-gemini__' + nome, input: entrada }] } });
  const r = await chamar(3, 'tools/call', { name: nome, arguments: entrada });
  out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tg1', is_error: !!r.result?.isError, content: r.result?.content ?? [] }] } });
  const texto = 'O Gemini fez as variacoes; revisei e ficaram boas.';
  out({ type: 'assistant', message: { content: [{ type: 'text', text: texto }] } });
  out({ type: 'result', subtype: 'success', is_error: false, session_id: sid, permission_denials: [] });
  filho.stdin.end();
  process.exit(0);
}

if (prompt.includes('apagar')) {
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'rm -rf ./dist' } }] } });
  out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', is_error: true, content: 'negado' }] } });
  out({ type: 'assistant', message: { content: [{ type: 'text', text: 'Não consegui apagar a pasta dist: o comando foi negado.' }] } });
  out({ type: 'result', subtype: 'success', is_error: false, session_id: sid, permission_denials: [{ tool_name: 'Bash', tool_input: { command: 'rm -rf ./dist' } }] });
  process.exit(0);
}

// "criar-site": escreve um index.html de verdade na pasta do projeto (cwd) e avisa como o claude real faria
if (prompt.includes('criar-site')) {
  const { writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const arq = join(process.cwd(), 'index.html');
  const versao = prompt.includes('de novo') ? 'segunda' : 'primeira';
  writeFileSync(
    arq,
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>BHZ Optica</title><style>body{font:16px system-ui;margin:0}header{background:#C0392B;color:#fff;padding:10px 14px}main{padding:14px}.cartao{border:1px solid #ddd;border-radius:8px;padding:10px;margin-top:10px}</style></head><body><header><b>BHZ Optica</b></header><main><h1>Enxergue bem, com estilo.</h1><p>Oculos de grau, solares e lentes no Street Shopping Planalto.</p><div class="cartao"><span>Saiba mais</span></div><div class="cartao"><span>Saiba mais</span></div><p id="contato">Contato</p><!-- ${versao} --></main></body></html>`,
  );
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tw1', name: 'Write', input: { file_path: arq, content: 'x' } }] } });
  out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tw1', content: 'ok' }] } });
  out({ type: 'assistant', message: { content: [{ type: 'text', text: 'Criei o site em index.html.' }] } });
  out({ type: 'result', subtype: 'success', is_error: false, session_id: sid, permission_denials: [] });
  process.exit(0);
}

out({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'thinking' } } });
out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'vou olhar o pedido' } } });
await pausa(150);
out({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'vou olhar o pedido' }] } });
out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tu2', name: 'Read', input: { file_path: 'C:\\projetos\\bhzotica.site\\src\\componentes\\Menu.astro' } }] } });
await pausa(100);
out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu2', content: 'ok' }] } });
out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tu3', name: 'Write', input: { file_path: 'C:\\projetos\\bhzotica.site\\src\\componentes\\MenuMobileComUmNomeMuitoLongoDeArquivoParaTestarOverflowDoResumo.astro', content: 'x' } }] } });
out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu3', content: 'ok' }] } });

const texto = `Troquei o menu por um cartão de ícones. Resumo do que mudou:

- alvo de toque de 44 px em todos os links
- ícones de linha fina, igual ao resto
- link muito comprido pra testar quebra: https://exemplo.com.br/um/caminho/muito/longo/que/nao/tem/espacos/e/precisa/quebrar/sem/vazar/pela/lateral/da/mensagem

| item | antes | depois |
|---|---|---|
| menu | tela cheia | cartão |
| links | 4 | 4 |

\`\`\`css
.menu-mobile { display: grid; grid-template-columns: repeat(4, 44px); gap: 8px; justify-content: center; align-items: center; padding: 12px 16px; }
\`\`\`

<pergunta>
Qual ícone fica no lugar do endereço?
- mapa
- pin
- outro
</pergunta>
<progresso>
[x] trocar o menu por cartão de ícones
[~] conferir os alvos de 44 px
[ ] rodar a auditoria
</progresso>`;

for (let i = 0; i < texto.length; i += 40) {
  out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: texto.slice(i, i + 40) } } });
  await pausa(15);
}
out({ type: 'assistant', message: { content: [{ type: 'text', text: texto }] } });
out({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', unifiedWindows: { five_hour: { utilization: prompt.includes('cota-alta') ? 0.85 : 0.42, resetsAt: Math.floor(Date.now() / 1000) + 5400 }, seven_day: { utilization: 0.18 } } } });
out({ type: 'result', subtype: 'success', is_error: false, session_id: sid, total_cost_usd: 0.002, usage: { input_tokens: 10, output_tokens: 50 }, permission_denials: [] });
