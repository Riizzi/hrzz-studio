// Sobe um HRZZ isolado so pros testes: pasta de dados temporaria, porta 7090 e um "claude" de mentira
// (scripts/claude-falso.mjs), pra nao mexer nos dados do Joao nem gastar a assinatura.
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const PIN = '2468';

function garantirBuild() {
  const pronto = existsSync(join(raiz, 'apps', 'servidor', 'dist', 'index.js')) && existsSync(join(raiz, 'apps', 'web', 'dist', 'index.html'));
  if (pronto && !process.env.HRZZ_REFAZER_BUILD) return;
  console.log('compilando (npm run build)...');
  const r = spawnSync('npm', ['run', 'build'], { cwd: raiz, stdio: 'inherit', shell: true });
  if (r.status !== 0) throw new Error('o build falhou');
}

// Pasta .claude de mentira (so as skills), pra a tela de skills nao depender do que existe na maquina.
function criarHomeDeTeste(pasta) {
  const home = join(pasta, 'claude-home');
  const sync = join(home, 'skills', 'synced', 'abc_def');
  const skill = (nome, descricao) => {
    mkdirSync(join(sync, nome), { recursive: true });
    writeFileSync(join(sync, nome, 'SKILL.md'), `---
name: ${nome}
description: ${descricao}
---

faca ${nome}
`);
  };
  skill('docx', 'Criar e editar documentos Word');
  skill('xlsx', 'Criar e editar planilhas');
  skill('estilo-joao-pedro', 'Estilo de texto do Joao Pedro');
  writeFileSync(join(sync, 'manifest.json'), JSON.stringify({ skills: [{ name: 'docx', source: 'anthropic' }, { name: 'xlsx', source: 'anthropic' }, { name: 'estilo-joao-pedro', source: 'plugin' }] }));
  return home;
}

