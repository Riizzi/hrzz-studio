# HRZZ STUDIO - tunel da Cloudflare (acesso pelo PC do trabalho)
# Liga https://studio.hrzztech.com ao HRZZ deste PC (127.0.0.1:7000), sem abrir porta no roteador.
#
# Uso (na pasta do repositorio):
#   powershell -ExecutionPolicy Bypass -File .\scripts\tunel.ps1 -Token "<token do painel>"   instala e liga
#   powershell -ExecutionPolicy Bypass -File .\scripts\tunel.ps1 -Status                      confere se esta no ar
#   powershell -ExecutionPolicy Bypass -File .\scripts\tunel.ps1 -Remover                     desliga e remove
#
# O token aparece no painel da Cloudflare (Networking > Tunnels > seu tunel), no comando de instalacao do
# Windows: e o texto longo depois de "service install". Ele e um segredo: nao salve no repositorio.
# Opcoes do cloudflared conferidas com --help (versao 2026.11.1): "service install <token>", "service uninstall".
# Este arquivo e so ASCII de proposito (PowerShell 5 quebra acentos em UTF-8 sem BOM).

param([string]$Token, [switch]$Status, [switch]$Remover, [string]$Endereco = 'studio.hrzztech.com')
$ErrorActionPreference = 'Stop'

