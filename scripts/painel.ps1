# HRZZ STUDIO - painel (janela simples pra ligar e desligar tudo)
# Uso (na pasta do repositorio):
#   powershell -ExecutionPolicy Bypass -File .\scripts\painel.ps1               abre o painel
#   powershell -ExecutionPolicy Bypass -File .\scripts\painel.ps1 -CriarAtalho  cria o atalho "HRZZ" na area de trabalho
#
# "ligar tudo":    HRZZ (tarefa 'HRZZ STUDIO'), tunel da Cloudflare (servico cloudflared) e, na tomada,
#                  o PC nao dorme e fechar a tampa nao suspende. Tudo volta sozinho se o PC reiniciar.
# "desligar tudo": desliga o HRZZ e o tunel, nao deixa eles voltarem no proximo boot e devolve
#                  a energia como era antes (guardada em dados\painel-energia.json).
# Na bateria nada muda: fechar a tampa continua suspendendo.
# Mexer em servico do Windows pede administrador: o painel pede a permissao uma vez, ao abrir.
# Este arquivo e so ASCII de proposito (PowerShell 5 quebra acentos em UTF-8 sem BOM);
# os textos com acento usam \u00XX e passam por [regex]::Unescape.

param([switch]$CriarAtalho)
$ErrorActionPreference = 'Stop'
$Raiz = Split-Path -Parent $PSScriptRoot
$Icone = Join-Path $PSScriptRoot 'hrzz.ico'
$Iniciar = Join-Path $PSScriptRoot 'iniciar.ps1'
$Tarefa = 'HRZZ STUDIO'
$Servico = 'cloudflared'
$ArqEnergia = Join-Path $Raiz 'dados\painel-energia.json'
$Endereco = 'studio.hrzztech.com'
function U($s) { return [regex]::Unescape($s) }

# ---------- atalho na area de trabalho ----------
if ($CriarAtalho) {
  $mesa = [Environment]::GetFolderPath('Desktop')
  $lnk = Join-Path $mesa 'HRZZ.lnk'
  $sh = New-Object -ComObject WScript.Shell
  $a = $sh.CreateShortcut($lnk)
  $a.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $a.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  $a.WorkingDirectory = $Raiz
  $a.IconLocation = "$Icone,0"
  $a.Description = 'ligar e desligar o HRZZ STUDIO'
  $a.WindowStyle = 7
  $a.Save()
  Write-Host "  [ok] atalho criado: $lnk" -ForegroundColor Green
  exit 0
}

# ---------- administrador (uma janela de permissao ao abrir) ----------
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$admin = (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  try {
    Start-Process powershell -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
  } catch {}
  exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

# ---------- energia ----------
# powercfg /q imprime os valores atuais (na tomada, na bateria) como as duas ultimas linhas 0x... (vale em qualquer idioma)
function LerEnergia($sub, $item) {
  $saida = (powercfg /q SCHEME_CURRENT $sub $item) -join "`n"
  $hex = [regex]::Matches($saida, '0x[0-9a-fA-F]{8}')
  if ($hex.Count -lt 2) { return $null }
  return [Convert]::ToInt64($hex[$hex.Count - 2].Value, 16)
}
function GravarEnergia($sub, $item, $valor) {
  powercfg /setacvalueindex SCHEME_CURRENT $sub $item $valor | Out-Null
}
function AplicarEnergia { powercfg /setactive SCHEME_CURRENT | Out-Null }

function EnergiaLigada {
  # tampa (na tomada) = 0 "nao fazer nada" e suspender (na tomada) = 0 "nunca"
  return ((LerEnergia 'SUB_BUTTONS' 'LIDACTION') -eq 0) -and ((LerEnergia 'SUB_SLEEP' 'STANDBYIDLE') -eq 0)
}

function LigarEnergia {
  # guarda como estava, so na primeira vez (pra nao guardar o "ligado" por cima)
  if (-not (Test-Path $ArqEnergia)) {
    $antes = @{ tampa = (LerEnergia 'SUB_BUTTONS' 'LIDACTION'); suspender = (LerEnergia 'SUB_SLEEP' 'STANDBYIDLE') }
    if ($null -ne $antes.tampa -and $null -ne $antes.suspender) {
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ArqEnergia) | Out-Null
      ($antes | ConvertTo-Json) | Set-Content -Path $ArqEnergia -Encoding ASCII
    }
  }
  GravarEnergia 'SUB_BUTTONS' 'LIDACTION' 0
  GravarEnergia 'SUB_SLEEP' 'STANDBYIDLE' 0
  AplicarEnergia
}

