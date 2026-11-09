# HRZZ STUDIO - monta a fase PC inteira de uma vez (etapas 0 a 7)
#
# Como funciona:
#   CHECAGEM INICIAL (primeiros minutos, a unica parte que pode pedir algo):
#     - instala o que faltar com UMA so janela de permissao do Windows
#     - instala o Claude Code se precisar e confere o login (assinatura)
#     - confere o acesso ao GitHub (se abrir janela de login, e agora)
#   CONSTRUCAO (sozinha, sem perguntas):
#     - o Claude (Sonnet, sem o agy) constroi as etapas 0 a 7 seguindo docs/automatico.md
#     - se bater o limite de uso, espera renovar e continua
#     - mantem o PC acordado; se parar, rode de novo que continua de onde parou
#   FIM:
#     - build final, liga o HRZZ com o Windows, confere se responde e abre o navegador
#     - relatorio em dados\relatorio-construcao.md e pendencias em docs\pendencias-do-joao.md
#
# Uso (na pasta do repositorio):
#   powershell -ExecutionPolicy Bypass -File .\scripts\montar-tudo.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\montar-tudo.ps1 -Status    (ver o andamento)
# Opcoes:
#   -De 2 -Ate 4        so essas etapas
#   -Modelo opus        outro modelo pra construir (padrao: sonnet)
#   -Esforco medium     outro esforco (padrao: high)
#   -SemPush            nao manda nada pro GitHub
#
# Arquivo so ASCII de proposito (PowerShell 5 quebra acentos).

param(
  [int]$De = -1,
  [int]$Ate = 7,
  [string]$Modelo = 'sonnet',
  [string]$Esforco = 'high',
  [switch]$SemPush,
  [switch]$Status,
  [int]$EsperaLimite = 1200
)

$ErrorActionPreference = 'Continue'
$Raiz = Split-Path -Parent $PSScriptRoot
Set-Location $Raiz
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$Dados = Join-Path $Raiz 'dados'
$Logs = Join-Path $Dados 'logs'
New-Item -ItemType Directory -Force -Path $Logs | Out-Null
$ArqEstado = Join-Path $Dados 'construcao.json'
$ArqTrava = Join-Path $Dados 'construcao.trava'
$ArqHist = Join-Path $Logs 'historico.csv'
$ArqRelatorio = Join-Path $Dados 'relatorio-construcao.md'
$Pendencias = Join-Path $Raiz 'docs\pendencias-do-joao.md'
$Instalador = Join-Path $PSScriptRoot 'instalar.ps1'
$NomesEtapas = @('fundacao', 'conversa', 'preview e companhia', 'transcricao', 'acervo', 'IA junta', 'integracoes', 'fechamento no PC', 'hospedagem')

