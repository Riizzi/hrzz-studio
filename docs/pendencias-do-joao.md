# Pendências do João

O que só você pode fazer ou decidir. O Claude acrescenta aqui durante a construção automática.

## Etapa 0
- [ ] decidir: no celular (até 480 px), com a barra lateral aberta o chat fica com uns 170 px, porque a barra empurra o chat (como diz `docs/03-design.md`). Hoje as faixas de cima rolam de lado nesse caso. Se preferir que a barra cubra o chat no celular, é só avisar.
- [ ] decidir: floresta de noite com lua e estrelinhas, sim ou não (`docs/08-decisoes.md`, "em aberto"). Até lá a floresta fica sem lua.
- [ ] olhar com os próprios olhos: abrir `http://localhost:7001` (depois de `npm run dev`), recolher e abrir a barra, abrir e fechar o painel e diminuir a janela até o tamanho de celular.

```powershell
cd $HOME\projetos\hrzz-studio
npm run dev
```

## Etapa 1
- [ ] **criar o PIN** (quem abre o HRZZ primeiro cria): o PIN é pedido em cada aparelho novo e lembrado por 30 dias. Suba o HRZZ e abra o endereço:

```powershell
cd $HOME\projetos\hrzz-studio
npm run dev
```

  Abra `http://localhost:7001`, crie o PIN (4 a 12 números) e use.
- [ ] **testar o Gemini (agy) numa conversa de verdade.** A lista de modelos já vem do `agy models` (11 modelos Gemini), mas o fluxo de resposta do `agy -p` nunca foi visto (a construção automática não usa o agy). Na conversa, abra o botão do modelo, escolha um da seção Google e mande "oi". Se vier erro ou resposta vazia, rode isto e me passe a saída (as 20 primeiras linhas):

```powershell
agy -p "responda apenas: oi" --output-format stream-json
```

- [ ] **teste de qualidade, parte claude.ai.** O `docs/qualidade.md` já tem as 10 perguntas e as respostas do HRZZ (rodadas com o Sonnet 5.5, pra poupar a cota). Rode as mesmas perguntas no claude.ai, cole as respostas lá e peça pro Claude Code: "compare as respostas do docs/qualidade.md". O arquivo anexo da pergunta 7 está em `dados\qualidade\relatorio-trimestral.txt`. Pra refazer o lado do HRZZ com o Opus:

```powershell
npm run qualidade -- opus
```

- [ ] **decidir sobre o botão de pensamento.** O `claude` desta versão não deixa desligar o pensamento. "desligado" só esconde o pensamento e pede resposta direta; "profundo" manda `ultrathink`. Veja se o comportamento serve (decisão registrada em `docs/08-decisoes.md`).
- [ ] **anexar um PDF e um .docx** numa conversa: só imagem e .txt foram testados com o `claude` de verdade (o arquivo vai pelo caminho e o `claude` lê com as próprias ferramentas).
- [ ] **botão "atualizar" e "voltar versão"** (em acesso e ajustes): foram testados com repositórios temporários. Pra funcionar no HRZZ real, o repositório precisa ter o GitHub ligado:

```powershell
cd $HOME\projetos\hrzz-studio
git remote -v
git push -u origin main
```

