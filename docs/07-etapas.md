# Etapas de construção

Cada etapa termina com algo que o João consegue usar e testar. Chame com `/etapa N` no Claude Code. Marque `[x]` quando um item estiver pronto **e testado**.

---

## Etapa 0: Fundação

Objetivo: o esqueleto de pé, abrindo a interface vazia mas com o visual certo.

- [ ] `npm install` na raiz instala os workspaces `apps/servidor` e `apps/web`
- [ ] `scripts/checar.ps1` mostra as versões (git, node, python, uv, ffmpeg, yt-dlp, claude, agy), avisa se `ANTHROPIC_API_KEY` existir e testa se o `claude` está logado
- [ ] servidor Fastify em `127.0.0.1:7000` com `/api/saude`
- [ ] web React + Vite com os tokens de `03-design.md` e a casca do layout: barra lateral, faixa de cima, chat, painel e telas vazias navegáveis, igual ao protótipo
- [ ] `npm run dev` sobe servidor e web juntos (Vite na 7001 com proxy pra 7000)
- [ ] `npm run testar:layout` passa sem vazamento em 1280, 960, 760, 620, 420 e 360 px
- [ ] floresta animada portada pro componente `Floresta.tsx`, com os pinheirinhos dos cantos

**Teste do João:** abrir `localhost:7001`, recolher e abrir a barra, abrir e fechar o painel, diminuir a janela até o tamanho de celular.

---

## Etapa 1: Conversa

Objetivo: conversar com o Claude e com o Gemini com qualidade igual ao claude.ai.

- [ ] motor Claude (`ia/claude.ts`) rodando o `claude` oficial em modo headless com fluxo de eventos (ver `02-ias.md`), sessão guardada e retomada
- [ ] motor agy (`ia/agy.ts`) com lista de modelos vinda do próprio agy
- [ ] seletor de modelo dividido por empresa, botões de pensamento, esforço e web ligados de verdade
- [ ] modos de permissão Yolo, Mid e Intern (combinar antes os pontos em aberto de `08-decisoes.md`)
- [ ] escolha automática de modelo em conversa nova (combinar as regras antes)
- [ ] mensagens em fluxo pelo WebSocket, pensamento recolhido ("pensou por N s"), uso de ferramentas visível, perguntas de múltipla escolha clicáveis
- [ ] SQLite: conversas, mensagens, projetos (nome + pasta), busca (`ctrl+k`)
- [ ] projetos na barra lateral; conversa nova dentro de um projeto roda com `cwd` na pasta dele
- [ ] anexos (imagem, pdf, docx, txt) enviados pro modelo
- [ ] progresso: aba "progresso" no painel + chip no topo do chat, alimentados pela lista de tarefas da IA (ver `02-ias.md`), com itens manuais, visão "conversa" e "projeto"
- [ ] memória e preferências básicas: lidas de `dados/memoria/*.md` e passadas em toda conversa
- [ ] botão "atualizar" e "voltar versão" (ver `06`)
- [ ] vigia + iniciar com o Windows (`iniciar.ps1 -Instalar`)
- [ ] **teste de qualidade** com `/qualidade`: as mesmas 10 perguntas no HRZZ e no claude.ai, com as respostas comparadas em `docs/qualidade.md`

**Teste do João:** usar o HRZZ por um dia no lugar do claude.ai e anotar diferenças.

---

## Etapa 2: Trabalho (preview e companhia)

- [ ] proxy do preview `/preview/:porta` com o `hrzz-preview.js` injetado
- [ ] detectar e subir o servidor de dev do projeto (`npm run dev`), mostrando a porta
- [ ] versões: cada mudança vira commit em `hrzz/versoes`; navegar v1…vN
- [ ] painel abre sozinho com versão nova, com a borda piscando em âmbar uma vez
- [ ] antes/depois com o controle deslizante (capturas das duas versões via Playwright)
- [ ] editar texto no preview: mudança simples grava direto no arquivo-fonte (busca do texto exato; se for ambíguo, manda pro Claude) e vira versão
- [ ] rabiscar: o desenho vira imagem anexada à próxima mensagem
- [ ] ver no celular (360 px) e abrir por completo
- [ ] terminal (pty + xterm.js) na pasta do projeto, com o prompt do Illuminati
- [ ] arquivos: árvore da pasta; docx, xlsx e pdf com pré-visualização
- [ ] documentos e planilhas criados com as skills da Anthropic (docx, xlsx, pptx, pdf)
- [ ] galeria com filtros

---

## Etapa 3: Transcrição

Tudo de `04-transcricao.md`:

- [ ] `servicos/transcritor` com `uv`, subindo junto no `npm run dev` e no vigia
- [ ] arquivo: soltar, escolher idioma e modelo, progresso na fila, baixar `.txt` e `.srt`
- [ ] YouTube via yt-dlp
- [ ] ao vivo: microfone (navegador), áudio do PC (WASAPI loopback), os dois misturados
- [ ] mandar pro chat e comando `/ata`
- [ ] medição de desempenho anotada em `08-decisoes.md`

---

## Etapa 4: Acervo

- [ ] tela de memória: listar, editar e criar arquivos `.md`; importar export da memória do claude.ai
- [ ] skills: listar as do João e as da Anthropic, ligar e desligar por projeto
- [ ] comandos salvos com `/` no campo de texto (`/grillme`, `/site-loja`, `/revisar`, `/ata`...) e tela pra criar novos
- [ ] revisor de texto (`/revisar`: skills estilo-joao-pedro + humanizer)
- [ ] modelos de projeto (site de loja em Astro, app Retro Ledger, relatório institucional)

---

## Etapa 5: IA junta

- [ ] dueto (botão das pessoinhas): Claude coordena e delega pro Gemini via MCP local
- [ ] duelo (botão das espadas): respostas lado a lado, "usar essa", worktrees separados
- [ ] guardião de cota com aviso e troca pro Haiku
- [ ] fila em segundo plano + agendamentos
- [ ] auditoria com um clique (estouro, alvos de 44 px, axe, contraste) e "pedir pro Claude corrigir"

---

## Etapa 6: Integrações

- [ ] tela de conectores: GitHub, Google (Drive, Docs, Planilhas, Agenda, Gmail), Vercel, Cloudflare, Supabase, via MCP no Claude Code (`mcp.json` em `dados/segredos/`)
- [ ] painel do dia: agenda, repositórios, pendências das conversas e uso

---

## Etapa 7: Fora de casa

- [ ] decidir: continuar no PC ou ir pra VPS (`08-decisoes.md`)
- [ ] Tailscale + PIN + PWA no celular
- [ ] Cloudflare Tunnel + Access (código por e-mail) + terminal bloqueado nesse caminho
- [ ] link de pitch temporário
- [ ] avisos no celular (ntfy ou Web Push)
- [ ] ditado por voz no campo de texto (usa o transcritor, modelo `small`)
- [ ] backup diário em `Riizzi/hrzz-dados`
