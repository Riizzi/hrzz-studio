// "claude" de mentira, so pra testes de interface e de layout: nao gasta mensagem da assinatura.
// Le o prompt da entrada padrao e responde no formato do `claude -p --output-format stream-json`.
import { readFileSync } from 'node:fs';

const prompt = readFileSync(0, 'utf8');
const args = process.argv.slice(2);
const sid = args.includes('--resume') ? args[args.indexOf('--resume') + 1] : 'sessao-falsa-' + Date.now();
const out = (o) => console.log(JSON.stringify(o));
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

out({ type: 'system', subtype: 'init', session_id: sid });

if (prompt.includes('apagar')) {
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'rm -rf ./dist' } }] } });
  out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', is_error: true, content: 'negado' }] } });
  out({ type: 'assistant', message: { content: [{ type: 'text', text: 'Não consegui apagar a pasta dist: o comando foi negado.' }] } });
  out({ type: 'result', subtype: 'success', is_error: false, session_id: sid, permission_denials: [{ tool_name: 'Bash', tool_input: { command: 'rm -rf ./dist' } }] });
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
out({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', unifiedWindows: { five_hour: { utilization: 0.42, resetsAt: Math.floor(Date.now() / 1000) + 5400 }, seven_day: { utilization: 0.18 } } } });
out({ type: 'result', subtype: 'success', is_error: false, session_id: sid, total_cost_usd: 0.002, usage: { input_tokens: 10, output_tokens: 50 }, permission_denials: [] });