function DesligarEnergia {
  $tampa = 1; $suspender = 1800   # padrao do Windows: suspender ao fechar a tampa, dormir em 30 min
  if (Test-Path $ArqEnergia) {
    try {
      $antes = Get-Content $ArqEnergia -Raw | ConvertFrom-Json
      if ($null -ne $antes.tampa) { $tampa = [int64]$antes.tampa }
      if ($null -ne $antes.suspender) { $suspender = [int64]$antes.suspender }
    } catch {}
  }
  if ($tampa -eq 0) { $tampa = 1 }
  if ($suspender -eq 0) { $suspender = 1800 }
  GravarEnergia 'SUB_BUTTONS' 'LIDACTION' $tampa
  GravarEnergia 'SUB_SLEEP' 'STANDBYIDLE' $suspender
  AplicarEnergia
  Remove-Item $ArqEnergia -ErrorAction SilentlyContinue
}

# ---------- HRZZ e tunel ----------
function HrzzResponde {
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:7000/api/saude' -UseBasicParsing -TimeoutSec 2
    return ($r.StatusCode -eq 200)
  } catch { return $false }
}
function TunelLigado {
  $s = Get-Service -Name $Servico -ErrorAction SilentlyContinue
  return ($s -and $s.Status -eq 'Running')
}
function TunelExiste { return [bool](Get-Service -Name $Servico -ErrorAction SilentlyContinue) }
function TarefaExiste { return [bool](Get-ScheduledTask -TaskName $Tarefa -ErrorAction SilentlyContinue) }

function LigarTudo {
  if (TarefaExiste) {
    Enable-ScheduledTask -TaskName $Tarefa | Out-Null
    if (-not (HrzzResponde)) { Start-ScheduledTask -TaskName $Tarefa }
  }
  if (TunelExiste) {
    Set-Service -Name $Servico -StartupType Automatic
    if (-not (TunelLigado)) { Start-Service -Name $Servico }
  }
  LigarEnergia
}

function DesligarTudo {
  if (TunelExiste) {
    if (TunelLigado) { Stop-Service -Name $Servico -Force }
    Set-Service -Name $Servico -StartupType Manual
  }
  if (TarefaExiste) {
    Stop-ScheduledTask -TaskName $Tarefa -ErrorAction SilentlyContinue
    Disable-ScheduledTask -TaskName $Tarefa | Out-Null
  }
  & powershell -NoProfile -ExecutionPolicy Bypass -File $Iniciar -Parar | Out-Null
  DesligarEnergia
}

# ---------- janela ----------
$corFundo = [System.Drawing.Color]::FromArgb(30, 27, 24)
$corCartao = [System.Drawing.Color]::FromArgb(40, 36, 32)
$corTexto = [System.Drawing.Color]::FromArgb(236, 231, 222)
$corApagado = [System.Drawing.Color]::FromArgb(150, 143, 132)
$corLigado = [System.Drawing.Color]::FromArgb(126, 186, 122)
$corDesligado = [System.Drawing.Color]::FromArgb(120, 113, 104)
$corEspera = [System.Drawing.Color]::FromArgb(214, 170, 92)
$fonteMono = New-Object System.Drawing.Font('Consolas', 10)
$fonteTitulo = New-Object System.Drawing.Font('Consolas', 13, [System.Drawing.FontStyle]::Bold)
$fonteBotao = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)
$fonteLinha = New-Object System.Drawing.Font('Segoe UI', 10)

$f = New-Object System.Windows.Forms.Form
$f.Text = 'HRZZ'
$f.ClientSize = New-Object System.Drawing.Size(360, 300)
$f.FormBorderStyle = 'FixedSingle'
$f.MaximizeBox = $false
$f.StartPosition = 'CenterScreen'
$f.BackColor = $corFundo
$f.ForeColor = $corTexto
if (Test-Path $Icone) { $f.Icon = New-Object System.Drawing.Icon($Icone) }

$titulo = New-Object System.Windows.Forms.Label
$titulo.Text = 'HRZZ STUDIO'
$titulo.Font = $fonteTitulo
$titulo.ForeColor = $corTexto
$titulo.Location = New-Object System.Drawing.Point(20, 18)
$titulo.AutoSize = $true
$f.Controls.Add($titulo)

$sub = New-Object System.Windows.Forms.Label
$sub.Text = $Endereco
$sub.Font = $fonteMono
$sub.ForeColor = $corApagado
$sub.Location = New-Object System.Drawing.Point(21, 44)
$sub.AutoSize = $true
$f.Controls.Add($sub)

# tres linhas de status: bolinha + nome + estado
$linhas = @{}
$nomes = @(
  @{ chave = 'hrzz'; nome = 'hrzz' },
  @{ chave = 'tunel'; nome = (U 't\u00fanel (acesso de fora)') },
  @{ chave = 'tampa'; nome = 'tampa fechada, na tomada' }
)
$y = 80
foreach ($n in $nomes) {
  $bola = New-Object System.Windows.Forms.Label
  $bola.Text = [string][char]0x25CF
  $bola.Font = $fonteLinha
  $bola.Location = New-Object System.Drawing.Point(20, $y)
  $bola.AutoSize = $true
  $f.Controls.Add($bola)
  $nome = New-Object System.Windows.Forms.Label
  $nome.Text = $n.nome
  $nome.Font = $fonteLinha
  $nome.ForeColor = $corTexto
  $nome.Location = New-Object System.Drawing.Point(40, $y)
  $nome.AutoSize = $true
  $f.Controls.Add($nome)
  $estado = New-Object System.Windows.Forms.Label
  $estado.Font = $fonteLinha
  $estado.ForeColor = $corApagado
  $estado.Location = New-Object System.Drawing.Point(210, $y)
  $estado.Size = New-Object System.Drawing.Size(140, 20)
  $f.Controls.Add($estado)
  $linhas[$n.chave] = @{ bola = $bola; estado = $estado }
  $y += 30
}

