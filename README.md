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

## Acesso pelo PC do trabalho

`https://studio.hrzztech.com`, por um túnel da Cloudflare com código por e-mail e PIN, sem terminal. Pra ligar, siga o **[docs/tunel.md](docs/tunel.md)**.

## Como começar (passo a passo manual)

Siga o [PASSO-A-PASSO.md](PASSO-A-PASSO.md). Em resumo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\instalar.ps1
npm run checar
claude
```

Dentro do Claude Code, construa por etapas: `/etapa 0`, `/etapa 1`... (plano em `docs/07-etapas.md`).

## Como usar no dia a dia

Depois da construção, o HRZZ abre sozinho (sem janela) quando você entra no Windows, em **http://localhost:7000**. Na primeira vez, crie o PIN (4 a 12 números); depois ele é pedido só em aparelho novo e fica lembrado por 30 dias.

**Abrir e fechar**

```powershell
cd $HOME\projetos\hrzz-studio
powershell -ExecutionPolicy Bypass -File .\scripts\iniciar.ps1 -Status
powershell -ExecutionPolicy Bypass -File .\scripts\iniciar.ps1 -Parar
Start-ScheduledTask -TaskName 'HRZZ STUDIO'
```

O primeiro mostra se está ligado, o segundo desliga tudo (vigia, servidor e transcritor) e o terceiro liga de novo. Se o endereço não abrir, veja `dados\logs\vigia.log` e `dados\logs\servidor.log`.

**Rotina**

1. **Conversar:** escolha o projeto na barra da esquerda (ou crie um com a pasta do site) e peça. O painel da direita abre sozinho quando a IA mexe em arquivos: preview, progresso, terminal e arquivos. O botão das pessoinhas liga o dueto (Claude coordena e chama o Gemini); o das espadas liga o duelo (os dois respondem e você escolhe).
2. **Falar em vez de digitar:** o microfone ao lado do campo de texto grava; clique de novo pra terminar (o texto entra no campo, sem enviar) e `Esc` descarta.
3. **Trabalho longo:** mande pra fila em segundo plano ou agende (acesso e ajustes). Cada tarefa vira uma conversa.
4. **Reunião, vídeo ou aula:** tela "transcrição" (arquivo, YouTube ou ao vivo). Dali dá pra mandar o texto pro chat e pedir `/ata`.
5. **Memória e comandos:** o que está em "memória" a IA lê em toda conversa; `/` no campo abre os comandos salvos (`/revisar`, `/ata`, `/grillme`...).
6. **Desfazer:** "desfazer última mudança" no preview volta o que a IA fez; "salvar versão" guarda um ponto com nome.

**Cuidados**

- **Backup:** automático todo dia às 03:00 em `dados\backups\` (últimos 14). Se o PC estiver desligado nessa hora, sai uns minutos depois de ligar. Botão "fazer backup agora" em acesso e ajustes. Como restaurar: `docs/06-atualizacao-e-backup.md`.
- **Atualizar:** botão "atualizar" em acesso e ajustes (precisa do GitHub ligado). Deu problema, "voltar versão".
- **Cota:** o topo mostra o uso do Claude. A partir de 80% o HRZZ avisa e oferece o Haiku até renovar.
- **Login do Claude:** se parar de responder, rode `claude auth login` no terminal.
- **Não defina `ANTHROPIC_API_KEY`:** com ela o Claude Code cobra pela API em vez de usar a assinatura (`npm run checar` avisa).
- **Mudou o código do HRZZ?** `npm run build` e reinicie (`-Parar` e depois `Start-ScheduledTask`). O que o HRZZ serve é a versão compilada.

## Comandos

| Comando | O que faz |
|---|---|
| `scripts\montar-tudo.ps1` | instala, constrói a fase PC (etapas 0 a 7) sozinho e liga o HRZZ |
| `scripts\montar-tudo.ps1 -Status` | mostra o andamento da construção |
| `npm run dev` | sobe o servidor (porta 7000) e a interface (porta 7001, em `http://localhost:7001`) juntos |
| `npm run build` | compila a interface e o servidor; depois `npm start` serve tudo em `127.0.0.1:7000` |
| `npm run testar` | testes do servidor |
| `npm run testar:vigia` | derruba o servidor de propósito e confere que o vigia sobe de novo |
| `npm run testar:transcricao` | testa a transcrição de ponta a ponta (arquivo, fila, YouTube, ao vivo, chat, `/ata`, galeria) com um modelo pequeno, sem baixar o modelo grande |
| `npm run testar:python` | testa as funções de texto do transcritor (emenda do ao vivo, legenda .srt, parágrafos) |
| `npm run testar:acervo` | testa memória, skills por projeto, comandos salvos e modelos de projeto de ponta a ponta (HRZZ isolado, claude de mentira) |
| `npm run testar:acervo-ui` | testa no navegador as telas de memória e de skills e comandos, e o menu do `/` no chat |
| `npm run transcritor` | sobe só o serviço de transcrição (porta 7100) |
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
| `scripts\iniciar.ps1 -Instalar` | abre o HRZZ sozinho, sem janela, quando você entra no Windows (`-Remover` desfaz, `-Status` mostra, `-Parar` desliga) |

## Documentação

`docs/01-arquitetura.md` até `docs/08-decisoes.md`. As regras pro Claude Code estão em `CLAUDE.md`.
