---
description: Constroi uma etapa do HRZZ (ex. /etapa 1)
argument-hint: numero da etapa (0 a 7)
---

Vamos trabalhar na **etapa $ARGUMENTS** do HRZZ STUDIO.

1. Leia `CLAUDE.md`, `docs/01-arquitetura.md`, `docs/07-etapas.md` (a parte da etapa $ARGUMENTS) e os outros docs que essa etapa usa.
2. Confira o que já existe no código e o que já está marcado `[x]`. Se a etapa anterior tiver itens abertos que esta depende, me avise antes.
3. Veja em `docs/08-decisoes.md` se esta etapa usa alguma proposta "a confirmar" ou item "em aberto". Se usar, me pergunte em múltipla escolha antes de construir essa parte e registre a resposta.
4. Me mostre um plano curto (5 a 10 linhas) com a ordem das tarefas. Se houver decisão de verdade a tomar, pergunte em múltipla escolha. Depois comece sem esperar mais.
5. Trabalhe em partes pequenas. Ao fechar cada parte que funciona: rode os checks, faça commit com mensagem em português. Não faça push.
6. Antes de usar qualquer flag de `claude`, `agy`, `yt-dlp`, `ffmpeg`, `tailscale` ou `cloudflared`, confirme com `--help`.
7. Se precisar de algo que só eu posso fazer (login, instalar app, criar conta), pare e me dê o passo a passo exato em PowerShell, um comando por linha.
8. No fim:
   - rode `npm run checar` e `npm run testar:layout`;
   - marque o checklist em `docs/07-etapas.md`;
   - registre decisões em `docs/08-decisoes.md`;
   - me diga em poucas linhas o que eu devo testar com as minhas mãos.
