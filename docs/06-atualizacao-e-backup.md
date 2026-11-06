# Atualização, backup e iniciar com o Windows

## Atualizar sem zip

O código mora em `Riizzi/hrzz-studio` (privado). Dá pra atualizar de três jeitos:

1. **Botão "atualizar"** em "acesso e ajustes":
   - o servidor roda `git fetch` e mostra quantas mudanças há;
   - no clique, roda `git pull`, `npm install` (só se o `package-lock.json` mudou), `npm run build` e reinicia;
   - antes de tudo, marca a versão atual com uma tag (`antes-<data>`).
2. **Voltar versão:** lista as tags e volta pra escolhida (`git checkout <tag>` + build + reinício).
3. **Pelo próprio chat:** o João pode pedir pro Claude mudar o HRZZ. O Claude trabalha numa branch `hrzz/auto-<data>`, faz commit e só aplica (merge + reinício) quando o João clicar em "aplicar". Se quebrar, "voltar versão" resolve.

### Reiniciar sem perder nada

Um processo pequeno, o **vigia** (`scripts/vigia.mjs`), sobe o servidor e o transcritor e os reinicia quando:

- algum dos dois cai;
- o servidor pede reinício depois de uma atualização.

É o vigia que o Windows inicia no login.

## Iniciar com o Windows

- `scripts/iniciar.ps1 -Instalar` cria uma tarefa no Agendador de Tarefas (`schtasks` ou `Register-ScheduledTask`), no login do João, rodando o vigia **sem janela**.
- `scripts/iniciar.ps1 -Remover` desfaz.
- Logs ficam em `dados/logs/`.

## Backup

- **Diário (03:00) e manual pelo botão:** commit de `dados/` (menos `segredos/`, `anexos/` grandes e `tmp/`) num repositório privado separado, `Riizzi/hrzz-dados`.
- **Banco:** o SQLite é copiado com a API de backup do próprio SQLite (`.backup`), nunca copiando o arquivo aberto.
- **Tamanho:** áudios originais das transcrições ficam fora do backup por padrão (são grandes). Só os textos vão.
- **Restaurar:** documentar no README do repositório de dados (`git clone` + copiar pra `dados/`).
