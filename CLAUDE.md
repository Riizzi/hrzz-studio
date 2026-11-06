# HRZZ STUDIO: instruções pro Claude Code

Este arquivo é lido por você (Claude Code) toda vez que abre esta pasta. Leia inteiro antes de qualquer tarefa.

## Quem é o usuário

- João Pedro Rizzi (GitHub: `Riizzi`), de Belo Horizonte. Analista técnico no governo de MG, estudante de Ciências Sociais na UFMG. Não é dev de profissão, mas é bem técnico e já montou vários apps com IA.
- Fala português do Brasil. Responda sempre em português, em tom direto e informal, sem jargão desnecessário.
- Usa Windows 11 num notebook i7 13ª geração com 8 GB de RAM, com monitor externo em casa. O terminal dele é o WezTerm com o layout "Illuminati" (PowerShell).
- Quando houver uma decisão real a tomar, pergunte em **múltipla escolha** (2 a 4 opções, com a recomendada primeiro). Não faça entrevistas longas.
- Ele vai rodar tudo pelo terminal. Comandos que ele precisa digitar vão em blocos de código PowerShell, um por linha, sem `&&` (o PowerShell 5 não aceita).

## O que é o HRZZ STUDIO

Um app pessoal, aberto no navegador, que junta num lugar só:

- conversa com o Claude (assinatura dele) e com o Gemini via `agy` (assinatura Google AI Plus), separados ou juntos (dueto e duelo);
- preview de artefatos (sites, documentos, planilhas) com versões, editar texto direto no preview, rabiscar, antes/depois e auditoria;
- terminal, arquivos, galeria, memória, skills, comandos salvos e conectores (GitHub, Google etc.);
- transcrição de áudio local (arquivo, YouTube e ao vivo);
- acesso pelo celular (Tailscale) e pelo PC do trabalho (Cloudflare com código por e-mail + PIN).

O protótipo aprovado está em `docs/prototipo.html`. Ele é a referência visual oficial: abra no navegador antes de mexer em qualquer tela.

## Documentação (leia o que for relevante antes de codar)

| Arquivo | Quando ler |
|---|---|
| `docs/01-arquitetura.md` | sempre, antes da primeira tarefa da sessão |
| `docs/02-ias.md` | qualquer coisa que envolva Claude ou agy |
| `docs/03-design.md` | qualquer coisa visual |
| `docs/04-transcricao.md` | seção de transcrição |
| `docs/05-acesso-e-seguranca.md` | rede, login, PIN, Tailscale, Cloudflare |
| `docs/06-atualizacao-e-backup.md` | atualizar, voltar versão, backup, iniciar com o Windows |
| `docs/07-etapas.md` | plano de construção, com checklist de cada etapa |
| `docs/08-decisoes.md` | decisões já tomadas e perguntas em aberto |

## Regras que não podem ser quebradas

1. **Assinatura do Claude só pelo binário oficial.** O HRZZ conversa com o Claude rodando o `claude` (Claude Code) oficial, sem modificação, como processo filho. O login é feito pelo próprio João no terminal, pelo fluxo da Anthropic. O HRZZ **nunca** lê, copia, guarda ou repassa credenciais ou tokens do Claude (`~/.claude/.credentials.json` e similares). Não use o Agent SDK com login de assinatura. Detalhes e motivo em `docs/02-ias.md`.
2. **Nunca defina `ANTHROPIC_API_KEY`** em lugar nenhum (código, `.env`, scripts). Se ela existir no ambiente, o Claude Code passa a cobrar pela API em vez de usar a assinatura. O `scripts/checar.ps1` avisa se ela estiver definida.
3. **Windows primeiro, Linux compatível.** Tudo tem que rodar no Windows 11 dele. Use `path.join`, nada de comandos só de bash, e scripts de sistema em PowerShell. O código também precisa rodar num Linux (VPS) no futuro, sem reescrever.
4. **Scripts `.ps1` só com caracteres ASCII** (sem acento). O PowerShell 5 lê UTF-8 sem BOM como ANSI e quebra os acentos. Isso já deu problema no Illuminati.
5. **Fidelidade visual ao protótipo.** Mesmas cores, tamanhos, ícones e comportamento responsivo. Antes de fechar qualquer mudança visual, rode `npm run testar:layout` (ver `scripts/testar-layout.mjs`): nada pode vazar pelas laterais em 1280, 960, 760, 620, 420 e 360 px.
6. **Escuta só em `127.0.0.1`.** Os servidores nunca abrem porta pra rede diretamente. O acesso de fora passa pelo Tailscale ou pelo Cloudflare (ver `docs/05`).
7. **Dados pessoais ficam em `dados/`**, que é ignorado pelo git. Nada de conversa, memória, transcrição ou segredo vai pro repositório de código.
8. **Sem linguagem promocional na interface.** Textos curtos, em minúsculas, descrevendo o que a coisa faz.
9. **Commits pequenos, mensagem em português.** Pode fazer commit sempre que fechar uma parte que funciona. **Push só quando o João pedir.**
10. **Não decida pelo João.** Itens marcados como proposta "a confirmar" ou "em aberto" em `docs/08-decisoes.md` precisam ser perguntados a ele (múltipla escolha) antes de implementar. Se surgir uma escolha nova de estrutura ou de comportamento, pergunte também, em vez de escolher sozinho. Detalhes puramente técnicos e invisíveis pra ele (nome de variável, organização interna de arquivos) você decide.
11. **Não invente flags.** Antes de usar qualquer opção do `claude`, do `agy`, do `yt-dlp` ou do `ffmpeg`, confirme com `--help` na máquina dele. As versões mudam.

## Como trabalhar

- O trabalho é por etapas (`docs/07-etapas.md`). O João chama com `/etapa N`. Siga o comando em `.claude/commands/etapa.md`.
- No começo de cada etapa: leia os docs relevantes, monte uma lista de tarefas curta e mostre pra ele em 5 a 10 linhas antes de começar.
- No fim de cada etapa:
  - rode os checks (`npm run checar`, `npm run testar:layout`, testes da etapa);
  - marque o checklist em `docs/07-etapas.md`;
  - registre decisões novas em `docs/08-decisoes.md`;
  - diga em poucas linhas o que ele precisa testar com as próprias mãos.
- Se uma etapa depender de algo que só ele pode fazer (login, instalar um app, criar uma conta), pare e passe o passo a passo exato.
- Prefira bibliotecas com binários prontos pra Windows. Evite depender do Visual Studio Build Tools. Se uma lib nativa for inevitável, avise antes.

## Estrutura do repositório

```
hrzz-studio/
├── CLAUDE.md              este arquivo
├── README.md              visão geral e como rodar
├── PASSO-A-PASSO.md       primeiros passos do João no terminal
├── package.json           workspaces e scripts gerais
├── .claude/commands/      comandos /etapa, /revisar-visual, /qualidade, /status
├── apps/
│   ├── servidor/          Node + TypeScript: API, WebSocket, processos do claude e do agy, git, proxy do preview
│   └── web/               React + Vite + TypeScript: a interface
├── servicos/
│   └── transcritor/       Python + FastAPI + faster-whisper (porta 7100)
├── scripts/               instalar.ps1, checar.ps1, iniciar.ps1, testar-layout.mjs
├── docs/                  documentação e prototipo.html
└── dados/                 (ignorado pelo git) banco, memória, transcrições, projetos, segredos
```
