# Arquitetura

## Visão geral

```
 celular / notebook             PC do trabalho
   (Tailscale)            (Cloudflare: código por e-mail + PIN)
        \                          /
         \                        /
   ┌──────────── PC do João (Windows 11) ────────────┐
   │                                                  │
   │  apps/servidor  (Node, 127.0.0.1:7000)           │
   │   ├─ serve a interface (apps/web já compilada)   │
   │   ├─ API REST + WebSocket (streaming)            │
   │   ├─ processos: claude -p ...  /  agy -p ...     │
   │   ├─ terminal (pty) e arquivos dos projetos      │
   │   ├─ git: versões, antes/depois, voltar          │
   │   ├─ proxy do preview (/preview/:porta)          │
   │   ├─ fila de tarefas e agendamentos              │
   │   └─ SQLite em dados/hrzz.db                     │
   │                                                  │
   │  servicos/transcritor (Python, 127.0.0.1:7100)   │
   │   └─ faster-whisper, yt-dlp, ffmpeg, WASAPI      │
   │                                                  │
   │  sites dos projetos em dev (4321, 5173...)       │
   └──────────────────────────────────────────────────┘
                         │
          GitHub: Riizzi/hrzz-studio (código)
          GitHub: Riizzi/hrzz-dados (backup privado)
```

Hoje tudo roda no PC. A decisão de ir pra uma VPS ficou em aberto (`08-decisoes.md`). O código precisa rodar em Linux sem reescrever, então:

- nenhum caminho fixo do Windows no código; tudo sai de `config` (variáveis de ambiente com valores padrão);
- o que só existe no Windows (áudio do PC na transcrição, iniciar com o Windows) fica isolado num módulo próprio e desliga sozinho em outro sistema.

## Peças

### apps/servidor (Node 22 LTS + TypeScript)

- **HTTP e WebSocket:** Fastify + `@fastify/websocket` (ou equivalente leve).
- **Banco:** SQLite num arquivo só, `dados/hrzz.db`. Preferir `better-sqlite3`, que tem binário pronto pra Windows x64. Se der problema, usar o `node:sqlite` nativo.
- **Processos de IA:** um módulo `ia/` com dois "motores" que seguem a mesma interface (`enviar(conversa, mensagem, opcoes)`, que devolve um fluxo de eventos):
  - `ia/claude.ts`: roda o binário `claude` em modo headless e lê o JSON em fluxo (ver `02-ias.md`);
  - `ia/agy.ts`: roda o `agy` em modo headless da mesma forma;
  - `ia/dueto.ts` e `ia/duelo.ts`: combinam os dois.
- **Terminal:** pty (`node-pty` ou um fork com binários prontos, como `@lydell/node-pty`) ligado ao xterm.js da interface por WebSocket. Shell padrão: PowerShell 7 se existir, senão `powershell.exe`, carregando o perfil do Illuminati quando houver.
- **Git:** chamar o `git` do sistema por processo filho, com um módulo pequeno (`git.ts`). Dois mecanismos:
  - **ponto de retorno:** antes de cada mudança da IA ou do editor do preview, o servidor guarda o estado da pasta numa referência escondida do git (ex.: `refs/hrzz/desfazer/<n>`), sem mexer na branch do João; é isso que o botão "desfazer última mudança" usa;
  - **versões:** só quando o João clica em "salvar versão". Viram commits numa branch `hrzz/versoes` do projeto, com o nome que ele der.
- **Preview:** proxy reverso `/preview/:porta/*` pros servidores de dev dos projetos. O proxy injeta `hrzz-preview.js` no HTML, que é o script do editar texto, do rabiscar e da comunicação com a interface. Assim o iframe fica na mesma origem e o editor funciona.
- **Auditoria e capturas:** Playwright (Chromium), checando estouro de layout, alvos de toque e acessibilidade (`@axe-core/playwright`).
- **Fila:** tabela `tarefas` no SQLite com um executor simples. Agendamentos no formato cron (`croner`).
- **Avisos no celular:** ntfy (app grátis, tópico privado) ou Web Push do PWA. Decidir na etapa 8 (hospedagem).

### apps/web (React + Vite + TypeScript)

- Sem framework de CSS. Variáveis CSS com os tokens de `03-design.md`, um arquivo por componente.
- Ícones: Tabler Icons (webfont ou `@tabler/icons-react`). O ícone de esforço (bracinho) é um SVG próprio, já desenhado no protótipo.
- Terminal: `@xterm/xterm`.
- Instalável como PWA, pra abrir no celular como app.
- A floresta ASCII é um componente próprio (`Floresta.tsx`), portado direto do script do protótipo.

### servicos/transcritor (Python 3.12 + FastAPI)

Serviço separado porque o Whisper é Python. O servidor Node repassa `/api/transcricao/*` pra ele. Detalhes em `04-transcricao.md`.

## Pastas de dados (`dados/`, fora do git)

```
dados/
├── hrzz.db            conversas, mensagens, versões, progresso (itens por conversa e projeto), tarefas da fila, config
├── memoria/           arquivos .md da memória (perfil, preferências, áreas...)
├── skills/            skills do João (copiadas pra .claude/skills dos projetos quando preciso)
├── comandos/          comandos salvos (/grillme, /site-loja...)
├── projetos/          (opcional) pastas de projetos criados pelo HRZZ
├── transcricoes/      .txt, .srt e .json de cada transcrição
├── anexos/            arquivos enviados no chat
├── segredos/          tokens de conectores, PIN (hash), nunca sincronizado
└── logs/
```

Os projetos podem morar em qualquer pasta do PC, como `C:\Users\jpriz\projetos\bhzotica.site`. O HRZZ só guarda o caminho.

## Fluxo de uma mensagem

1. A interface manda `{conversa, texto, modelo, pensamento, esforco, web, anexos}` pelo WebSocket.
2. O servidor monta o prompt: memória + preferências + instruções do projeto + skills relevantes + anexos.
3. O motor escolhido roda o processo. Cada linha de JSON vira um evento: `pensando`, `texto`, `ferramenta`, `arquivo_alterado`, `pergunta`, `fim`, `erro`.
4. A interface desenha os eventos conforme chegam. Eventos de lista de tarefas viram `progresso` e atualizam a aba de progresso e o chip do topo do chat. Se algum arquivo do projeto mudou, o servidor já tinha guardado o ponto de retorno antes, e manda `preview_atualizado`. O painel da direita abre sozinho se a opção estiver ligada. Versão nova só nasce quando o João clica em "salvar versão".
5. Tudo é salvo no SQLite, inclusive o id de sessão do `claude` e do `agy`, pra continuar a conversa depois.

## Portas (padrão, todas em 127.0.0.1)

| Porta | O que é |
|---|---|
| 7000 | HRZZ (interface + API) |
| 7001 | Vite em modo de desenvolvimento do próprio HRZZ |
| 7100 | transcritor |
| outras | servidores de dev dos projetos (4321, 5173, 3000...) |
