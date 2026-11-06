# HRZZ STUDIO - monta tudo de uma vez
#
# O que faz, em ordem:
#   1. instala o que falta (Git, Node, Python, uv, FFmpeg, yt-dlp, Chromium do Playwright)
#   2. instala o Claude Code se precisar e confere os logins do claude e do agy
#   3. confere o acesso ao GitHub (pra nao travar de madrugada pedindo senha)
#   4. constroi as etapas 0 a 6 sozinho, com o claude em modo automatico (docs/automatico.md)
#      - continua de onde parou se voce rodar de novo
#      - se bater o limite de uso do Claude, espera renovar e segue
#      - mantem o PC acordado enquanto roda
#   5. liga o HRZZ pra abrir junto com o Windows e abre no navegador
#
# Uso (na pasta do repositorio):
#   powershell -ExecutionPolicy Bypass -File .\scripts\montar-tudo.ps1
# Opcoes:
#   -De 2 -Ate 4      constroi so essas etapas
#   -SemInstalar      pula o passo 1
#   -SemPush          nao manda nada pro GitHub
#   -Modelo sonnet    usa outro modelo pra construir (padrao: opus)
#
# Arquivo so ASCII de proposito (PowerShell 5 quebra acentos).

param(
  [int]$De = -1,
  [int]$Ate = 6,
  [switch]$SemInstalar,
  [switch]$SemPush,
  [string]$Modelo = 'opus',
  [int]$EsperaLimite = 1200
)

$ErrorActionPreference = 'Continue'
$Raiz = Split-Path -Parent $PSScriptRoot
Set-Location $Raiz
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$Logs = Join-Path $Raiz 'dados\logs'
New-Item -ItemType Directory -Force -Path $Logs | Out-Null
$ArqEstado = Join-Path $Raiz 'dados\construcao.json'
$Pendencias = Join-Path $Raiz 'docs\pendencias-do-joao.md'
$NomesEtapas = @('fundacao', 'conversa', 'preview e companhia', 'transcricao', 'acervo', 'IA junta', 'integracoes', 'fora de casa')

