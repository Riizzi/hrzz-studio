# Etapas de construção

Duas fases:

- **Fase PC (etapas 0 a 7):** o HRZZ inteiro rodando no PC do João. É construída sozinha pelo `scripts/montar-tudo.ps1`, só com o Claude (Sonnet 5.5), sem o agy.
- **Fase hospedagem (etapa 8):** levar pro servidor dividido. Feita junto com o João, depois.

Cada etapa termina com algo que o João consegue usar e testar. Chame com `/etapa N` no Claude Code. Marque `[x]` quando um item estiver pronto **e testado**.

---

## Etapa 0: Fundação

Objetivo: o esqueleto de pé, abrindo a interface vazia mas com o visual certo.

- [x] `npm install` na raiz instala os workspaces `apps/servidor` e `apps/web`
- [x] `scripts/checar.ps1` mostra as versões (git, node, python, uv, ffmpeg, yt-dlp, claude, agy), avisa se `ANTHROPIC_API_KEY` existir e testa se o `claude` está logado (via `claude auth status`, sem gastar mensagem)
- [x] servidor Fastify em `127.0.0.1:7000` com `/api/saude`
- [x] web React + Vite com os tokens de `03-design.md` e a casca do layout: barra lateral, faixa de cima, chat, painel e telas vazias navegáveis, igual ao protótipo
- [x] `npm run dev` sobe servidor e web juntos (Vite na 7001 com proxy pra 7000)
- [x] `npm run testar:layout` passa sem vazamento em 1280, 960, 760, 620, 420 e 360 px
- [x] floresta animada portada pro componente `Floresta.tsx`, com os pinheirinhos dos cantos

**Teste do João:** abrir `localhost:7001`, recolher e abrir a barra, abrir e fechar o painel, diminuir a janela até o tamanho de celular.

---

## Etapa 1: Conversa

Objetivo: conversar com o Claude e com o Gemini com qualidade igual ao claude.ai.

- [x] motor Claude (`ia/claude.ts`) rodando o `claude` oficial em modo headless com fluxo de eventos (ver `02-ias.md`), sessão guardada e retomada
- [~] motor agy (`ia/agy.ts`) com lista de modelos vinda do próprio agy (a lista de modelos vem do `agy models` e foi testada; o fluxo de resposta do agy não foi testado: ver `pendencias-do-joao.md`)
- [~] seletor de modelo dividido por empresa, botões de pensamento, esforço e web ligados de verdade (modelo, esforço e web testados com o claude real; o pensamento só esconde ou aprofunda, o claude não deixa desligar: ver `08-decisoes.md`)
- [x] modos de permissão Yolo, Mid e Intern, com Mid como padrão (ver `02-ias.md`)
- [x] escolha automática de modelo em conversa nova (regras em `02-ias.md`)
- [x] PIN em todas as rotas, lembrado 30 dias por aparelho (ver `05`)
- [x] mensagens em fluxo pelo WebSocket, pensamento recolhido ("pensou por N s"), uso de ferramentas visível, perguntas de múltipla escolha clicáveis
- [x] SQLite: conversas, mensagens, projetos (nome + pasta), busca (`ctrl+k`)
- [x] projetos na barra lateral; conversa nova dentro de um projeto roda com `cwd` na pasta dele
- [~] anexos (imagem, pdf, docx, txt) enviados pro modelo (imagem e txt testados com o claude real; pdf e docx vão pelo caminho do arquivo e ficam pro João testar)
- [x] progresso: aba "progresso" no painel + chip no topo do chat, alimentados pela lista de tarefas da IA (ver `02-ias.md`), com itens manuais, visão "conversa" e "projeto"
- [x] memória e preferências básicas: lidas de `dados/memoria/*.md` e passadas em toda conversa
- [x] botão "atualizar" e "voltar versão" (ver `06`) (testado com repositórios git temporários; no HRZZ real depende do GitHub ligado: ver pendências)
- [~] vigia + iniciar com o Windows (`iniciar.ps1 -Instalar`) (vigia pronto e testado; `iniciar.ps1 -Instalar` é ligado pelo `montar-tudo.ps1` no fim)
- [~] **teste de qualidade** com `/qualidade`: as mesmas 10 perguntas no HRZZ e no claude.ai, com as respostas comparadas em `docs/qualidade.md` (lado HRZZ rodado com o Sonnet 5.5 e gravado em `docs/qualidade.md`; falta o lado claude.ai, que só o João faz)

**Teste do João:** usar o HRZZ por um dia no lugar do claude.ai e anotar diferenças.

---

## Etapa 2: Trabalho (preview e companhia)

