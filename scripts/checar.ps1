# HRZZ STUDIO - checagem do ambiente
# Uso: npm run checar          (versoes e avisos)
#      npm run checar:login    (tambem testa se o claude e o agy respondem)
# Arquivo so ASCII de proposito.

param([switch]$Login)
$Raiz = Split-Path -Parent $PSScriptRoot
$problemas = 0

function Linha($nome, $ok, $info) {
  $marca = if ($ok) { '[ok]' } else { '[--]' }
  $cor = if ($ok) { 'Green' } else { 'Magenta' }
  Write-Host ("  {0} {1,-10} {2}" -f $marca, $nome, $info) -ForegroundColor $cor
}
function Versao($cmd, $arg) {
  $c = Get-Command $cmd -ErrorAction SilentlyContinue
  if (-not $c) { return $null }
  try { return ((& $cmd $arg 2>&1 | Select-Object -First 1) -as [string]).Trim() } catch { return 'instalado' }
}

Write-Host ""
Write-Host "== HRZZ STUDIO - checagem ==" -ForegroundColor Yellow
$lista = @(
  @('git', '--version'), @('node', '--version'), @('npm', '--version'), @('python', '--version'),
  @('uv', '--version'), @('ffmpeg', '-version'), @('yt-dlp', '--version'), @('claude', '--version'), @('agy', '--version')
)
foreach ($l in $lista) {
  $v = Versao $l[0] $l[1]
  if ($v) { Linha $l[0] $true $v } else { Linha $l[0] $false 'nao encontrado'; $problemas++ }
}

if ($env:ANTHROPIC_API_KEY) {
  Linha 'api key' $false 'ANTHROPIC_API_KEY definida: o Claude Code vai cobrar pela API. Remova.'
  $problemas++
} else { Linha 'api key' $true 'nao definida (usa a assinatura)' }

$dados = Join-Path $Raiz 'dados'
if (Test-Path $dados) { Linha 'dados' $true $dados } else { Linha 'dados' $false 'rode scripts\instalar.ps1'; $problemas++ }

if ($Login) {
  Write-Host ""
  Write-Host "  testando respostas (pode levar alguns segundos)..."
  if (Get-Command claude -ErrorAction SilentlyContinue) {
    $r = (claude -p "Responda apenas: ok" 2>&1 | Out-String).Trim()
    if ($r -match 'ok') { Linha 'claude' $true 'respondeu' } else { Linha 'claude' $false "nao respondeu direito: $r"; $problemas++ }
  }
  if (Get-Command agy -ErrorAction SilentlyContinue) {
    $r = (agy -p "Responda apenas: ok" 2>&1 | Out-String).Trim()
    if ($r -match 'ok') { Linha 'agy' $true 'respondeu' } else { Linha 'agy' $false "nao respondeu direito: $r"; $problemas++ }
  }
}

Write-Host ""
if ($problemas) { Write-Host "  $problemas ponto(s) pra resolver." -ForegroundColor Magenta; exit 1 }
Write-Host "  Tudo certo." -ForegroundColor Green