function Titulo($t) { Write-Host ''; Write-Host "== $t ==" -ForegroundColor Yellow }
function Ok($t) { Write-Host "  [ok] $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "  [!]  $t" -ForegroundColor Magenta }
function Info($t) { Write-Host "  $t" -ForegroundColor DarkGray }
function Tem($c) { return [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function AtualizarPath {
  $m = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $u = [Environment]::GetEnvironmentVariable('Path', 'User')
  $extra = @((Join-Path $env:USERPROFILE '.local\bin'), (Join-Path $env:LOCALAPPDATA 'agy\bin')) | Where-Object { $_ -and (Test-Path $_) }
  $env:Path = (@($m, $u) + $extra | Where-Object { $_ }) -join ';'
}
function Responde($cmd) {
  $saida = (& $cmd -p 'Responda apenas a palavra ok' 2>&1 | Out-String)
  return ($saida -match '(?i)\bok\b')
}
function LerEstado {
  if (Test-Path $ArqEstado) { try { return (Get-Content $ArqEstado -Raw | ConvertFrom-Json) } catch {} }
  return [pscustomobject]@{ proxima = 0 }
}
function SalvarEstado($n) {
  ([pscustomobject]@{ proxima = $n; quando = (Get-Date -Format s) } | ConvertTo-Json) | Set-Content -Path $ArqEstado -Encoding UTF8
}

# PC acordado enquanto o script roda (so no Windows)
$Acordado = $false
try {
  Add-Type -Namespace Hrzz -Name Energia -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);' -ErrorAction Stop
  [Hrzz.Energia]::SetThreadExecutionState([uint32]2147483649) | Out-Null
  $Acordado = $true
} catch {}

Titulo 'HRZZ STUDIO - montar tudo'
Info "pasta: $Raiz"
Info 'Deixe o notebook na tomada. A construcao leva varias horas e gasta bastante da cota do Claude.'

# 1. Programas -----------------------------------------------------------------
if (-not $SemInstalar) {
  Titulo '1. Programas'
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'instalar.ps1') -Sim
  if ($LASTEXITCODE -ne 0) { Aviso 'O instalador parou. Resolva o aviso acima e rode este script de novo.'; exit 1 }
  AtualizarPath
}

foreach ($c in @('git', 'node', 'npm')) {
  if (-not (Tem $c)) { Aviso "$c nao encontrado. Feche o terminal, abra de novo e rode o script outra vez."; exit 1 }
}
if (-not (Test-Path (Join-Path $Raiz 'node_modules'))) {
  Info 'Instalando dependencias do projeto...'
  npm install
  npx playwright install chromium
}

# 2. Claude e agy --------------------------------------------------------------
Titulo '2. Claude e agy'
if ($env:ANTHROPIC_API_KEY) {
  Remove-Item Env:\ANTHROPIC_API_KEY
  Aviso 'ANTHROPIC_API_KEY estava definida. Tirei dela nesta janela pra usar a sua assinatura. Rode npm run checar depois pra remover de vez.'
}
if (-not (Tem 'claude')) {
  Info 'Instalando o Claude Code (instalador oficial)...'
  try { Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression } catch { Aviso "Falhou: $($_.Exception.Message)" }
  AtualizarPath
  if (-not (Tem 'claude')) { Aviso 'O claude nao apareceu. Feche o terminal, abra de novo e rode o script outra vez.'; exit 1 }
}
Ok 'claude instalado'

$t = 0
while (-not (Responde 'claude')) {
  $t++
  if ($t -gt 3) { Aviso 'O claude nao respondeu depois de 3 tentativas. Rode claude, confira o login e tente de novo.'; exit 1 }
  Aviso 'O claude nao esta logado (ou nao respondeu).'
  Write-Host '  Vai abrir o Claude aqui. Digite /login, entre com a SUA ASSINATURA (nao chave de API) e depois /exit.'
  Read-Host '  Enter pra abrir' | Out-Null
  & claude
}
Ok 'claude logado e respondendo'

if (Tem 'agy') {
  if (-not (Responde 'agy')) {
    Aviso 'O agy nao respondeu. Vai abrir o agy pra voce fazer o login do Google; depois saia dele.'
    Read-Host '  Enter pra abrir (ou Ctrl+C pra pular)' | Out-Null
    & agy
  }
  if (Responde 'agy') { Ok 'agy logado e respondendo' } else { Aviso 'agy sem resposta. Sigo sem ele; dueto e duelo ficam pra testar depois.' }
} else { Aviso 'agy nao encontrado. Sigo sem ele; dueto e duelo ficam pra testar depois.' }

# 3. Git e GitHub --------------------------------------------------------------
Titulo '3. Git e GitHub'
if (-not (git config --global user.name)) {
  $nome = Read-Host '  Seu nome pros commits (ex.: Joao Pedro Rizzi)'
  git config --global user.name "$nome"
}
if (-not (git config --global user.email)) {
  $mail = Read-Host '  Seu e-mail do GitHub'
  git config --global user.email "$mail"
}
if (-not $SemPush) {
  Info 'Conferindo acesso ao GitHub (se abrir uma janela de login, entre com a conta Riizzi)...'
  git ls-remote origin HEAD | Out-Null
  if ($LASTEXITCODE -ne 0) { Aviso 'Sem acesso ao GitHub. Sigo sem push; os commits ficam so no PC.'; $SemPush = $true } else { Ok 'GitHub acessivel' }
}
# daqui pra frente nada pode ficar esperando senha
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'never'

# 4. Construcao ----------------------------------------------------------------
Titulo '4. Construcao'
$ajuda = (claude --help 2>&1 | Out-String)
if ($ajuda -match 'bypassPermissions') { $perm = @('--permission-mode', 'bypassPermissions') }
elseif ($ajuda -match 'dangerously-skip-permissions') { $perm = @('--dangerously-skip-permissions') }
else { Aviso 'Nao achei o modo sem confirmacao no claude --help. Atualize o Claude Code (claude update) e rode de novo.'; exit 1 }
$extra = @('--model', $Modelo, '--output-format', 'stream-json', '--verbose')
if ($ajuda -match '--effort') { $extra += @('--effort', 'high') }

$estado = LerEstado
$inicio = if ($De -ge 0) { $De } else { [int]$estado.proxima }
if ($inicio -gt $Ate) { Ok "Etapas ate a $Ate ja estavam prontas." }

for ($n = $inicio; $n -le $Ate; $n++) {
  Titulo "Etapa $n de $Ate : $($NomesEtapas[$n])"
  $falhas = 0
  $esperas = 0
  $continuar = $false
  while ($true) {
    $prompt = "MODO AUTOMATICO. Leia docs/automatico.md e siga. Depois execute as instrucoes de .claude/commands/etapa.md com ARGUMENTS = $n, ou seja, construa a etapa $n."
    if ($continuar) { $prompt = "MODO AUTOMATICO, CONTINUAR. Leia docs/automatico.md. A etapa $n ainda nao terminou: veja git log, git status e o checklist em docs/07-etapas.md e continue de onde parou." }
    if ($SemPush) { $prompt += ' SEM PUSH.' }
    $log = Join-Path $Logs ("etapa-$n-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
    Info "log: $log"
    $final = ''
    $args2 = @('-p', $prompt) + $perm + $extra
    & claude @args2 2>&1 | ForEach-Object {
      $linha = "$_"
      Add-Content -Path $log -Value $linha -Encoding UTF8
      try {
        $j = $linha | ConvertFrom-Json -ErrorAction Stop
        if ($j.type -eq 'assistant' -and $j.message.content) {
          foreach ($b in $j.message.content) {
            if ($b.type -eq 'tool_use') {
              $alvo = ''
              if ($b.input.file_path) { $alvo = $b.input.file_path } elseif ($b.input.command) { $alvo = "$($b.input.command)" } elseif ($b.input.description) { $alvo = $b.input.description }
              if ($alvo.Length -gt 90) { $alvo = $alvo.Substring(0, 90) + '...' }
              Write-Host ("    > {0} {1}" -f $b.name, $alvo) -ForegroundColor DarkGray
            } elseif ($b.type -eq 'text' -and $b.text) {
              $txt = ($b.text -replace '\s+', ' ').Trim()
              if ($txt.Length -gt 140) { $txt = $txt.Substring(0, 140) + '...' }
              if ($txt) { Write-Host "    $txt" }
            }
          }
        } elseif ($j.type -eq 'result') {
          $final = "$($j.result)"
        }
      } catch {
        if ($linha.Trim()) { Write-Host "    $linha" -ForegroundColor DarkGray }
      }
    }
    $fim = ((Get-Content -Path $log -Tail 15 -ErrorAction SilentlyContinue) -join "`n") + "`n" + $final

    if ($final -match "ETAPA $n CONCLUIDA") {
      SalvarEstado ($n + 1)
      Ok "Etapa $n concluida"
      break
    }
    if ($fim -match '(?i)(usage limit|rate limit|limit reached|limit will reset|hit your limit|resets at|limite de uso)') {
      $esperas++
      if ($esperas -gt 72) { Aviso 'Esperei 24 h pelo limite e nao liberou. Rode o script de novo mais tarde; ele continua daqui.'; exit 1 }
      Aviso "Bateu o limite de uso do Claude. Espero 20 min e continuo sozinho (tentativa $esperas)."
      Start-Sleep -Seconds $EsperaLimite
      $continuar = $true
      continue
    }
    $falhas++
    if ($final -match "ETAPA $n INCOMPLETA") { Aviso ($final -split "`n" | Select-Object -Last 1) }
    if ($falhas -ge 4) {
      Aviso "A etapa $n nao fechou depois de 4 tentativas."
      Aviso "Veja o log ($log) e docs\pendencias-do-joao.md. Rode o script de novo pra continuar daqui."
      exit 1
    }
    Aviso "A etapa $n ainda nao fechou. Continuando (tentativa $($falhas + 1) de 4)..."
    $continuar = $true
  }
}

# 5. Ligar e abrir -------------------------------------------------------------
Titulo '5. Ligar o HRZZ'
$vigia = Join-Path $Raiz 'scripts\vigia.mjs'
if (Test-Path $vigia) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'iniciar.ps1') -Instalar
  try { Start-ScheduledTask -TaskName 'HRZZ STUDIO' -ErrorAction Stop } catch { Aviso 'Nao consegui iniciar a tarefa agora; ela sobe no proximo login.' }
  Start-Sleep -Seconds 10
  Start-Process 'http://localhost:7000'
  Ok 'HRZZ ligado em http://localhost:7000 (abre sozinho quando voce entrar no Windows)'
} else {
  Aviso 'O vigia ainda nao existe (etapa 1 nao terminou). Nada pra ligar ainda.'
}

if (Test-Path $Pendencias) {
  Titulo 'O que ficou pra voce fazer'
  Get-Content $Pendencias -Encoding UTF8 | ForEach-Object { Write-Host "  $_" }
}

Titulo 'Fim'
Info 'A etapa 7 (Tailscale, Cloudflare, avisos no celular, backup no GitHub) precisa das suas contas: rode claude e digite /etapa 7 quando quiser.'
if ($Acordado) { try { [Hrzz.Energia]::SetThreadExecutionState([uint32]2147483648) | Out-Null } catch {} }
