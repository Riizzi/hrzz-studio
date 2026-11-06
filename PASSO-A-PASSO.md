# Passo a passo (só terminal)

## Jeito rápido

Se não tiver o Git, instale primeiro, feche e abra o terminal:

```powershell
winget install --id Git.Git -e
```

Depois:

```powershell
git clone https://github.com/Riizzi/hrzz-studio.git "$HOME\projetos\hrzz-studio"
cd "$HOME\projetos\hrzz-studio"
powershell -ExecutionPolicy Bypass -File .\scripts\montar-tudo.ps1
```

O script só para pra pedir:

- **login do Claude**, se não estiver logado (`/login` e depois `/exit`);
- **login do agy**, se não estiver logado;
- **seu nome e e-mail pros commits**, se o Git ainda não souber;
- **login do GitHub**, se abrir a janela.

Depois disso pode deixar rodando: ele constrói as etapas 0 a 6 sozinho, espera quando bater o limite do Claude e mantém o PC acordado. Se parar por qualquer motivo, rode o mesmo comando de novo que ele continua de onde parou. Os logs ficam em `dados\logs`.

No fim ele liga o HRZZ, abre `http://localhost:7000` e mostra o que ficou pra você fazer.

---

O resto deste arquivo é o caminho manual, etapa por etapa, caso prefira.

Tudo aqui é digitado no PowerShell (pode ser no Illuminati). Um comando por linha.

## 1. Baixar o repositório

```powershell
cd $HOME\projetos
git clone https://github.com/Riizzi/hrzz-studio.git
cd hrzz-studio
```

Se a pasta `projetos` não existir, crie antes com `mkdir $HOME\projetos`. Se o terminal disser que não conhece o `git`, instale com `winget install --id Git.Git -e`, feche e abra o terminal.

## 2. Instalar o que falta

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\instalar.ps1
```

Ele pergunta antes de instalar cada coisa (Git, Node, Python 3.12, uv, FFmpeg, yt-dlp), cria a pasta `dados\` e roda o `npm install`. Se algum programa só aparecer num terminal novo, feche e abra o terminal e rode o script de novo.

## 3. Conferir

```powershell
npm run checar
```

Tudo precisa ficar `[ok]`. Atenção especial a duas linhas:

- **claude:** se não estiver logado, rode `claude`, digite `/login` e entre com a sua assinatura (não com chave de API).
- **api key:** precisa aparecer "nao definida". Se aparecer definida, o script mostra o comando pra remover.

Depois, teste se as duas IAs respondem:

```powershell
npm run checar:login
```

## 4. Construir com o Claude Code

```powershell
claude
```

Dentro dele, digite:

```
/etapa 0
```

Ele lê o `CLAUDE.md` e os docs, mostra o plano, constrói, testa e diz o que você precisa conferir. Quando a etapa fechar, siga pra `/etapa 1`, e assim por diante.

Outros comandos úteis dentro do Claude Code:

- `/status`: onde estamos e qual o próximo passo;
- `/revisar-visual`: compara a tela real com o protótipo e corrige o que vaza;
- `/qualidade`: teste lado a lado com o claude.ai (no fim da etapa 1).

## Dicas

- O Claude Code faz commit sozinho, mas **não faz push**. Quando quiser subir, peça "pode dar push" ou rode `git push`.
- Se ele travar numa decisão, ele pergunta em múltipla escolha. É só responder o número.
- Se algo ficar estranho, `/status` mostra onde as coisas estão.