function Titulo($t) { Write-Host ''; Write-Host "== $t ==" -ForegroundColor Yellow }
function Ok($t) { Write-Host "  [ok] $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "  [!]  $t" -ForegroundColor Magenta }
function Info($t) { Write-Host "  $t" -ForegroundColor DarkGray }
function Tem($c) { return [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function AtualizarPath {
  $m = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $u = [Environment]::GetEnvironmentVariable('Path', 'User')
  $extra = @((Join-Path $env:USERPROFILE '.local\bin')) | Where-Object { $_ -and (Test-Path $_) }
  $env:Path = (@($m, $u) + $extra | Where-Object { $_ }) -join ';'
}
function Duracao($inicio) {
  if (-not $inicio) { return '-' }
  $d = (Get-Date) - [datetime]$inicio
  return ('{0}h{1:00}' -f [int][math]::Floor($d.TotalHours), $d.Minutes)
}
function LerEstado {
  if (Test-Path $ArqEstado) { try { return (Get-Content $ArqEstado -Raw | ConvertFrom-Json) } catch {} }
  return [pscustomobject]@{ proxima = 0; inicio = $null; atual = $null; atual_desde = $null; modelo = $null }
}
function SalvarEstado($e) { ($e | ConvertTo-Json) | Set-Content -Path $ArqEstado -Encoding UTF8 }
function Historico($n, $ini, $tent, $esp, $res) {
  if (-not (Test-Path $ArqHist)) { 'etapa;inicio;fim;tentativas;esperas_limite;resultado' | Set-Content -Path $ArqHist -Encoding UTF8 }
  "$n;$ini;$(Get-Date -Format s);$tent;$esp;$res" | Add-Content -Path $ArqHist -Encoding UTF8
}
# mostra uma linha do fluxo do claude de um jeito legivel
function Mostrar($linha) {
  try {
    $j = $linha | ConvertFrom-Json -ErrorAction Stop
    if ($j.type -eq 'assistant' -and $j.message.content) {
      foreach ($b in $j.message.content) {
        if ($b.type -eq 'tool_use') {
          $alvo = ''
          if ($b.input.file_path) { $alvo = "$($b.input.file_path)" } elseif ($b.input.command) { $alvo = "$($b.input.command)" } elseif ($b.input.description) { $alvo = "$($b.input.description)" }
          $alvo = ($alvo -replace '\s+', ' ')
          if ($alvo.Length -gt 90) { $alvo = $alvo.Substring(0, 90) + '...' }
          Write-Host ("    > {0} {1}" -f $b.name, $alvo) -ForegroundColor DarkGray
        } elseif ($b.type -eq 'text' -and $b.text) {
          $txt = ($b.text -replace '\s+', ' ').Trim()
          if ($txt.Length -gt 140) { $txt = $txt.Substring(0, 140) + '...' }
          if ($txt) { Write-Host "    $txt" }
        }
      }
    } elseif ($j.type -eq 'result') {
      $r = ("$($j.result)" -split "`n" | Select-Object -Last 1)
      Write-Host "    = $r" -ForegroundColor Cyan
    }
  } catch {
    if ("$linha".Trim()) { Write-Host "    $linha" -ForegroundColor DarkGray }
  }
}

# -Status -----------------------------------------------------------------------
if ($Status) {
  $e = LerEstado
  Titulo 'HRZZ STUDIO - andamento'
  $rodando = $false
  if (Test-Path $ArqTrava) {
    $pidTrava = (Get-Content $ArqTrava -Raw).Trim()
    if ($pidTrava -and (Get-Process -Id $pidTrava -ErrorAction SilentlyContinue)) { $rodando = $true }
  }
  if ($rodando) { Ok "construindo agora: etapa $($e.atual) ($($NomesEtapas[[int]$e.atual])) ha $(Duracao $e.atual_desde)" }
  elseif ([int]$e.proxima -gt 7) { Ok 'fase PC terminada' }
  else { Aviso "parado. Proxima etapa: $($e.proxima) ($($NomesEtapas[[int]$e.proxima])). Rode o script de novo pra continuar." }
  if ($e.inicio) { Info "tempo total desde o inicio: $(Duracao $e.inicio)   modelo: $($e.modelo)" }
  if (Test-Path $ArqHist) {
    Titulo 'Etapas'
    Import-Csv $ArqHist -Delimiter ';' | ForEach-Object { Info ("etapa {0}: {1}  (tentativas {2}, esperas de limite {3})" -f $_.etapa, $_.resultado, $_.tentativas, $_.esperas_limite) }
  }
  $ultimo = Get-ChildItem $Logs -Filter 'etapa-*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1
  if ($ultimo) {
    Titulo "Ultimas acoes ($($ultimo.Name))"
    Get-Content $ultimo.FullName -Tail 12 -Encoding UTF8 | ForEach-Object { Mostrar $_ }
  }
  if (Test-Path $Pendencias) {
    $n = (Select-String -Path $Pendencias -Pattern '^\s*- \[ \]' -ErrorAction SilentlyContinue).Count
    Titulo 'Pendencias'
    Info "$n item(ns) em docs\pendencias-do-joao.md"
  }
  exit 0
}

# trava: nao deixa rodar dois ao mesmo tempo
if (Test-Path $ArqTrava) {
  $pidTrava = (Get-Content $ArqTrava -Raw).Trim()
  if ($pidTrava -and (Get-Process -Id $pidTrava -ErrorAction SilentlyContinue)) {
    Aviso "Ja tem uma construcao rodando (processo $pidTrava). Veja com -Status."
    exit 1
  }
}
"$PID" | Set-Content -Path $ArqTrava

# PC acordado enquanto o script roda (so no Windows)
$Acordado = $false
try {
  Add-Type -Namespace Hrzz -Name Energia -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);' -ErrorAction Stop
  [Hrzz.Energia]::SetThreadExecutionState([uint32]2147483649) | Out-Null
  $Acordado = $true
} catch {}

try {

Titulo 'HRZZ STUDIO - montar a fase PC'
Info "pasta: $Raiz"
Info "modelo pra construir: $Modelo (esforco $Esforco), sem o agy"

# 1. Checagem inicial ---------------------------------------------------------------
Titulo 'Checagem inicial (so aqui o script pode pedir algo)'

if (-not (Tem 'winget')) { Aviso "winget nao encontrado. Instale o 'App Installer' pela Microsoft Store e rode de novo."; exit 1 }
$programas = @('git', 'node', 'npm', 'python', 'uv', 'ffmpeg', 'yt-dlp')
$faltam = @($programas | Where-Object { -not (Tem $_) })
if ($faltam.Count -gt 0) {
  Aviso ("Faltam: " + ($faltam -join ', ') + ". Vai aparecer UMA janela do Windows pedindo permissao de administrador: aceite.")
  $argsInst = "-NoProfile -ExecutionPolicy Bypass -File `"$Instalador`" -Sim -SoProgramas -SemAgy"
  try { Start-Process powershell -Verb RunAs -Wait -ArgumentList $argsInst } catch { Aviso 'A permissao foi negada. Rode de novo e aceite a janela.'; exit 1 }
  AtualizarPath
  $faltam = @($programas | Where-Object { -not (Tem $_) })
  if ($faltam.Count -gt 0) { Aviso ("Ainda faltam: " + ($faltam -join ', ') + ". Feche o WezTerm, abra de novo e rode o script outra vez."); exit 1 }
}
Ok 'programas instalados'

& powershell -NoProfile -ExecutionPolicy Bypass -File $Instalador -Sim -SemProgramas -SemAgy | Out-Null
if (-not (Test-Path (Join-Path $Raiz 'node_modules'))) { Aviso 'O npm install falhou. Rode: npm install   e veja o erro.'; exit 1 }
Ok 'dependencias do projeto e Chromium dos testes'

if ($env:ANTHROPIC_API_KEY) {
  Remove-Item Env:\ANTHROPIC_API_KEY
  Aviso 'ANTHROPIC_API_KEY estava definida. Tirei dela nesta janela pra usar a sua assinatura (rode npm run checar depois pra remover de vez).'
}
if (-not (Tem 'claude')) {
  Info 'Instalando o Claude Code (instalador oficial)...'
  try { Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression } catch { Aviso "Falhou: $($_.Exception.Message)" }
  AtualizarPath
  if (-not (Tem 'claude')) { Aviso 'O claude nao apareceu. Feche o WezTerm, abra de novo e rode o script outra vez.'; exit 1 }
}
function ClaudeResponde { $s = (& claude -p 'Responda apenas a palavra ok' --model $Modelo 2>&1 | Out-String); return ($s -match '(?i)\bok\b') }
$t = 0
while (-not (ClaudeResponde)) {
  $t++
  if ($t -gt 3) { Aviso 'O claude nao respondeu depois de 3 tentativas. Rode claude, confira o login e tente de novo.'; exit 1 }
  Aviso 'O claude nao esta logado (ou nao respondeu).'
  Write-Host '  Vai abrir o Claude aqui. Digite /login, entre com a SUA ASSINATURA (nao chave de API) e depois /exit.'
  Read-Host '  Enter pra abrir' | Out-Null
  & claude
}
Ok "claude logado e respondendo com o $Modelo"

if (-not (git config user.name)) { git config user.name 'Joao Pedro Rizzi'; Info 'nome dos commits: Joao Pedro Rizzi (so neste repositorio)' }
if (-not (git config user.email)) { git config user.email 'Riizzi@users.noreply.github.com'; Info 'e-mail dos commits: Riizzi@users.noreply.github.com (so neste repositorio)' }
if (-not $SemPush) {
  Info 'Conferindo acesso ao GitHub (se abrir uma janela de login, entre com a conta Riizzi)...'
  git ls-remote origin HEAD | Out-Null
  if ($LASTEXITCODE -ne 0) { Aviso 'Sem acesso ao GitHub. Sigo sem push; os commits ficam so no PC.'; $SemPush = $true } else { Ok 'GitHub acessivel' }
}
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'never'

$ajuda = (claude --help 2>&1 | Out-String)
if ($ajuda -match 'bypassPermissions') { $perm = @('--permission-mode', 'bypassPermissions') }
elseif ($ajuda -match 'dangerously-skip-permissions') { $perm = @('--dangerously-skip-permissions') }
else { Aviso 'Nao achei o modo sem confirmacao no claude --help. Rode: claude update   e tente de novo.'; exit 1 }
$extra = @('--model', $Modelo, '--output-format', 'stream-json', '--verbose')
if ($ajuda -match '--effort') { $extra += @('--effort', $Esforco) }

Write-Host ''
Write-Host '  ===============================================================' -ForegroundColor Green
Write-Host '   PRONTO. Daqui pra frente nao pergunto mais nada: pode largar.' -ForegroundColor Green
Write-Host '   Nao feche esta janela. Pra acompanhar, em outra aba:' -ForegroundColor Green
Write-Host '   powershell -ExecutionPolicy Bypass -File .\scripts\montar-tudo.ps1 -Status' -ForegroundColor Green
Write-Host '  ===============================================================' -ForegroundColor Green

# 2. Construcao -----------------------------------------------------------------------
$estado = LerEstado
if (-not $estado.inicio) { $estado | Add-Member -Force NoteProperty inicio (Get-Date -Format s) }
$estado | Add-Member -Force NoteProperty modelo $Modelo
$inicio = if ($De -ge 0) { $De } else { [int]$estado.proxima }
if ($Ate -gt 7) { $Ate = 7; Info 'A etapa 8 (hospedagem) e feita junto com voce, fora do script.' }

for ($n = $inicio; $n -le $Ate; $n++) {
  Titulo "Etapa $n de $Ate : $($NomesEtapas[$n])"
  $iniEtapa = Get-Date -Format s
  $estado | Add-Member -Force NoteProperty atual $n
  $estado | Add-Member -Force NoteProperty atual_desde $iniEtapa
  SalvarEstado $estado
  $falhas = 0; $esperas = 0; $tentativas = 0; $continuar = $false
  while ($true) {
    $tentativas++
    $prompt = "MODO AUTOMATICO. Leia docs/automatico.md e siga. Depois execute as instrucoes de .claude/commands/etapa.md com ARGUMENTS = $n, ou seja, construa a etapa $n."
    if ($continuar) { $prompt = "MODO AUTOMATICO, CONTINUAR. Leia docs/automatico.md. A etapa $n ainda nao terminou: veja git log, git status e o checklist em docs/07-etapas.md e continue de onde parou." }
    if ($SemPush) { $prompt += ' SEM PUSH.' }
    $log = Join-Path $Logs ("etapa-$n-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + "-t$tentativas.log")
    Info "log: $log"
    $final = ''
    $argsClaude = @('-p', $prompt) + $perm + $extra
    & claude @argsClaude 2>&1 | ForEach-Object {
      $linha = "$_"
      Add-Content -Path $log -Value $linha -Encoding UTF8
      Mostrar $linha
      try { $j = $linha | ConvertFrom-Json -ErrorAction Stop; if ($j.type -eq 'result') { $final = "$($j.result)" } } catch {}
    }
    $fim = ((Get-Content -Path $log -Tail 15 -ErrorAction SilentlyContinue) -join "`n") + "`n" + $final

    if ($final -match "ETAPA $n CONCLUIDA") {
      Historico $n $iniEtapa $tentativas $esperas 'concluida'
      $estado | Add-Member -Force NoteProperty proxima ($n + 1)
      SalvarEstado $estado
      Ok "Etapa $n concluida ($(Duracao $iniEtapa))"
      break
    }
    if ($fim -match '(?i)(usage limit|rate limit|limit reached|limit will reset|hit your limit|resets at|limite de uso)') {
      $esperas++
      if ($esperas -gt 216) { Historico $n $iniEtapa $tentativas $esperas 'parada no limite'; Aviso 'Esperei 72 h pelo limite. Rode o script de novo mais tarde; ele continua daqui.'; exit 1 }
      Aviso ("Bateu o limite de uso do Claude ({0}). Espero {1} min e continuo sozinho." -f (Get-Date -Format 'HH:mm'), [int]($EsperaLimite / 60))
      Start-Sleep -Seconds $EsperaLimite
      $continuar = $true
      continue
    }
    $falhas++
    if ($final -match "ETAPA $n INCOMPLETA") { Aviso ($final -split "`n" | Select-Object -Last 1) }
    if ($falhas -ge 4) {
      Historico $n $iniEtapa $tentativas $esperas 'incompleta'
      Aviso "A etapa $n nao fechou depois de 4 tentativas."
      Aviso "Veja o log ($log) e docs\pendencias-do-joao.md. Rode o script de novo pra continuar daqui."
      exit 1
    }
    Aviso "A etapa $n ainda nao fechou. Continuando (tentativa $($falhas + 1) de 4)..."
    $continuar = $true
  }
}

# 3. Fim -------------------------------------------------------------------------------
$estado = LerEstado
$saude = 'nao conferido'
if ([int]$estado.proxima -gt 7) {
  Titulo 'Ligando o HRZZ'
  $temBuild = (& node -e "process.stdout.write(require('./package.json').scripts.build ? 'sim' : 'nao')" 2>$null)
  if ($temBuild -eq 'sim') {
    Info 'npm run build...'
    npm run build 2>&1 | Add-Content -Path (Join-Path $Logs 'build-final.log') -Encoding UTF8
    if ($LASTEXITCODE -eq 0) { Ok 'build final pronto' } else { Aviso 'O build final deu erro (veja dados\logs\build-final.log).' }
  }
  if (Test-Path (Join-Path $Raiz 'scripts\vigia.mjs')) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'iniciar.ps1') -Instalar
    try { Start-ScheduledTask -TaskName 'HRZZ STUDIO' -ErrorAction Stop } catch { Aviso 'Nao consegui iniciar a tarefa agora; ela sobe no proximo login.' }
    $saude = 'sem resposta'
    for ($i = 0; $i -lt 30; $i++) {
      Start-Sleep -Seconds 3
      try { Invoke-WebRequest -Uri 'http://127.0.0.1:7000/' -UseBasicParsing -TimeoutSec 5 | Out-Null; $saude = 'respondendo'; break }
      catch { if ($_.Exception.Response) { $saude = 'respondendo'; break } }
    }
    if ($saude -eq 'respondendo') {
      Ok 'HRZZ respondendo em http://localhost:7000 (abre sozinho quando voce entrar no Windows)'
      Start-Process 'http://localhost:7000'
    } else { Aviso 'O HRZZ nao respondeu em 90 s. Veja dados\logs e rode: npm run checar' }
  } else { Aviso 'O vigia nao existe (scripts\vigia.mjs). Veja as pendencias.' }
}