function criarFalso(pasta, arquivo = 'claude-falso.mjs') {
  const script = join(raiz, 'scripts', arquivo);
  const nome = arquivo.replace(/.mjs$/, '');
  if (process.platform === 'win32') {
    const cmd = join(pasta, nome + '.cmd');
    writeFileSync(cmd, `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`);
    return cmd;
  }
  const sh = join(pasta, nome + '.sh');
  writeFileSync(sh, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
  chmodSync(sh, 0o755);
  return sh;
}

// Sobe o servico de transcricao (Python) isolado: porta de teste, modelos tiny, pasta de dados propria e token.
// Devolve null se o ambiente Python nao existe (uv sync nao rodou).
export async function subirTranscritorDeTeste({ porta = 7194, dados }) {
  const python = process.platform === 'win32' ? join(raiz, 'servicos', 'transcritor', '.venv', 'Scripts', 'python.exe') : join(raiz, 'servicos', 'transcritor', '.venv', 'bin', 'python');
  if (!existsSync(python)) return null;
  const token = 'token-de-teste-' + Math.random().toString(16).slice(2);
  mkdirSync(join(dados, 'transcricoes'), { recursive: true });
  const filho = spawn(python, ['server.py'], {
    cwd: join(raiz, 'servicos', 'transcritor'),
    env: {
      ...process.env,
      PYTHONUTF8: '1',
      TRANSCRITOR_PORTA: String(porta),
      TRANSCRITOR_MODELO: 'tiny',
      TRANSCRITOR_MODELO_VIVO: 'tiny',
      TRANSCRITOR_DADOS: join(dados, 'transcricoes'),
      TRANSCRITOR_TMP: join(dados, 'transcricoes-tmp'),
      TRANSCRITOR_TOKEN: token,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let saida = '';
  filho.stdout.on('data', (d) => (saida += d));
  filho.stderr.on('data', (d) => (saida += d));
  const url = `http://127.0.0.1:${porta}`;
  const inicio = Date.now();
  for (;;) {
    try {
      if ((await fetch(`${url}/saude`)).ok) break;
    } catch {
      /* ainda subindo */
    }
    if (Date.now() - inicio > 30000) {
      filho.kill();
      throw new Error('o transcritor de teste nao subiu: ' + saida);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { url, token, porta, saida: () => saida, parar: () => filho.kill() };
}

export async function subirServidorDeTeste({ porta = 7090, claudeReal = false, transcritor = false, portaTranscritor = 7194, agyFalso = false } = {}) {
  garantirBuild();
  const pasta = mkdtempSync(join(tmpdir(), 'hrzz-ui-'));
  const tr = transcritor ? await subirTranscritorDeTeste({ porta: portaTranscritor, dados: pasta }) : null;
  const filho = spawn(process.execPath, [join(raiz, 'apps', 'servidor', 'dist', 'index.js')], {
    cwd: raiz,
    env: { ...process.env, HRZZ_PORTA: String(porta), HRZZ_DADOS: pasta, ...(claudeReal ? {} : { HRZZ_CLAUDE_HOME: criarHomeDeTeste(pasta), HRZZ_FALSO_LOG: join(pasta, 'claude-chamadas.jsonl'), HRZZ_REGISTRAR_CHAMADAS: join(pasta, 'claude-args.jsonl') }), ...(tr ? { TRANSCRITOR_URL: tr.url, TRANSCRITOR_TOKEN: tr.token } : { TRANSCRITOR_URL: 'http://127.0.0.1:1' }), HRZZ_SHELL: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh', ...(claudeReal ? {} : { HRZZ_CLAUDE: criarFalso(pasta), HRZZ_AGY: agyFalso ? criarFalso(pasta, 'agy-falso.mjs') : join(pasta, 'agy-que-nao-existe'), HRZZ_AGY_LOG: join(pasta, 'agy-chamadas.jsonl'), HRZZ_AGY_PASTA: join(pasta, 'sem-agy') }), ...(claudeReal && agyFalso ? { HRZZ_AGY: criarFalso(pasta, 'agy-falso.mjs'), HRZZ_AGY_LOG: join(pasta, 'agy-chamadas.jsonl'), HRZZ_AGY_PASTA: join(pasta, 'sem-agy') } : {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let saida = '';
  filho.stdout.on('data', (d) => (saida += d));
  filho.stderr.on('data', (d) => (saida += d));
  const url = `http://127.0.0.1:${porta}`;
  const inicio = Date.now();
  for (;;) {
    try {
      const r = await fetch(`${url}/api/saude`);
      if (r.ok) break;
    } catch {
      /* ainda subindo */
    }
    if (Date.now() - inicio > 15000) {
      filho.kill();
      throw new Error('o servidor de teste nao subiu: ' + saida);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  const def = await fetch(`${url}/api/auth/pin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: PIN }) });
  const cookie = String(def.headers.get('set-cookie')).split(';')[0];
  const [nome, valor] = [cookie.slice(0, cookie.indexOf('=')), cookie.slice(cookie.indexOf('=') + 1)];

  return {
    url,
    pin: PIN,
    pasta,
    // chamadas que o claude de mentira recebeu (argumentos e prompt), uma por linha
    // (os argumentos vem do registro do servidor; o prompt e a pasta, do claude de mentira; as duas listas andam juntas)
    chamadas: () => {
      const ler = (nomeArq) => (existsSync(join(pasta, nomeArq)) ? readFileSync(join(pasta, nomeArq), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : []);
      const falso = ler('claude-chamadas.jsonl');
      return ler('claude-args.jsonl').filter((c) => c.motor !== 'agy').map((c, i) => ({ ...c, ...(falso[i] ?? {}) }));
    },
    // chamadas que o agy de mentira recebeu (argumentos, prompt e pasta), uma por linha
    chamadasAgy: () => (existsSync(join(pasta, 'agy-chamadas.jsonl')) ? readFileSync(join(pasta, 'agy-chamadas.jsonl'), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l)) : []),
    cookie: { name: nome, value: valor, url },
    cabecalhoCookie: cookie,
    transcritor: tr,
    saida: () => saida,
    async parar() {
      tr?.parar();
      filho.kill();
      await new Promise((r) => setTimeout(r, 300));
      try {
        rmSync(pasta, { recursive: true, force: true });
      } catch {
        /* o Windows pode segurar o arquivo do banco por um instante */
      }
    },
  };
}

// manda uma mensagem pelo WebSocket e espera a resposta terminar (usa o pacote ws, que ja vem com o servidor)
export async function conversarPeloWs({ url, cabecalhoCookie }, mensagem, { limiteMs = 20000 } = {}) {
  const { default: WebSocket } = await import('ws');
  const ws = new WebSocket(url.replace('http', 'ws') + '/api/ws', { headers: { cookie: cabecalhoCookie } });
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  let conversa = mensagem.conversa ?? null;
  const fim = new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('a conversa de teste nao terminou')), limiteMs);
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.tipo === 'conversa') conversa = m.conversa.id;
      if (m.tipo === 'fim') {
        clearTimeout(t);
        res({ ...m, conversa });
      }
    });
  });
  ws.send(JSON.stringify({ tipo: 'enviar', modo: 'mid', modelo: 'auto', ...mensagem }));
  const r = await fim;
  ws.close();
  return r;
}

// Entra num HRZZ que ja esta rodando (ex.: o dev em 7001) usando o PIN de HRZZ_PIN.
export async function cookieDeLogin(url, pin) {
  const r = await fetch(`${url}/api/auth/entrar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) });
  if (!r.ok) throw new Error(`nao consegui entrar com o PIN (HRZZ_PIN): ${r.status}`);
  const c = String(r.headers.get('set-cookie')).split(';')[0];
  return { name: c.slice(0, c.indexOf('=')), value: c.slice(c.indexOf('=') + 1), url };
}

// Prepara o alvo dos testes: por padrao sobe o servidor isolado; com uma url, usa o app que ja esta rodando.
export async function prepararAlvo(urlInformada, opcoes = {}) {
  if (urlInformada) {
    const cookie = process.env.HRZZ_PIN ? await cookieDeLogin(urlInformada, process.env.HRZZ_PIN) : null;
    return { url: urlInformada, cookie, servidor: null };
  }
  const servidor = await subirServidorDeTeste(opcoes);
  await conversarPeloWs(servidor, { texto: 'crie um site de loja e confira o menu do celular' });
  await criarProjetoDeExemplo(servidor);
  return { url: servidor.url, cookie: servidor.cookie, servidor };
}

// Projeto de exemplo (pasta com site, imagem e planilha) e uma conversa dentro dele, pros testes da etapa 2.
export async function criarProjetoDeExemplo(servidor, nome = 'site de exemplo') {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const pasta = join(servidor.pasta, 'projeto-exemplo');
  mkdirSync(pasta, { recursive: true });
  writeFileSync(join(pasta, 'dados.csv'), ['item,valor', 'lente,120', 'armacao,240', ''].join('\n'));
  // PNG 1x1 valido
  writeFileSync(join(pasta, 'fachada.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64'));
  const r = await fetch(`${servidor.url}/api/projetos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: servidor.cabecalhoCookie },
    body: JSON.stringify({ nome, pasta }),
  });
  const projeto = await r.json();
  const fim = await conversarPeloWs(servidor, { texto: 'criar-site para a oficina', projeto: projeto.id });
  return { projeto, pasta, conversa: fim.conversa };
}

// Audio de fala em portugues pros testes de transcricao (voz Maria do Windows). Devolve o caminho do wav ou null.
export function falaDeTeste() {
  const arq = join(tmpdir(), 'hrzz-fala-pt.wav');
  if (existsSync(arq)) return arq;
  if (process.platform !== 'win32') return null;
  const roteiro = join(tmpdir(), 'hrzz-fala-pt.ps1');
  writeFileSync(
    roteiro,
    [
      'Add-Type -AssemblyName System.Speech',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      "try { $s.SelectVoice('Microsoft Maria Desktop') } catch { }",
      `$s.SetOutputToWaveFile('${arq}')`,
      "$s.Speak('Bom dia a todos. Hoje vamos tratar do orcamento do proximo trimestre e da reuniao com a equipe de compras. A primeira decisao e adiar a licitacao ate que o relatorio tecnico seja concluido. A segunda decisao e contratar mais dois analistas para o setor de contratos. Fica combinado que Joao envia a ata ainda hoje.')",
      '$s.Dispose()',
    ].join('\r\n'),
  );
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', roteiro], { encoding: 'utf8' });
  return r.status === 0 && existsSync(arq) ? arq : null;
}