$botao = New-Object System.Windows.Forms.Button
$botao.Location = New-Object System.Drawing.Point(20, 186)
$botao.Size = New-Object System.Drawing.Size(320, 46)
$botao.FlatStyle = 'Flat'
$botao.FlatAppearance.BorderSize = 1
$botao.Font = $fonteBotao
$botao.Cursor = [System.Windows.Forms.Cursors]::Hand
$f.Controls.Add($botao)

$abrir = New-Object System.Windows.Forms.LinkLabel
$abrir.Text = 'abrir o hrzz'
$abrir.Font = $fonteLinha
$abrir.LinkColor = $corApagado
$abrir.ActiveLinkColor = $corTexto
$abrir.Location = New-Object System.Drawing.Point(20, 248)
$abrir.AutoSize = $true
$abrir.Add_LinkClicked({ Start-Process 'http://localhost:7000' })
$f.Controls.Add($abrir)

$aviso = New-Object System.Windows.Forms.Label
$aviso.Font = $fonteLinha
$aviso.ForeColor = $corApagado
$aviso.Location = New-Object System.Drawing.Point(20, 272)
$aviso.Size = New-Object System.Drawing.Size(330, 20)
$f.Controls.Add($aviso)

function Marcar($chave, $ligado, $textoSim, $textoNao) {
  $l = $linhas[$chave]
  if ($null -eq $ligado) { $l.bola.ForeColor = $corDesligado; $l.estado.Text = (U 'n\u00e3o instalado'); return }
  if ($ligado) { $l.bola.ForeColor = $corLigado; $l.estado.Text = $textoSim } else { $l.bola.ForeColor = $corDesligado; $l.estado.Text = $textoNao }
}

$script:ligado = $false
$script:energia = $false
function Atualizar {
  $h = HrzzResponde
  $t = if (TunelExiste) { TunelLigado } else { $null }
  Marcar 'hrzz' $h 'ligado' 'desligado'
  Marcar 'tunel' $t 'ligado' 'desligado'
  Marcar 'tampa' $script:energia 'continua ligado' 'suspende'
  # "desligar tudo" so aparece com as tres partes ligadas; faltando uma, o botao completa ("ligar tudo")
  $script:ligado = $h -and ($t -ne $false) -and $script:energia
  if ($script:ligado) {
    $botao.Text = 'desligar tudo'
    $botao.BackColor = $corCartao
    $botao.ForeColor = $corTexto
    $botao.FlatAppearance.BorderColor = $corApagado
  } else {
    $botao.Text = 'ligar tudo'
    $botao.BackColor = $corLigado
    $botao.ForeColor = $corFundo
    $botao.FlatAppearance.BorderColor = $corLigado
  }
}

$botao.Add_Click({
  $botao.Enabled = $false
  $f.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
  try {
    if ($script:ligado) {
      $botao.Text = 'desligando...'; $f.Refresh()
      DesligarTudo
      $aviso.Text = 'tudo desligado. o pc volta a dormir normalmente.'
    } else {
      $botao.Text = 'ligando...'; $f.Refresh()
      LigarTudo
      $aviso.Text = (U 'ligando. o hrzz leva uns segundos pra responder.')
    }
    $script:energia = EnergiaLigada
  } catch {
    $aviso.ForeColor = $corEspera
    $aviso.Text = 'erro: ' + $_.Exception.Message
  } finally {
    $f.Cursor = [System.Windows.Forms.Cursors]::Default
    $botao.Enabled = $true
    Atualizar
  }
})

# atualiza o status a cada 4 s (o hrzz demora um pouco pra subir depois de ligar)
$relogio = New-Object System.Windows.Forms.Timer
$relogio.Interval = 4000
$relogio.Add_Tick({ if ($botao.Enabled) { Atualizar } })

$f.Add_Shown({
  $script:energia = EnergiaLigada
  if (-not (TarefaExiste)) { $aviso.Text = (U 'tarefa do hrzz n\u00e3o existe: rode iniciar.ps1 -Instalar') }
  elseif (-not (TunelExiste)) { $aviso.Text = (U 't\u00fanel n\u00e3o instalado: rode tunel.ps1 -Token') }
  Atualizar
  $relogio.Start()
})
$f.Add_FormClosed({ $relogio.Stop() })

[void]$f.ShowDialog()