- [ ] **iniciar com o Windows:** o vigia (`scripts\vigia.mjs`) está pronto e testado, mas ligar no Windows (`scripts\iniciar.ps1 -Instalar`) fica pro `montar-tudo.ps1` no fim, como combinado. Pra ligar antes:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\iniciar.ps1 -Instalar
```

- [ ] **usar o HRZZ por um dia no lugar do claude.ai** e anotar as diferenças (teste da etapa 1).

## Etapa 2
- [ ] **renovar o login do claude em breve.** O `claude` avisou que o login atual termina entre 15 e 18/11/2026. Pra não travar a construção nem o uso:

```powershell
claude auth login
```

- [ ] **olhar o terminal do painel.** Ele abre o PowerShell na pasta do projeto carregando o seu perfil. Confira se o prompt do Illuminati aparece igual ao do WezTerm (a construção não consegue ver isso).
- [ ] **testar com um site seu de verdade** (por exemplo `bhzotica.site`): cadastre o projeto, abra a aba preview, edite um texto direto na página, desfaça, salve uma versão e veja o antes/depois.
- [ ] **pptx e pdf:** o HRZZ mostra pdf e baixa pptx (sem pré-visualização). Se quiser ver slides no painel, avise que eu penso numa solução.

## Etapa 3
- [ ] **testar o ao vivo com a sua voz e com uma reunião de verdade.** O microfone do navegador foi testado com um microfone de mentira, e o áudio do PC com uma fala tocando nas caixas. Abra a reunião (Teams, Meet...) no navegador, vá em transcrição, aba "ao vivo", fonte "os dois juntos", e confira se o texto sai dos dois lados. Se o áudio do PC sair vazio com fone Bluetooth, me avise qual é o fone.

```powershell
cd $HOME\projetos\hrzz-studio
npm run dev
```

- [ ] **decidir o modelo do ao vivo.** O padrão é o `small` (leve). Como a placa de vídeo dá uns 43x o tempo real, o `turbo` também acompanha ao vivo e erra menos. É só trocar no seletor "modelo" da aba ao vivo; se preferir deixar fixo, me avise e eu mudo o padrão.
- [ ] **pelo celular (Tailscale), o microfone do navegador não abre.** O navegador só libera microfone em `localhost` ou `https`. Pelo celular use a fonte "áudio do PC" (grava o PC) ou espere o `https` da etapa 8. Arquivo e YouTube funcionam normal pelo celular.
- [ ] **espaço em disco (opcional).** Os testes baixaram os modelos `tiny`, `base`, `small` e `turbo` (uns 2,3 GB em `%USERPROFILE%\.cache\huggingface`) e as bibliotecas da NVIDIA ficaram no ambiente Python (uns 1,2 GB). Se quiser liberar o que só os testes usaram:

```powershell
Remove-Item -Recurse -Force "$HOME\.cache\huggingface\hub\models--Systran--faster-whisper-tiny"
Remove-Item -Recurse -Force "$HOME\.cache\huggingface\hub\models--Systran--faster-whisper-base"
```

- [ ] **YouTube pode pedir atualização do yt-dlp.** O YouTube muda de vez em quando e o yt-dlp acompanha. Se um link parar de funcionar com "o yt-dlp não conseguiu baixar", rode:

```powershell
cd $HOME\projetos\hrzz-studio\servicos\transcritor
uv lock --upgrade-package yt-dlp
uv sync
```

- [ ] **aviso no celular quando uma transcrição longa termina** fica pra etapa 8 (hospedagem). Por enquanto a fila do topo mostra a porcentagem.

## Etapa 4
- [ ] **importar a memória do claude.ai de verdade.** O importador foi testado com textos de exemplo (com e sem títulos), mas ainda não vi o formato real da sua memória. No claude.ai abra configurações, memória, copie o texto, vá em memória > "importar do claude.ai", cole e importe. Se os arquivos saírem estranhos, deixe "dividir em um arquivo por título" desmarcado e me avise como veio.
- [ ] **olhar a memória depois do import.** A IA lê só os primeiros 12.000 caracteres de tudo junto. A tela mostra quantos já tem; se passar, enxugue os arquivos (apague o que não precisa).
- [ ] **conferir as skills na tela "skills e comandos".** Elas vêm de `~/.claude/skills` (as sincronizadas do claude.ai). Confira se as suas aparecem como "sua" e as de documentos como "da anthropic". Se alguma sua aparecer no grupo errado, me diga o nome.
- [ ] **testar `/revisar` com um texto seu de verdade** e dizer se o resultado soa como você (cole um texto depois do `/revisar` ou anexe um arquivo). Se não, o pedido do comando pode ser editado na própria tela (`/revisar` > editar).
- [ ] **testar um modelo de projeto:** em "skills e comandos" > modelos de projeto > "site de loja (Astro)", crie o projeto, complete os campos do pedido e envie. Os textos dos três modelos são uma primeira versão minha; me diga o que ajustar.
- [ ] **o `/` do chat só vale no começo da mensagem.** Se quiser usar comando no meio do texto, me avise.

## Etapa 5
- [ ] **testar o dueto com o Gemini de verdade.** Funciona com o `claude` real e um `agy` de mentira, mas o `agy` real nunca foi chamado (a construção automática não usa o agy). Abra uma conversa dentro de um projeto, ligue o dueto (botão das duas pessoinhas), escolha um modelo do Claude e peça algo como "peça pro Gemini fazer 3 variações do logo". Confira se aparece a fala do Gemini recuada e se os arquivos caem em `arte/` do projeto. Se vier erro, rode isto e me passe a saída:

```powershell
"responda apenas: oi" | agy -p --output-format text --mode accept-edits
```

- [ ] **testar o duelo com o Gemini de verdade.** Ligue o duelo (botão das espadas), mande um pedido que mexa em arquivos (por exemplo "troque a cor do botão") e veja as duas respostas lado a lado. "Usar essa" deve levar só as mudanças da escolhida pro projeto; o botão "desfazer última mudança" do preview volta tudo. Cada lado trabalha numa cópia em `dados\duelo\`, sem `node_modules` (o que o `.gitignore` ignora não é copiado).
- [ ] **ver o aviso de limite com um limite de verdade.** O `claude` avisa o limite com um texto que não consegui provocar na construção. Quando a cota acabar, a conversa deve mostrar a caixa "limite de uso do Claude" com os botões do Haiku e do Gemini. Se aparecer um erro comum no lugar, copie a frase do erro e me mande.
- [ ] **o uso do Gemini no topo continua `–`.** O `agy` não informa a cota no fluxo. Se ele tiver um comando de uso, me avise que eu ligo.
- [ ] **olhar a auditoria num site seu** (por exemplo `bhzotica.site`): suba o preview, clique no ícone da lista de verificação na faixa do painel e confira se os problemas apontados fazem sentido. A regra de alvo de toque é 44 x 44 px no celular (360 px).
- [ ] **agendar algo de verdade** em "acesso e ajustes" > agendamentos (por exemplo um resumo de segunda de manhã) e deixar o HRZZ ligado até o horário. Tarefas rodam em modo Mid: o que pedir permissão fica esperando na conversa.

## Etapa 6
- [ ] **ligar o GitHub.** Crie um token em github.com > settings > developer settings > personal access tokens (dê só o que precisa: repo, issues e pull requests). Abra "conectores", cole o token no cartão do GitHub, clique em "salvar" e depois em "testar" (deve dizer "conectado como <seu usuário>"). Ele começa em **somente leitura**; desligue isso na tela se quiser que o Claude abra issues e PRs. Depois confira o painel do dia: meus PRs, pedidos de revisão e issues.
- [ ] **ligar o Cloudflare e o Supabase (se for usar).** Mesmo caminho: crie o token no painel de cada um (Cloudflare: tokens de API; Supabase: supabase.com/dashboard/account/tokens), cole em "conectores", salve e teste. O teste só confere o token na API do serviço. Pra confirmar que o conector entra no Claude Code, rode isto com o conector ligado e veja se o claude lista as ferramentas dele:

```powershell
cd $HOME\projetos\hrzz-studio
claude -p "liste as ferramentas do conector hrzz-supabase" --model haiku --mcp-config dados\segredos\mcp.json --strict-mcp-config
```

  Há relatos de que o Supabase ignora o token e pede login pelo navegador (OAuth). Se for o seu caso, desligue o cartão do Supabase no HRZZ e use o login do próprio Claude Code:

```powershell
claude mcp add --transport http --scope user supabase https://mcp.supabase.com/mcp
claude
```

  (dentro do `claude`, digite /mcp, escolha supabase e entre pelo navegador; depois clique em "consultar o claude" na tela de conectores)
- [ ] **ligar a Vercel.** O plugin da Vercel que já está no seu Claude Code aparece como "precisa de login". Pra entrar:

```powershell
claude
```

  Dentro do `claude`, digite /mcp, escolha vercel e entre pelo navegador. Depois, em "conectores" do HRZZ, clique em "consultar o claude".
- [ ] **ligar o Google Agenda e o Gmail.** Planilhas, Docs e Drive já estão conectados na sua conta. Agenda e Gmail ainda não: no claude.ai, vá em configurações > conectores e conecte "Google Calendar" e "Gmail". Depois clique em "consultar o claude" em "conectores". Se o nome ou o endereço deles for diferente do que eu esperava, a tela mostra "não conectado": me avise o nome que aparece em `claude mcp list`.
- [ ] **buscar a agenda de verdade.** Com o Google Agenda conectado, abra o painel do dia e clique em "buscar agenda". Ela usa o Claude (Haiku) e gasta um pouco da cota, por isso só roda quando você pede. Se vier "o claude não devolveu a agenda num formato que eu entenda", me mande o que apareceu.
- [ ] **decidir o padrão de permissão dos conectores.** Hoje todo conector começa em "pergunta antes" (nos modos Mid e Intern aparece um cartão no chat quando a IA vai usar um conector; no Yolo é livre). Se achar chato pro Drive, Docs e Planilhas, marque "livre" na tela de conectores. Se quiser outro padrão, me avise.
- [ ] **olhar o painel do dia com projetos de verdade.** Cadastre seus projetos (bhzotica.site etc.) e confira se o ramo, as alterações soltas e "pra enviar" estão certos. Projeto que não é repositório git aparece como "sem git".
- [ ] **o Gemini continua sem número no uso.** O agy não informa a cota, então o painel do dia mostra `–` (igual ao topo).
