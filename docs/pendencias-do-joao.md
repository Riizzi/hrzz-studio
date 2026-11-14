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
