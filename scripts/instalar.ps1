# HRZZ STUDIO - instalador dos pre-requisitos (Windows 11)
# Uso (na pasta do repositorio):
#   powershell -ExecutionPolicy Bypass -File .\scripts\instalar.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\instalar.ps1 -Sim   (nao pergunta nada)
# Opcoes usadas pelo montar-tudo.ps1:
#   -SoProgramas    so instala os programas pelo winget (roda como administrador, uma vez)
#   -SemProgramas   pula os programas e faz o resto (pastas, npm install, Chromium)
#   -SemAgy         nao mexe no agy
# Este arquivo e so ASCII de proposito (PowerShell 5 quebra acentos em UTF-8 sem BOM).

param([switch]$Sim, [switch]$SoProgramas, [switch]$SemProgramas, [switch]$SemAgy)
$ErrorActionPreference = 'Stop'
$Raiz = Split-Path -Parent $PSScriptRoot

function Titulo($t) { Write-Host ""; Write-Host "== $t ==" -ForegroundColor Yellow }
function Ok($t) { Write-Host "  [ok] $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "  [!]  $t" -ForegroundColor Magenta }
function Perguntar($t) {
  if ($Sim) { return $true }
  $r = Read-Host "  $t (s/n)"
  return ($r -match '^(s|S|y|Y)')
}
function AtualizarPath {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Tem($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

Titulo "HRZZ STUDIO - instalador"
Write-Host "  pasta: $Raiz"

if (-not (Tem 'winget')) {
  Aviso "winget nao encontrado. Instale o 'App Installer' pela Microsoft Store e rode de novo."
  exit 1
}

$itens = @(
  @{ Cmd = 'git';    Id = 'Git.Git';            Nome = 'Git' },
  @{ Cmd = 'node';   Id = 'OpenJS.NodeJS.LTS';  Nome = 'Node.js LTS' },
  @{ Cmd = 'python'; Id = 'Python.Python.3.12'; Nome = 'Python 3.12' },
  @{ Cmd = 'uv';     Id = 'astral-sh.uv';       Nome = 'uv (gerenciador Python)' },
  @{ Cmd = 'ffmpeg'; Id = 'Gyan.FFmpeg';        Nome = 'FFmpeg' },
  @{ Cmd = 'yt-dlp'; Id = 'yt-dlp.yt-dlp';      Nome = 'yt-dlp' }
)

if (-not $SemProgramas) {
Titulo "Programas"
foreach ($i in $itens) {
  if (Tem $i.Cmd) { Ok "$($i.Nome) ja instalado"; continue }
  if (Perguntar "Instalar $($i.Nome) pelo winget?") {
    winget install --id $i.Id -e --accept-source-agreements --accept-package-agreements
    AtualizarPath
    if (Tem $i.Cmd) { Ok "$($i.Nome) instalado" } else { Aviso "$($i.Nome) instalado, mas so aparece num terminal novo. Feche e abra o terminal depois." }
  } else {
    Aviso "$($i.Nome) pulado"
  }
}
}
if ($SoProgramas) { Titulo "Programas prontos"; exit 0 }

Titulo "Claude Code e agy"
if (Tem 'claude') { Ok "claude encontrado" } else {
  Aviso "claude nao encontrado. Instale com o instalador oficial (PowerShell):"
  Write-Host "      irm https://claude.ai/install.ps1 | iex"
  Write-Host "      depois rode: claude   e faca o /login com a sua assinatura"
}
$agyLocal = Join-Path $env:LOCALAPPDATA 'agy\bin'
if ($SemAgy) { Ok "agy ignorado nesta instalacao" }
elseif (Tem 'agy') { Ok "agy encontrado" }
elseif (Test-Path (Join-Path $agyLocal 'agy.exe')) {
  Aviso "agy existe em $agyLocal mas nao esta no PATH."
  if (Perguntar "Adicionar ao PATH do usuario?") {
    $p = [Environment]::GetEnvironmentVariable('Path', 'User')
    [Environment]::SetEnvironmentVariable('Path', "$p;$agyLocal", 'User')
    AtualizarPath
    Ok "agy adicionado ao PATH"
  }
} else { Aviso "agy nao encontrado. Instale o Antigravity CLI e faca login com a conta do Google AI Plus." }

Titulo "Chave de API"
if ($env:ANTHROPIC_API_KEY -or [Environment]::GetEnvironmentVariable('ANTHROPIC_API_KEY', 'User') -or [Environment]::GetEnvironmentVariable('ANTHROPIC_API_KEY', 'Machine')) {
  Aviso "ANTHROPIC_API_KEY esta definida. Com ela o Claude Code cobra pela API em vez de usar a sua assinatura."
  Write-Host "      Para remover (usuario):  [Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY', `$null, 'User')"
} else { Ok "ANTHROPIC_API_KEY nao esta definida (certo: usa a assinatura)" }

Titulo "Pastas de dados"
foreach ($d in @('memoria', 'skills', 'comandos', 'projetos', 'transcricoes', 'anexos', 'segredos', 'logs', 'backups')) {
  $c = Join-Path $Raiz "dados\$d"
  if (-not (Test-Path $c)) { New-Item -ItemType Directory -Path $c | Out-Null }
}
Ok "dados\ pronto (fica fora do git)"

Titulo "Dependencias do projeto"
if (Tem 'npm') {
  Push-Location $Raiz
  try {
    npm install
    npx playwright install chromium
    Ok "npm install e Chromium do Playwright prontos"
  } finally { Pop-Location }
} else { Aviso "npm ainda nao esta disponivel. Feche o terminal, abra de novo e rode este script outra vez." }

Titulo "Pronto"
Write-Host "  Proximo passo: rode  npm run checar  e depois abra o Claude Code nesta pasta (claude) e digite  /etapa 0"