- [x] proxy do preview `/preview/:porta` com o `hrzz-preview.js` injetado
- [x] detectar e subir o servidor de dev do projeto (`npm run dev`), mostrando a porta
- [x] ponto de retorno escondido antes de cada mudança + botão "desfazer última mudança"
- [x] versões só no botão "salvar versão" (commits em `hrzz/versoes`), com histórico
- [x] painel abre sozinho quando o preview atualiza, com a borda piscando em âmbar uma vez
- [x] antes/depois com o controle deslizante (capturas das duas versões via Playwright)
- [x] editar texto no preview: mudança simples grava direto no arquivo-fonte (busca do texto exato; se for ambíguo, manda pro Claude), com ponto de retorno pra desfazer
- [x] rabiscar: o desenho vira imagem anexada à próxima mensagem
- [x] ver no celular (360 px) e abrir por completo
- [~] terminal (pty + xterm.js) na pasta do projeto, com o prompt do Illuminati (roda na pasta do projeto e carrega o perfil do PowerShell, onde mora o prompt; ver o visual: pendências)
- [x] arquivos: árvore da pasta; docx, xlsx e pdf com pré-visualização
- [x] documentos e planilhas criados com as skills da Anthropic (docx, xlsx, pptx, pdf) (testado com o `claude` real: criou `vendas.xlsx` pela skill e a aba arquivos mostrou a tabela)
- [x] galeria com filtros

**Teste do João:** abrir um projeto, pedir uma mudança no site e ver o painel abrir sozinho; editar um texto no preview, desfazer, salvar uma versão e comparar antes/depois; abrir o terminal e a galeria; pedir uma planilha e um documento.

---

## Etapa 3: Transcrição

Tudo de `04-transcricao.md`:

- [x] `servicos/transcritor` com `uv`, subindo junto no `npm run dev` e no vigia (os dois sobem o Python, mantêm de pé e passam a chave; `npm run transcritor` roda só ele; testado nos dois)
- [x] arquivo: soltar, escolher idioma (99 do Whisper) e modelo, progresso na fila, baixar `.txt` e `.srt` (testado no servidor e no navegador, com cancelamento e fila)
- [x] YouTube via yt-dlp (baixa só o áudio; testado com uma palestra curta de verdade e com link ruim)
- [x] ao vivo: microfone (navegador), áudio do PC (WASAPI loopback), os dois misturados (microfone testado no Chromium com microfone de mentira; áudio do PC e os dois testados tocando uma fala nas caixas de som e capturando; falta só a sua voz de verdade: ver pendências)
- [x] mandar pro chat e comando `/ata` (o `/ata` foi testado com o `claude` de mentira; anexo de `.txt` com o `claude` real já tinha sido testado na etapa 1)
- [x] medição de desempenho anotada em `08-decisoes.md`

**Teste do João:** transcrever uma reunião de verdade (arquivo), colar um link do YouTube, gravar ao vivo com "os dois juntos" numa reunião no navegador, mandar uma transcrição pro chat e usar `/ata`.

---

## Etapa 4: Acervo

- [x] tela de memória: listar, editar e criar arquivos `.md` (com subpastas); importar export da memória do claude.ai (testado no servidor e no navegador, com a IA lendo o arquivo editado; o importador foi testado com textos de exemplo, a memória real do João fica nas pendências)
- [x] skills: listar as do João e as da Anthropic, ligar e desligar por projeto (testado com o `claude` real: skill do HRZZ ligada é usada, desligada é bloqueada; ver `02-ias.md`)
- [x] comandos salvos com `/` no campo de texto (`/grillme`, `/site-loja`, `/revisar`, `/ata`...) e tela pra criar novos (menu com setas, tab, enter e esc testado no navegador)
- [x] revisor de texto (`/revisar`: skills estilo-joao-pedro + humanizer) (testado com o `claude` real: chamou as duas skills em ordem e devolveu o texto com a lista do que mudou; se o resultado soa como o João, ele confere: pendências)
- [x] modelos de projeto (site de loja em Astro, app Retro Ledger, relatório institucional) (criam a pasta com o `CLAUDE.md` e abrem a conversa com o pedido pronto; os textos são uma primeira versão: pendências)

---

## Etapa 5: IA junta

- [~] dueto (botão das pessoinhas): Claude coordena e delega pro Gemini via MCP local (testado com o `claude` real e o `agy` de mentira: o Claude Code carrega o servidor MCP e chama `pedir_ao_gemini`; falta ver com o Gemini de verdade: ver pendências)
- [~] duelo (botão das espadas): respostas lado a lado, "usar essa", cópias separadas (testado com o `claude` real e o `agy` de mentira; falta ver com o Gemini de verdade: ver pendências)
- [x] guardião de cota com aviso e troca pro Haiku (aviso a partir de 80%, "usar o Haiku até renovar" e bloco de limite batido; o texto exato do erro de limite do `claude` real não deu pra provocar: ver pendências)
- [x] fila em segundo plano + agendamentos (uma tarefa por vez, cada uma vira uma conversa; cron de 5 campos)
- [x] auditoria com um clique (estouro, alvos de 44 px, axe, contraste) e "pedir pro Claude corrigir"

