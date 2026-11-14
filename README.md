# HRZZ STUDIO

Estúdio pessoal de IA do João Pedro, no estilo Retro Ledger escuro:

- conversa com o **Claude** (assinatura) e com o **Gemini** via `agy` (Google AI Plus), separados, em dueto ou em duelo;
- **preview** de sites, documentos e planilhas, com versões, editar texto direto, rabiscar, antes/depois e auditoria;
- terminal, arquivos, galeria, memória, skills, comandos salvos e conectores;
- **transcrição local** de arquivo, YouTube e ao vivo (microfone e áudio do PC);
- acesso pelo celular (Tailscale) e pelo PC do trabalho (Cloudflare + código por e-mail + PIN).

Protótipo navegável: abra `docs/prototipo.html` no navegador.

## Jeito rápido: um script só (fase PC)

Siga o **[COMO-RODAR-NO-PC.md](COMO-RODAR-NO-PC.md)**. Em resumo, no PowerShell (ou no Illuminati):

```powershell
git clone https://github.com/Riizzi/hrzz-studio.git "$HOME\projetos\hrzz-studio"
cd "$HOME\projetos\hrzz-studio"
powershell -ExecutionPolicy Bypass -File .\scripts\montar-tudo.ps1
```

O script cuida de tudo:

- faz a checagem inicial (programas, login do Claude e do GitHub) nos primeiros minutos;
- constrói sozinho as etapas 0 a 7 com o Sonnet 5.5, sem o agy, esperando quando bate o limite e continuando de onde parou;
- no fim, liga o HRZZ com o Windows e abre `http://localhost:7000`.

Pra acompanhar, use `-Status`. A hospedagem no servidor (etapa 8) é feita depois.

## Como começar (passo a passo manual)

Siga o [PASSO-A-PASSO.md](PASSO-A-PASSO.md). Em resumo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\instalar.ps1
npm run checar
claude
```

Dentro do Claude Code, construa por etapas: `/etapa 0`, `/etapa 1`... (plano em `docs/07-etapas.md`).

## Comandos

| Comando | O que faz |
|---|---|
| `scripts\montar-tudo.ps1` | instala, constrói a fase PC (etapas 0 a 7) sozinho e liga o HRZZ |
| `scripts\montar-tudo.ps1 -Status` | mostra o andamento da construção |
| `npm run dev` | sobe o servidor (porta 7000) e a interface (porta 7001, em `http://localhost:7001`) juntos |
| `npm run build` | compila a interface e o servidor; depois `npm start` serve tudo em `127.0.0.1:7000` |
| `npm run testar` | testes do servidor |
| `npm run testar:vigia` | derruba o servidor de propósito e confere que o vigia sobe de novo |
| `npm run testar:claude` | testa o motor com o `claude` de verdade (Haiku, poucas mensagens): modos de permissão, anexo, memória e retomada |
| `npm run testar:tudo` | roda os testes do servidor, do vigia, da interface e do layout |
| `npm run qualidade` | roda as 10 perguntas do teste de qualidade no HRZZ e grava `docs/qualidade.md` (gasta mensagens) |
| `npm run vigia` | sobe o servidor compilado e o mantém de pé (é o que o Windows abre no login) |
| `npm run tipos` | confere os tipos do TypeScript |
| `npm run testar:interface` | testa no navegador PIN, conversa, progresso, projetos, busca, barra, painel e erros no console (sobe um HRZZ isolado com um claude de mentira; com uma url usa o app que está rodando, e o PIN em `HRZZ_PIN`) |
| `npm run checar` | confere programas, versões e a chave de API |
| `npm run checar:login` | também testa se o `claude` e o `agy` respondem (gasta uma mensagem de cada) |
| `npm run testar:layout` | procura coisas vazando pelas laterais em 6 larguras de tela, com uma conversa de exemplo aberta |
| `npm run testar:prototipo` | o mesmo teste, no protótipo |
| `scripts\iniciar.ps1 -Instalar` | abre o HRZZ sozinho quando você entra no Windows  |

## Documentação

`docs/01-arquitetura.md` até `docs/08-decisoes.md`. As regras pro Claude Code estão em `CLAUDE.md`.
