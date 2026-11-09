# Como rodar o HRZZ STUDIO no PC (fase PC)

Este é o caminho pra ter o HRZZ inteiro funcionando no seu PC com um script só, rodando no Illuminati. A hospedagem no servidor (etapa 8) fica pra depois, feita junto com o Claude.

## Qual modelo usar

| Pra quê | Modelo | Por quê |
|---|---|---|
| **Construir o HRZZ** (o script) | **Sonnet 5.5**, esforço alto | No plano Pro, o Opus bateria no limite o tempo todo e o build levaria dias. O Sonnet é muito bom em código e rende bem mais na mesma cota. Já é o padrão do script. |
| **Usar o HRZZ no dia a dia** | escolha automática | Opus 5.5 pra sites, código e documentos; Sonnet 5.5 pro resto; Haiku 5.5 quando a cota passa de 80%. Você troca na mão quando quiser. |

O agy (Gemini) **não é usado na montagem**. As partes do HRZZ que usam o agy são construídas, mas o teste fica nas pendências pra você fazer depois.

## Antes de começar

- **Notebook na tomada.** O script impede o PC de dormir enquanto roda, mas fechar a tampa pode pôr o notebook pra dormir mesmo assim. Se quiser fechar a tampa, rode isto uma vez (vale só quando estiver na tomada):

  ```powershell
  powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
  powercfg /setactive SCHEME_CURRENT
  ```

  Pra voltar ao normal depois (dormir ao fechar a tampa):

  ```powershell
  powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 1
  powercfg /setactive SCHEME_CURRENT
  ```

- **Pause o Windows Update por uma semana** (Configurações > Windows Update > Pausar). Assim ele não reinicia o PC de madrugada no meio do build.
- **Quanto tempo leva:** depende da cota do plano Pro. O Claude trabalha até bater o limite, o script espera a janela renovar e continua sozinho. Conte com **um a três dias** de máquina ligada. Você pode usar o PC normalmente enquanto isso, mas evite coisas pesadas, porque são só 8 GB de RAM.

## Passo a passo no Illuminati

**1. Abra o WezTerm e monte o Illuminati:**

```powershell
illuminati
```

Use o **terminal principal** (o grande, à esquerda).

**2. Se o terminal não conhecer o `git`**, instale e depois feche e abra o WezTerm:

```powershell
winget install --id Git.Git -e
```

**3. Baixe o HRZZ e rode o script** (um comando por linha):

```powershell
git clone https://github.com/Riizzi/hrzz-studio.git "$HOME\projetos\hrzz-studio"
cd "$HOME\projetos\hrzz-studio"
powershell -ExecutionPolicy Bypass -File .\scripts\montar-tudo.ps1
```

Se já tiver clonado antes, atualize em vez de clonar:

```powershell
cd "$HOME\projetos\hrzz-studio"
git pull
powershell -ExecutionPolicy Bypass -File .\scripts\montar-tudo.ps1
```

**4. Fique por perto nos primeiros minutos (checagem inicial).** É a única parte que pode pedir algo:

- **Programa faltando:** aparece **uma** janela do Windows pedindo permissão de administrador. Aceite.
- **Claude sem login:** ele abre o Claude. Digite `/login`, entre com a sua **assinatura** e depois `/exit`.
- **GitHub sem login:** pode abrir uma janela do navegador. Entre com a conta **Riizzi**.

Quando aparecer o quadro verde **"PRONTO. Daqui pra frente não pergunto mais nada"**, pode largar.

**5. Não feche o WezTerm.** Minimizar pode. O terminal principal vai mostrando cada arquivo e comando que o Claude mexe.

## Acompanhar o andamento

Em outro painel, por exemplo o **mini** do Illuminati (`ctrl+alt+p` alterna entre mini e preview):

```powershell
cd "$HOME\projetos\hrzz-studio"
powershell -ExecutionPolicy Bypass -File .\scripts\montar-tudo.ps1 -Status
```

Ele mostra:

- em que etapa está e há quanto tempo;
- quais etapas já fecharam;
- as últimas ações do Claude;
- quantas pendências existem pra você.

## Se parar

Faltou luz, fechou a janela, o Windows reiniciou ou deu erro: rode o **mesmo comando** de novo. Ele continua da etapa onde parou, sem refazer o que já foi feito.

```powershell
cd "$HOME\projetos\hrzz-studio"
powershell -ExecutionPolicy Bypass -File .\scripts\montar-tudo.ps1
```

## Quando terminar

O script faz isto sozinho:

1. builda a versão final;
2. liga o HRZZ pra abrir junto com o Windows, sem janela;
3. confere se `http://localhost:7000` responde e abre no navegador;
4. gera o relatório em `dados\relatorio-construcao.md`;
5. mostra a lista do que ficou pra você (`docs\pendencias-do-joao.md`).

No primeiro acesso, o HRZZ pede pra você **criar o PIN**.

### O que testar primeiro

- [ ] conversar com o Claude; ver o pensamento recolhido e o modelo escolhido sozinho
- [ ] trocar Yolo / Mid / Intern no topo do chat
- [ ] abrir um projeto de site (ex.: BHZ Óptica): preview, editar texto, rabiscar, salvar versão, desfazer
- [ ] aba de progresso enchendo enquanto a IA trabalha
- [ ] transcrever um áudio curto e mandar pro chat
- [ ] memória, skills e comandos salvos (`/grillme`, `/ata`)
- [ ] o que estiver em `docs\pendencias-do-joao.md`, como o login do agy pra testar dueto e duelo

Anote o que quiser mudar e traga pro Claude.

## Opções do script

| Comando | O que faz |
|---|---|
| `... montar-tudo.ps1 -Status` | mostra o andamento |
| `... montar-tudo.ps1 -Modelo opus` | constrói com o Opus (gasta muito mais cota) |
| `... montar-tudo.ps1 -De 3 -Ate 5` | só essas etapas |
| `... montar-tudo.ps1 -SemPush` | não manda nada pro GitHub (fica só no PC) |

## Problemas comuns

- **"O claude não respondeu"**: rode `claude`, digite `/login` e entre com a assinatura. Depois rode o script de novo.
- **"ANTHROPIC_API_KEY estava definida"**: rode `npm run checar`, que mostra o comando pra remover de vez.
- **"Já tem uma construção rodando"**: ela está aberta em outra janela. Use `-Status` pra ver.
- **"Sem acesso ao GitHub"**: o build segue e os commits ficam no PC. Depois rode `git push`.
- **Etapa não fechou em 4 tentativas**: o script para e mostra o log. Rode de novo pra tentar mais, ou mande o log (`dados\logs`) pro Claude no chat.
