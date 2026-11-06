# apps/servidor

Node 22 + TypeScript. Montado na etapa 0; o resto entra etapa por etapa.

Módulos previstos (`src/`):

| Módulo | O que faz | Etapa |
|---|---|---|
| `index.ts` | Fastify em 127.0.0.1:7000, serve a web compilada | 0 |
| `config.ts` | portas, pastas, opções (variáveis de ambiente com padrão) | 0 |
| `banco.ts` | SQLite em `dados/hrzz.db` e migrações | 1 |
| `ia/claude.ts` | `claude -p` em fluxo (ver `docs/02-ias.md`) | 1 |
| `ia/agy.ts` | `agy -p` em fluxo | 1 |
| `ia/dueto.ts`, `ia/duelo.ts` | os dois juntos | 5 |
| `memoria.ts` | lê `dados/memoria/*.md` e monta as instruções de fundo | 1 |
| `projetos.ts` | projetos, pastas, servidores de dev | 1 e 2 |
| `git.ts` | versões, antes/depois, voltar | 2 |
| `preview.ts` | proxy `/preview/:porta` + injeção do `hrzz-preview.js` | 2 |
| `terminal.ts` | pty pro xterm.js | 2 |
| `auditoria.ts` | Playwright + axe | 5 |
| `fila.ts` | tarefas em segundo plano e agendamentos | 5 |
| `conectores.ts` | `mcp.json` dos conectores | 6 |
| `acesso.ts` | PIN, cookies, detecção do caminho Cloudflare | 7 |
| `atualizar.ts` | git pull, build, reinício, voltar versão | 1 |
