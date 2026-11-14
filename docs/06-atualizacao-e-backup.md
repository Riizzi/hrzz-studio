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

- `scripts/iniciar.ps1 -Instalar` cria uma tarefa no Agendador de Tarefas ("HRZZ STUDIO"), no login do João. A tarefa abre `scripts/vigia-oculto.vbs` (pelo `wscript.exe`), que sobe o vigia **sem nenhuma janela**. O vigia serve a versão compilada (`npm run build`) em `127.0.0.1:7000` e sobe o transcritor (7100).
- `scripts/iniciar.ps1 -Status` mostra se a tarefa existe, se o HRZZ responde e quantos processos dele estão rodando.
- `scripts/iniciar.ps1 -Parar` desliga o HRZZ que está rodando (vigia, servidor e transcritor). Precisa dele porque o Windows não tem como o vigia receber um "pare" educado.
- `scripts/iniciar.ps1 -Remover` desfaz o início automático (não desliga o que já está rodando; use `-Parar`).
- Só existe um vigia: se já houver um HRZZ respondendo na porta 7000 (outro vigia ou o `npm run dev`), o vigia novo avisa no log e sai.
- O `montar-tudo.ps1` liga isso no fim da construção. Pra ligar na mão: `powershell -ExecutionPolicy Bypass -File .\scripts\iniciar.ps1 -Instalar`, e `Start-ScheduledTask -TaskName 'HRZZ STUDIO'` pra abrir sem sair do Windows.
- Logs ficam em `dados/logs/` (`vigia.log`, `servidor.log`, `transcritor.log`).

## Backup

### Fase PC: local, em `dados/backups/`

- **Quando:** todo dia às 03:00 e quando o João clica em "fazer backup agora" (em "acesso e ajustes"). Se o PC estava desligado às 03:00 e o último backup tem mais de 24 h, o HRZZ faz um uns 2 minutos depois de ligar.
- **O que entra:** cada backup é uma pasta `dados/backups/hrzz-AAAAMMDD-HHMMSS/` com
  - `hrzz.db`: cópia segura do SQLite (`VACUUM INTO`, nunca o arquivo aberto) com conversas, projetos, progresso, fila e agendamentos;
  - `memoria/`, `skills/` (as do João) e `comandos/`;
  - `transcricoes/`: só os textos (`.txt`, `.srt`, `.json`). Os áudios originais ficam de fora.
- **O que não entra:** `segredos/` (PIN, tokens dos conectores, chave do transcritor), `anexos/`, `logs/`, `versoes/` (capturas), `duelo/` e `dueto/`. Os segredos ficam fora de propósito: um backup copiado pra outro lugar não leva senha junto.
- **Quantos:** os últimos 14. O mais antigo some quando entra o 15º. Só pastas com esse nome são apagadas; qualquer outra coisa que o João colocar em `dados/backups/` fica quieta.
- **Atômico:** o backup é montado numa pasta `.incompleto-*` e só vira `hrzz-*` quando termina. Se o PC desligar no meio, o resto é limpo no próximo backup.
- **Código:** `apps/servidor/src/backup.ts` (cópia, rotação e agendamento com `croner`) e `backup-rotas.ts` (`GET /api/backup` lista, `POST /api/backup` faz agora).

### Restaurar

Com o HRZZ desligado (`scripts\iniciar.ps1 -Parar`), copie de volta o que precisa. Exemplo restaurando o backup mais recente inteiro:

```powershell
cd $HOME\projetos\hrzz-studio
$b = Get-ChildItem dados\backups -Directory | Where-Object Name -Like 'hrzz-*' | Sort-Object Name | Select-Object -Last 1
Remove-Item dados\hrzz.db-wal, dados\hrzz.db-shm -ErrorAction SilentlyContinue
Copy-Item "$($b.FullName)\hrzz.db" dados\hrzz.db -Force
Copy-Item "$($b.FullName)\memoria" dados -Recurse -Force
Copy-Item "$($b.FullName)\skills" dados -Recurse -Force
Copy-Item "$($b.FullName)\comandos" dados -Recurse -Force
Copy-Item "$($b.FullName)\transcricoes" dados -Recurse -Force
```

Depois é só ligar de novo (`Start-ScheduledTask -TaskName 'HRZZ STUDIO'` ou `npm run dev`). O PIN e os tokens dos conectores não estão no backup: o PIN atual continua valendo e os conectores seguem como estavam (se a pasta `dados/segredos` foi perdida, crie o PIN de novo e cole os tokens).

### Fase hospedagem (etapa 8)

Além do local, commit de `dados/` (menos `segredos/`, `anexos/` grandes e `tmp/`) num repositório privado separado, `Riizzi/hrzz-dados`, também às 03:00. O banco continua sendo copiado com a API do próprio SQLite, e os áudios originais das transcrições ficam fora (só os textos vão).
