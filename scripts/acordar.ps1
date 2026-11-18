# HRZZ STUDIO - rede de seguranca: manter o PC acordado e o HRZZ no ar
# Uso (o painel chama sozinho no "ligar tudo" e no "desligar tudo"; precisa de administrador):
#   powershell -ExecutionPolicy Bypass -File .\scripts\acordar.ps1 -Instalar   cria e liga a tarefa 'HRZZ ACORDAR'
#   powershell -ExecutionPolicy Bypass -File .\scripts\acordar.ps1 -Remover    desliga e apaga a tarefa
#   powershell -ExecutionPolicy Bypass -File .\scripts\acordar.ps1 -Status     mostra se a tarefa existe e esta rodando
#   (-Rodar e o que a tarefa executa; nao precisa chamar na mao)
#
# A tarefa:
# - roda ao ligar o PC e a cada 1 hora, com "acordar o computador pra rodar" (se o PC dormiu, ele acorda);
# - fica rodando escondida, pedindo ao Windows pra nao dormir (SetThreadExecutionState) enquanto estiver ligada;
# - a cada minuto confere o tunel (servico cloudflared) e o HRZZ (127.0.0.1:7000) e religa o que cair.
# Alguns notebooks modernos ignoram o despertador do Windows; ai so o "nao dormir" vale.
# Este arquivo e so ASCII de proposito (PowerShell 5 quebra acentos em UTF-8 sem BOM).

param([switch]$Instalar, [switch]$Remover, [switch]$Status, [switch]$Rodar)
$Tarefa = 'HRZZ ACORDAR'
$TarefaHrzz = 'HRZZ STUDIO'
$Servico = 'cloudflared'

if ($Rodar) {
  Add-Type -Namespace Hrzz -Name Energia -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
  # ES_CONTINUOUS | ES_SYSTEM_REQUIRED: o PC nao dorme sozinho enquanto este processo viver (a tela pode apagar)
  $flags = [uint32]('0x80000001')
  while ($true) {
    [void][Hrzz.Energia]::SetThreadExecutionState($flags)
    try {
      $s = Get-Service -Name $Servico -ErrorAction SilentlyContinue
      if ($s -and $s.Status -ne 'Running') { Start-Service -Name $Servico -ErrorAction SilentlyContinue }
    } catch {}
    try {
      $ok = $false
      try { $ok = ((Invoke-WebRequest -Uri 'http://127.0.0.1:7000/api/saude' -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200) } catch {}
      if (-not $ok) {
        $t = Get-ScheduledTask -TaskName $TarefaHrzz -ErrorAction SilentlyContinue
        if ($t -and $t.State -ne 'Disabled' -and $t.State -ne 'Running') { Start-ScheduledTask -TaskName $TarefaHrzz -ErrorAction SilentlyContinue }
      }
    } catch {}
    Start-Sleep -Seconds 60
  }
}

if ($Status) {
  $t = Get-ScheduledTask -TaskName $Tarefa -ErrorAction SilentlyContinue
  if ($t) { Write-Host ("Tarefa '{0}': {1}" -f $Tarefa, $t.State) } else { Write-Host ("Tarefa '{0}': nao existe" -f $Tarefa) }
  exit 0
}

$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$admin = (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Write-Host "  [!]  precisa de administrador: use o painel (atalho HRZZ) ou abra o PowerShell como administrador." -ForegroundColor Magenta; exit 1 }

if ($Remover) {
  Stop-ScheduledTask -TaskName $Tarefa -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $Tarefa -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "  [ok] rede de seguranca desligada" -ForegroundColor Green
  exit 0
}

if ($Instalar) {
  $acao = New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Rodar"
  $aCadaHora = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Hours 1)
  $aoLigar = New-ScheduledTaskTrigger -AtStartup
  $config = New-ScheduledTaskSettingsSet -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
  $quem = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName $Tarefa -Action $acao -Trigger @($aCadaHora, $aoLigar) -Settings $config -Principal $quem -Force | Out-Null
  # deixa o despertador do Windows valer na tomada (Permitir temporizadores de ativacao)
  powercfg /setacvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 1 | Out-Null
  powercfg /setactive SCHEME_CURRENT | Out-Null
  Start-ScheduledTask -TaskName $Tarefa
  Write-Host "  [ok] rede de seguranca ligada (tarefa '$Tarefa')" -ForegroundColor Green
  exit 0
}

Write-Host "Use -Instalar, -Remover ou -Status."