# relatorio
$linhas = @('# Relatorio da construcao do HRZZ STUDIO', '', "- gerado em: $(Get-Date -Format 'dd/MM/yyyy HH:mm')", "- modelo: $Modelo (esforco $Esforco), sem o agy", "- tempo total: $(Duracao $estado.inicio)", "- HRZZ em localhost:7000: $saude", '', '| etapa | resultado | tentativas | esperas de limite | inicio | fim |', '|---|---|---|---|---|---|')
if (Test-Path $ArqHist) { Import-Csv $ArqHist -Delimiter ';' | ForEach-Object { $linhas += ('| {0} {1} | {2} | {3} | {4} | {5} | {6} |' -f $_.etapa, $NomesEtapas[[int]$_.etapa], $_.resultado, $_.tentativas, $_.esperas_limite, $_.inicio, $_.fim) } }
$linhas += @('', 'O que ficou pra voce: docs/pendencias-do-joao.md', 'Logs: dados/logs/')
$linhas | Set-Content -Path $ArqRelatorio -Encoding UTF8
Ok "relatorio: $ArqRelatorio"

if (Test-Path $Pendencias) {
  Titulo 'O que ficou pra voce fazer'
  Get-Content $Pendencias -Encoding UTF8 | ForEach-Object { Write-Host "  $_" }
}
Titulo 'Fim'
Info 'A etapa 8 (hospedagem no servidor) e feita junto com voce, quando o servidor estiver pronto.'

} finally {
  if ($Acordado) { try { [Hrzz.Energia]::SetThreadExecutionState([uint32]2147483648) | Out-Null } catch {} }
  Remove-Item $ArqTrava -ErrorAction SilentlyContinue
}
