# Modo automático

Quando o prompt começar com `MODO AUTOMATICO`, você foi chamado pelo `scripts/montar-tudo.ps1`. O João deixou o PC construindo sozinho e não está olhando. Essas regras valem por cima do jeito normal de trabalhar do `CLAUDE.md`. As regras invioláveis do `CLAUDE.md` (assinatura, `ANTHROPIC_API_KEY`, ASCII nos `.ps1`, PIN etc.) continuam valendo.

1. **Não pergunte nada e não espere aprovação de plano.** Todas as decisões estão em `docs/08-decisoes.md`. Siga o que está lá.
2. **Item "em aberto"** em `08-decisoes.md`: não invente uma decisão. Deixe a parte preparada de forma neutra (ex.: floresta sem lua) e anote em `docs/pendencias-do-joao.md`.
3. **Coisa que só o João pode fazer** (login, criar conta, chave, instalar programa que pede administrador, aprovar algo no navegador):
   - pule só essa parte;
   - anote em `docs/pendencias-do-joao.md` com o passo a passo exato em PowerShell, um comando por linha;
   - siga com o resto.
4. **Faça a etapa inteira** de `docs/07-etapas.md`, item por item, e teste de verdade: build, testes e `npm run testar:layout` com o app rodando. Marque `[x]` só no que funcionou. O que foi feito mas não deu pra testar sem o João (ex.: `agy` sem login) fica `[~]`, com explicação em `docs/pendencias-do-joao.md`.
5. **Commits pequenos, em português.** No fim da etapa, rode `git push` (o João autorizou no modo automático), a não ser que o prompt diga `SEM PUSH`. Se o push falhar, anote nas pendências e siga.
6. **Nunca peça senha nem fique esperando entrada.** Rode comandos com tempo limite. Se subir o servidor, o Vite ou o transcritor pra testar, desligue depois, pra não travar o próximo passo.
7. **Sessão longa:** priorize fechar a parte em andamento e fazer commit. Se o contexto apertar, o script chama você de novo com `CONTINUAR`.
8. **Ao continuar** (prompt com `CONTINUAR`): olhe `git log`, `git status` e o checklist da etapa antes de mexer, pra seguir de onde parou sem refazer nada.
9. **Última linha da resposta**, exatamente uma destas:
   - `ETAPA N CONCLUIDA`
   - `ETAPA N INCOMPLETA: <motivo curto>`

   Use `CONCLUIDA` quando todos os itens da etapa estiverem `[x]` ou `[~]` com pendência anotada.

## `docs/pendencias-do-joao.md`

Crie se não existir. Um item por linha, agrupado por etapa, no formato:

```
## Etapa N
- [ ] o que falta, por que só ele pode fazer, e o comando exato
```

O script mostra esse arquivo pro João no fim.