function Titulo($t) { Write-Host ""; Write-Host "== $t ==" -ForegroundColor Yellow }
function Ok($t) { Write-Host "  [ok] $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "  [!]  $t" -ForegroundColor Magenta }
function Tem($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function AtualizarPath {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function EhAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  return (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Confere de fora: o endereco tem que cair na tela de login da Cloudflare, nunca direto no HRZZ
function ConferirDeFora {
  Titulo "Conferindo https://$Endereco"
  try {
    $r = Invoke-WebRequest -Uri "https://$Endereco/api/saude" -MaximumRedirection 0 -UseBasicParsing -TimeoutSec 20 -ErrorAction Stop
    if ($r.StatusCode -eq 200) {
      Aviso "O HRZZ respondeu SEM a tela de login da Cloudflare. Falta a aplicacao do Access (passo 2 do docs/tunel.md)."
      Aviso "O PIN continua valendo e o terminal fica bloqueado, mas crie o Access antes de usar."
      return
    }
    Write-Host "  resposta $($r.StatusCode)"
  } catch {
    $resp = $_.Exception.Response
    if ($resp -and [int]$resp.StatusCode -ge 300 -and [int]$resp.StatusCode -lt 400) {
      $destino = [string]$resp.Headers['Location']
      if ($destino -match 'cloudflareaccess\.com') { Ok "protegido: quem abrir cai no login por codigo no e-mail"; return }
      Aviso "redireciona pra $destino (esperava a tela da Cloudflare Access)"
      return
    }
    if ($resp -and [int]$resp.StatusCode -eq 530) { Aviso "a Cloudflare nao achou o tunel ligado (erro 530). Veja se o servico cloudflared esta rodando."; return }
    if ($resp -and [int]$resp.StatusCode -eq 502) { Aviso "o tunel esta no ar, mas o HRZZ nao respondeu em 127.0.0.1:7000. Ligue o HRZZ."; return }
    Aviso "nao deu pra abrir agora: $($_.Exception.Message)"
    Aviso "O DNS pode levar alguns minutos pra valer. Rode -Status de novo daqui a pouco."
  }
}

function MostrarServico {
  $s = Get-Service -Name 'cloudflared' -ErrorAction SilentlyContinue
  if (-not $s) { Aviso "servico cloudflared nao instalado"; return $false }
  if ($s.Status -eq 'Running') { Ok "servico cloudflared rodando (liga junto com o Windows)" } else { Aviso "servico cloudflared existe, mas esta $($s.Status)" }
  return $true
}

Titulo "HRZZ STUDIO - tunel da Cloudflare"

# aceita o comando inteiro colado do painel ("cloudflared.exe service install eyJ..."): fica so o token
if ($Token) { $Token = (($Token.Trim()) -split '\s+')[-1].Trim('"', "'") }
if ($Token -and $Token -notmatch '^[A-Za-z0-9_\-=+/\.]+$') { Aviso "o token tem caracteres estranhos. Copie de novo do painel."; exit 1 }

if ($Status) {
  [void](MostrarServico)
  $h = $null
  try { $h = Invoke-WebRequest -Uri 'http://127.0.0.1:7000/api/saude' -UseBasicParsing -TimeoutSec 5 } catch {}
  if ($h -and $h.StatusCode -eq 200) { Ok "HRZZ respondendo em 127.0.0.1:7000" } else { Aviso "HRZZ nao respondeu em 127.0.0.1:7000" }
  ConferirDeFora
  exit 0
}

# daqui pra baixo mexe em servico do Windows: precisa de administrador (abre UMA janela de permissao)
if (-not (EhAdmin)) {
  Write-Host "  Vai abrir uma janela do Windows pedindo permissao de administrador. Aceite."
  $argumentos = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Endereco', $Endereco)
  if ($Remover) { $argumentos += '-Remover' }
  if ($Token) { $argumentos += @('-Token', $Token) }
  $p = Start-Process powershell -Verb RunAs -ArgumentList $argumentos -Wait -PassThru
  if ($p.ExitCode -ne 0) { Aviso "a parte de administrador terminou com erro ($($p.ExitCode))"; exit $p.ExitCode }
  if (-not $Remover) { Start-Sleep -Seconds 8; ConferirDeFora }
  exit 0
}

# janela de administrador: grava tudo em dados\logs\tunel.log e, se der erro, espera Enter antes de fechar
$Log = Join-Path (Split-Path -Parent $PSScriptRoot) 'dados\logs\tunel.log'
try { New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Log) | Out-Null; Start-Transcript -Path $Log -Force | Out-Null } catch {}
function Sair($codigo) {
  if ($codigo -ne 0) { Write-Host ""; Write-Host "  Deu erro. O log esta em $Log" -ForegroundColor Magenta; Read-Host "  Aperte Enter pra fechar" | Out-Null }
  try { Stop-Transcript | Out-Null } catch {}
  exit $codigo
}
trap { Write-Host "  [!]  $($_.Exception.Message)" -ForegroundColor Magenta; Sair 1 }

if ($Remover) {
  if (Tem 'cloudflared') {
    cloudflared service uninstall
    Ok "tunel desligado e removido deste PC (o tunel continua existindo no painel da Cloudflare)"
  } else { Aviso "cloudflared nao encontrado: nada pra remover" }
  Sair 0
}

if (-not $Token) {
  Aviso "Falta o token. Copie do painel da Cloudflare (ver docs/tunel.md) e rode:"
  Write-Host '      powershell -ExecutionPolicy Bypass -File .\scripts\tunel.ps1 -Token "cole-aqui"'
  Start-Sleep -Seconds 8
  Sair 1
}

Titulo "cloudflared"
if (-not (Tem 'cloudflared')) {
  if (-not (Tem 'winget')) { Aviso "winget nao encontrado. Instale o 'App Installer' pela Microsoft Store."; Sair 1 }
  winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
  AtualizarPath
  if (-not (Tem 'cloudflared')) {
    $padrao = Join-Path ${env:ProgramFiles(x86)} 'cloudflared'
    if (Test-Path (Join-Path $padrao 'cloudflared.exe')) { $env:Path += ";$padrao" }
  }
}
if (-not (Tem 'cloudflared')) { Aviso "nao achei o cloudflared depois de instalar. Feche e abra o terminal e rode de novo."; Sair 1 }
Ok ("cloudflared " + ((cloudflared --version) -join ' '))

Titulo "Servico do tunel"
$existente = Get-Service -Name 'cloudflared' -ErrorAction SilentlyContinue
if ($existente) {
  Write-Host "  ja existe um servico cloudflared: trocando pelo token novo"
  cloudflared service uninstall
  Start-Sleep -Seconds 3
}
cloudflared service install $Token
Start-Sleep -Seconds 5
if (-not (MostrarServico)) { Sair 1 }
Ok "pronto. Confira no painel da Cloudflare se o tunel aparece como HEALTHY."
Sair 0
