# Túnel da Cloudflare: o HRZZ pelo PC do trabalho

Endereço: **https://studio.hrzztech.com**. Ele leva ao HRZZ rodando no seu PC de casa (`127.0.0.1:7000`), sem VPN e sem abrir porta no roteador. Quando o HRZZ for pro servidor, o túnel passa a sair de lá e o endereço continua o mesmo.

Quem abre o endereço passa por três portas, nesta ordem:

1. **Cloudflare Access:** código de 6 dígitos no seu e-mail. A sessão dura 10 h.
2. **PIN do HRZZ:** pelo caminho do trabalho, o cookie também dura 10 h e só vale em HTTPS.
3. **HRZZ restrito:** o terminal, os conectores, o dueto/duelo e o "subir servidor de projeto" ficam bloqueados. O Claude sobe com `--restricted`, então mexe em arquivo mas não roda comando.

O HRZZ reconhece esse caminho pelos cabeçalhos que a Cloudflare sempre acrescenta (`cf-ray`, `cf-connecting-ip` e os do Access). Assim o bloqueio vale mesmo se a regra do Access sumir por engano.

## Passo 1. Zero Trust (uma vez)

No painel da Cloudflare, clique em **Zero Trust** no menu. Dê o nome de equipe `hrzztech` e escolha o plano **Free**. Ele pede cartão, mas não cobra.

## Passo 2. Aplicação do Access (antes do túnel)

Faça este passo **antes** do túnel. Assim o endereço já nasce protegido.

1. Vá em **Zero Trust > Access controls > Applications**.
2. Clique em **Create new application** e escolha **Self-hosted** (pode aparecer como "Self-hosted and private").
3. Preencha:
   - **Application name:** `HRZZ STUDIO`;
   - **Add public hostname:** subdomínio `studio` e domínio `hrzztech.com`;
   - **Session Duration:** `10 hours`.
4. Em **Access policies**, crie uma política nova:
   - **Policy name:** `so eu`;
   - **Action:** `Allow`;
   - **Include > Selector:** `Emails`, com o valor do seu e-mail.
5. Em **Login methods**, deixe **One-time PIN** marcado. É o código por e-mail e já vem ligado quando não há outro login configurado.
6. Clique em **Create** (ou **Save**).

## Passo 3. Criar o túnel e pegar o token

1. Vá em **Networking > Tunnels** e clique em **Create a tunnel**. Se pedir o tipo, escolha **Cloudflared**.
2. Dê o nome `hrzz-pc` e clique em **Create Tunnel**.
3. Escolha **Windows**. Vai aparecer um comando parecido com `cloudflared.exe service install eyJ...`. **Copie esse comando inteiro**, mas não rode ele. O script faz isso.
4. Deixe essa aba aberta.

## Passo 4. Rodar o script no PC

No Illuminati, na pasta do HRZZ:

```powershell
cd "$HOME\projetos\hrzz-studio"
git pull
powershell -ExecutionPolicy Bypass -File .\scripts\tunel.ps1 -Token "COLE-AQUI-O-COMANDO-COPIADO"
```

O script:

- instala o `cloudflared` pelo winget;
- pede permissão de administrador **uma vez**;
- instala o túnel como serviço do Windows, que liga sozinho com o PC;
- no fim, confere se o endereço cai na tela de login da Cloudflare.

O token é um segredo: não salve em arquivo do repositório. Se perder, gere outro no painel.

## Passo 5. Apontar o endereço pro HRZZ

Volte à aba do túnel. Quando ele aparecer como conectado, clique em **Continue**. Se não abrir sozinho, vá na aba **Routes**, clique em **Add route** e escolha **Published application**. Preencha:

- **Subdomain:** `studio`;
- **Domain:** `hrzztech.com`;
- **Service URL:** `http://127.0.0.1:7000` (não `localhost`: no Windows ele às vezes vai pelo IPv6, onde o HRZZ não escuta, e dá 502).

Clique em **Add route** (ou **Save**).

## Passo 6. Conferir

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\tunel.ps1 -Status
```

O resultado certo é:

- `servico cloudflared rodando`;
- `HRZZ respondendo em 127.0.0.1:7000`;
- `protegido: quem abrir cai no login por codigo no e-mail`.

Depois, no PC do trabalho:

1. abra `https://studio.hrzztech.com`;
2. digite o código que chegou no e-mail;
3. digite o PIN;
4. converse com o Claude.

Os itens do terminal devem aparecer bloqueados.

## Problemas comuns

| O que aparece | O que fazer |
|---|---|
| erro **530** | o túnel não está ligado. Rode `-Status`; se o serviço estiver parado, rode o passo 4 de novo. |
| erro **502** | o túnel está ok, mas o HRZZ não respondeu. Veja se ele está ligado (`iniciar.ps1 -Status`). |
| abriu o HRZZ **sem** pedir código | falta o passo 2. O PIN e o bloqueio do terminal continuam valendo, mas crie o Access. |
| não abre no trabalho, abre no celular (4G) | a rede do governo bloqueou o domínio. Não tem o que fazer pelo lado do HRZZ. |
| o PC dormiu ou desligou | o endereço fica fora do ar até o PC voltar. É a limitação de rodar em casa, até ir pro servidor. |

Pra desligar o túnel deste PC:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\tunel.ps1 -Remover
```

## Painel: ligar e desligar tudo com um clique

`scripts\painel.ps1` abre uma janela com um botão só. O status de cada parte aparece na janela e atualiza a cada 4 s.

- **ligar tudo:**
  - liga o HRZZ e o túnel;
  - na tomada, o PC não dorme e fechar a tampa não suspende;
  - tudo volta sozinho se o PC reiniciar.
- **desligar tudo:**
  - desliga o HRZZ e o túnel, e eles não voltam no próximo boot;
  - a energia volta a ser como era antes de ligar (o valor antigo fica guardado em `dados\painel-energia.json`).
- **Rede de segurança** (`scripts\acordar.ps1`, ligada junto no "ligar tudo"): uma tarefa do Windows (`HRZZ ACORDAR`) que acorda o PC a cada hora e ao ligar, pede pro Windows não dormir enquanto estiver ligada e, a cada minuto, religa o túnel e o HRZZ se algum cair. Alguns notebooks ignoram o despertador do Windows; aí vale só o "não dormir". **Suspender pelo menu Iniciar ainda põe o PC pra dormir**: pra sair de casa, use `Win + L`.
- Na **bateria** nada muda: fechar a tampa continua suspendendo.
- O painel pede permissão de administrador ao abrir, porque mexe no serviço do túnel. Fechar a janela não desliga nada.

Pra criar o atalho **HRZZ** na área de trabalho (uma vez):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\painel.ps1 -CriarAtalho
```
