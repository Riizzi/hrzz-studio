# HRZZ STUDIO - iniciar
# Uso:
#   powershell -ExecutionPolicy Bypass -File .\scripts\iniciar.ps1            sobe o HRZZ nesta janela (modo dev)
#   powershell -ExecutionPolicy Bypass -File .\scripts\iniciar.ps1 -Instalar  abre sozinho, sem janela, quando voce entra no Windows
#   powershell -ExecutionPolicy Bypass -File .\scripts\iniciar.ps1 -Remover   desfaz o -Instalar
#   powershell -ExecutionPolicy Bypass -File .\scripts\iniciar.ps1 -Status    mostra se a tarefa existe e se o HRZZ responde
#   powershell -ExecutionPolicy Bypass -File .\scripts\iniciar.ps1 -Parar     desliga o HRZZ que esta rodando (vigia, servidor e transcritor)
# A tarefa abre scripts\vigia-oculto.vbs, que sobe o vigia (scripts\vigia.mjs) sem nenhuma janela.
# O vigia serve a versao compilada (npm run build) em 127.0.0.1:7000 e sobe de novo o que cair.
# Arquivo so ASCII de proposito (o PowerShell 5 le UTF-8 sem BOM como ANSI).

param([switch]$Instalar, [switch]$Remover, [switch]$Status, [switch]$Parar)
$Raiz = Split-Path -Parent $PSScriptRoot
$Tarefa = 'HRZZ STUDIO'
$Vigia = Join-Path $Raiz 'scripts\vigia.mjs'
$Oculto = Join-Path $Raiz 'scripts\vigia-oculto.vbs'

# processos do HRZZ desta pasta (o vigia, o servidor e o transcritor), achados pela linha de comando
function ProcessosDoHrzz {
  $raizRe = [regex]::Escape($Raiz)
  Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and $_.CommandLine -match $raizRe -and (
      ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'vigia\.mjs|servidor.dist.index\.js') -or
      ($_.Name -match '^python' -and $_.CommandLine -match 'transcritor')
    )
  }
}

if ($Parar) {
  # o vigia primeiro, senao ele sobe o servidor de novo
  $todos = @(ProcessosDoHrzz)
  foreach ($p in ($todos | Where-Object { $_.CommandLine -match 'vigia\.mjs' })) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 500
  foreach ($p in @(ProcessosDoHrzz)) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1
  if (@(ProcessosDoHrzz).Count -eq 0) { Write-Host "HRZZ desligado." } else { Write-Host "Ainda sobrou algum processo do HRZZ; rode de novo." }
  exit 0
}

if ($Status) {
  $t = Get-ScheduledTask -TaskName $Tarefa -ErrorAction SilentlyContinue
  if ($t) { Write-Host ("Tarefa '{0}': instalada (estado: {1})." -f $Tarefa, $t.State) } else { Write-Host ("Tarefa '{0}': nao instalada." -f $Tarefa) }
  try {
    $r = Invoke-RestMethod -Uri 'http://127.0.0.1:7000/api/saude' -TimeoutSec 4
    Write-Host ("HRZZ: respondendo em http://localhost:7000 (ligado ha {0} s)." -f $r.ligadoHa)
  } catch {
    Write-Host 'HRZZ: nao responde em http://localhost:7000.'
  }
  Write-Host ("Processos do HRZZ rodando: {0}" -f @(ProcessosDoHrzz).Count)
  exit 0
}

if ($Remover) {
  Unregister-ScheduledTask -TaskName $Tarefa -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "HRZZ nao abre mais sozinho com o Windows."
  exit 0
}

if ($Instalar) {
  if (-not (Test-Path $Vigia)) { Write-Host "O vigia nao existe (scripts\vigia.mjs)."; exit 1 }
  if (-not (Test-Path $Oculto)) { Write-Host "O lancador nao existe (scripts\vigia-oculto.vbs)."; exit 1 }
  $node = (Get-Command node -ErrorAction Stop).Source
  $wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
  $acao = New-ScheduledTaskAction -Execute $wscript -Argument "//B //Nologo `"$Oculto`" `"$node`"" -WorkingDirectory $Raiz
  $gatilho = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $config = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
  $config.Hidden = $true
  Register-ScheduledTask -TaskName $Tarefa -Action $acao -Trigger $gatilho -Settings $config -Force | Out-Null
  Write-Host "Pronto: o HRZZ abre sozinho, sem janela, quando voce entrar no Windows (http://localhost:7000)."
  Write-Host "Pra abrir agora sem sair do Windows: Start-ScheduledTask -TaskName '$Tarefa'"
  exit 0
}

Push-Location $Raiz
try { npm run dev } finally { Pop-Location }
