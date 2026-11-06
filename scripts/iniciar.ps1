# HRZZ STUDIO - iniciar
# Uso:
#   powershell -ExecutionPolicy Bypass -File .\scripts\iniciar.ps1            sobe o HRZZ nesta janela (modo dev)
#   powershell -ExecutionPolicy Bypass -File .\scripts\iniciar.ps1 -Instalar  abre sozinho, escondido, quando voce entra no Windows
#   powershell -ExecutionPolicy Bypass -File .\scripts\iniciar.ps1 -Remover   desfaz o -Instalar
# O vigia (scripts\vigia.mjs) e criado na etapa 1. Arquivo so ASCII de proposito.

param([switch]$Instalar, [switch]$Remover)
$Raiz = Split-Path -Parent $PSScriptRoot
$Tarefa = 'HRZZ STUDIO'
$Vigia = Join-Path $Raiz 'scripts\vigia.mjs'

if ($Remover) {
  Unregister-ScheduledTask -TaskName $Tarefa -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "HRZZ nao abre mais sozinho com o Windows."
  exit 0
}

if ($Instalar) {
  if (-not (Test-Path $Vigia)) { Write-Host "O vigia ainda nao existe (ele e criado na etapa 1)."; exit 1 }
  $node = (Get-Command node).Source
  $acao = New-ScheduledTaskAction -Execute $node -Argument "`"$Vigia`"" -WorkingDirectory $Raiz
  $gatilho = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $config = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 0) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
  $config.Hidden = $true
  Register-ScheduledTask -TaskName $Tarefa -Action $acao -Trigger $gatilho -Settings $config -Force | Out-Null
  Write-Host "Pronto: o HRZZ abre sozinho quando voce entrar no Windows (http://localhost:7000)."
  exit 0
}

Push-Location $Raiz
try { npm run dev } finally { Pop-Location }