---

## Etapa 6: Integrações

- [~] tela de conectores: GitHub, Google (Drive, Docs, Planilhas, Agenda, Gmail), Vercel, Cloudflare, Supabase, via MCP no Claude Code (`mcp.json` em `dados/segredos/`) (tela, `mcp.json`, teste de token, regras por modo, cartão de permissão e bloqueio pela Cloudflare testados; o Google Drive do João foi testado de verdade com o `claude` (cartão e uso livre); falta testar com tokens e logins de verdade do GitHub, Cloudflare, Supabase, Vercel, Agenda e Gmail: ver `pendencias-do-joao.md`)
- [~] painel do dia: agenda, repositórios, pendências das conversas e uso (repositórios locais, pendências, uso e fila testados no servidor e no navegador; GitHub testado com um GitHub de mentira; a agenda foi testada com o `claude` de mentira, falta o Google Agenda de verdade: ver `pendencias-do-joao.md`)

---

## Etapa 7: Fechamento no PC

Objetivo: o HRZZ 100% usável no PC do João, pronto pra uso diário, antes de hospedar. É a última etapa da **fase PC** (construída sozinha pelo `scripts/montar-tudo.ps1`).

- [x] ditado por voz no campo de texto (usa o transcritor, modelo `small`) (botão do microfone no chat: grava, transcreve na rota `/ditado` sem salvar nada e põe o texto no cursor; `Esc` descarta. Testado no navegador com microfone de mentira, no servidor com PIN e erros, e o `small` na placa de vídeo: 28 s de fala em 3,2 s na primeira vez e 0,6 s depois. A voz real do João fica nas pendências)
- [x] backup local diário às 03:00 em `dados/backups/` (cópia segura do SQLite + memória + skills + comandos + textos das transcrições), guardando os últimos 14; botão "fazer backup agora" em "acesso e ajustes" (`backup.ts`; testado: conteúdo, segredos fora, rotação, nome repetido, pasta alheia, instalação vazia, rotas com PIN e o botão no navegador. Se o PC estiver desligado às 03:00, faz um backup uns 2 minutos depois de ligar. Como restaurar: `06-atualizacao-e-backup.md`)
- [x] build de produção (`npm run build`) e o vigia servindo a versão compilada em `127.0.0.1:7000` (subido de verdade pelo lançador oculto, com pasta de dados temporária: servidor em 7000, transcritor em 7100 e a interface compilada na raiz; derrubar o servidor faz o vigia subir de novo, e um segundo vigia na mesma porta sai sozinho)
- [x] `scripts/iniciar.ps1 -Instalar` pronto pra abrir o vigia com o Windows, sem janela, sem rodar aqui (o `montar-tudo.ps1` liga no fim). A tarefa abre `scripts/vigia-oculto.vbs` pelo `wscript.exe` (sem janela, ao contrário de abrir o `node` direto); ganhou `-Status` e `-Parar`. Verificado: sintaxe do script, a ação da tarefa, o lançador subindo o HRZZ escondido, `-Status` e `-Parar` desligando vigia, servidor e transcritor. Não registrei a tarefa de verdade (o início automático é do `montar-tudo.ps1`)
- [x] revisão geral: todos os testes (`npm run testar:tudo`: 114 do servidor, vigia, Python, transcrição, acervo, IA junta, conectores, interface e layout nas 6 larguras), `npm run checar`, PIN em todas as rotas (teste novo `seguranca.test.ts` varre todas as rotas e websockets registrados e confere 401 sem o cookie) e nenhum erro no console do navegador nas telas principais
- [x] `docs/pendencias-do-joao.md` revisado: o que não depende mais dele saiu, o que sobrou tem o comando exato, e há uma lista "Faça primeiro" no topo
- [x] README atualizado com "como usar no dia a dia"

**Teste do João:** usar o HRZZ por alguns dias no PC, anotar o que ajustar.

---

## Etapa 8: Hospedagem (fase servidor, feita junto com o João)

Fora da construção automática: depende das contas dele e do servidor dividido.

- [ ] servidor dividido: confirmar empresa e quem é admin
- [ ] passo a passo de instalação no servidor (Linux): container, Tailscale próprio, login do claude e do agy, portas
- [ ] Tailscale + PWA no celular
- [ ] Cloudflare Tunnel + Access (código por e-mail) + terminal bloqueado nesse caminho
- [ ] domínio pro link do trabalho e do pitch
- [ ] link de pitch temporário público
- [ ] avisos no celular (ntfy ou Web Push)
- [ ] backup diário também em `Riizzi/hrzz-dados`
