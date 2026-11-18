// Servidor MCP local do dueto (docs/02-ias.md): entrega pro Claude a ferramenta `pedir_ao_gemini`.
// O Claude Code sobe este arquivo como processo filho (conversa JSON-RPC pela entrada e saida padrao, uma
// mensagem por linha) e, por baixo, ele roda o `agy` com a tarefa e devolve a resposta.
// Sem dependencias: so o Node. Quem configura e o HRZZ, por variaveis de ambiente:
//   HRZZ_MCP_AGY      caminho do agy
//   HRZZ_MCP_PASTA    pasta do projeto (o Gemini nunca sai dela)
//   HRZZ_MCP_SUBPASTA subpasta onde o Gemini trabalha (padrao arte)
//   HRZZ_MCP_MODO     auto | accept-edits | plan (o --mode do agy)
//   HRZZ_MCP_MODELO   modelo do agy (opcional)
//   HRZZ_MCP_LIMITE_S tempo maximo de cada pedido, em segundos (padrao 900)
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const env = process.env;
const AGY = env.HRZZ_MCP_AGY || 'agy';
const PASTA = resolve(env.HRZZ_MCP_PASTA || process.cwd());
const MODO = ['auto', 'accept-edits', 'plan'].includes(env.HRZZ_MCP_MODO) ? env.HRZZ_MCP_MODO : 'accept-edits';
const MODELO = env.HRZZ_MCP_MODELO || '';
const LIMITE_MS = Math.max(10, Number(env.HRZZ_MCP_LIMITE_S) || 900) * 1000;

export const FERRAMENTA = {
  name: 'pedir_ao_gemini',
  description:
    'Entrega uma parte do trabalho ao Gemini (outro modelo, via agy) e devolve o que ele respondeu. Use pra partes que ganham com um segundo modelo, como variações de arte ou imagens. O Gemini trabalha numa subpasta do projeto e você revisa o resultado.',
  inputSchema: {
    type: 'object',
    properties: {
      tarefa: { type: 'string', description: 'o que o Gemini deve fazer, com todo o contexto que ele precisa (ele não vê a conversa)' },
      arquivos: { type: 'array', items: { type: 'string' }, description: 'arquivos do projeto que ele deve ler antes (caminhos relativos à pasta do projeto)' },
    },
    required: ['tarefa'],
  },
};

// a subpasta do Gemini: sempre dentro do projeto
export function subpastaSegura(pasta, nome) {
  const limpo = String(nome || 'arte').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!limpo || limpo.split('/').some((p) => p === '..' || p === '.')) return 'arte';
  const abs = resolve(pasta, limpo);
  const rel = relative(pasta, abs);
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? limpo : 'arte';
}

// separa os arquivos que valem (dentro do projeto e existentes) dos que nao
export function conferirArquivos(pasta, arquivos) {
  const bons = [];
  const ruins = [];
  for (const a of Array.isArray(arquivos) ? arquivos : []) {
    if (typeof a !== 'string' || !a.trim()) continue;
    const abs = resolve(pasta, a.trim());
    const rel = relative(pasta, abs);
    if (rel.startsWith('..') || isAbsolute(rel)) ruins.push(`${a} (fora da pasta do projeto)`);
    else if (!existsSync(abs)) ruins.push(`${a} (não existe)`);
    else bons.push(abs);
  }
  return { bons, ruins };
}

export function montarPedido({ tarefa, arquivos, subpasta }) {
  const partes = [
    `Você é o Gemini, ajudando o Claude num trabalho em dupla no HRZZ STUDIO. Trabalhe só dentro da pasta atual (${subpasta}/ do projeto) e não mexa no resto do projeto.`,
    `Tarefa:\n${tarefa}`,
  ];
  if (arquivos.length) partes.push(`Leia antes (caminhos completos):\n${arquivos.map((a) => `- ${a}`).join('\n')}`);
  partes.push('Ao terminar, responda com um resumo curto do que fez e liste os arquivos que criou ou alterou (caminhos relativos à pasta atual).');
  return partes.join('\n\n');
}

function ambiente() {
  const e = { ...env };
  delete e.ANTHROPIC_API_KEY; // nunca cobrar pela API por engano (regra do HRZZ)
  return e;
}

function rodarAgy({ pedido, cwd, adicionar }) {
  return new Promise((ok) => {
    // o -p do agy recebe o pedido como valor (`agy --help`, 18/11/2026); o pedido do dueto e curto
    const args = [`-p=${pedido}`, '--output-format', 'text', '--mode', MODO];
    // modelo agrupado da lista ("gemini-4-argon-*"): no dueto usa a variante media
    if (MODELO) args.push('--model', MODELO.endsWith('-*') ? `${MODELO.slice(0, -2)}-medium` : MODELO);
    for (const d of adicionar) args.push('--add-dir', d);
    const filho = spawn(AGY, args, {
      cwd,
      env: ambiente(),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(AGY),
    });
    let saida = '';
    let erro = '';
    let acabou = false;
    const fim = (r) => {
      if (acabou) return;
      acabou = true;
      clearTimeout(relogio);
      ok(r);
    };
    const relogio = setTimeout(() => {
      try {
        filho.kill();
      } catch {
        /* ja saiu */
      }
      fim({ erro: true, texto: `o Gemini não respondeu em ${Math.round(LIMITE_MS / 1000)} s e foi interrompido.${saida.trim() ? '\nAté ali ele disse:\n' + saida.trim() : ''}` });
    }, LIMITE_MS);
    filho.stdout.setEncoding('utf8');
    filho.stdout.on('data', (d) => (saida += d));
    filho.stderr.setEncoding('utf8');
    filho.stderr.on('data', (d) => (erro = (erro + d).slice(-2000)));
    filho.stdin.on('error', () => {});
    filho.stdin.end('');
    filho.on('error', (e) =>
      fim({ erro: true, texto: e.code === 'ENOENT' ? 'não achei o agy no PC (o Gemini não está instalado ou não está no PATH).' : `não consegui rodar o agy: ${e.message}` }),
    );
    filho.on('close', (codigo) => {
      if (codigo !== 0 && !saida.trim()) return fim({ erro: true, texto: `o agy parou antes de responder: ${erro.trim().split(/\r?\n/).slice(-3).join(' ') || 'código ' + codigo}` });
      fim({ erro: false, texto: saida.trim() || '(o Gemini terminou sem escrever nada)' });
    });
  });
}

export async function pedirAoGemini(args) {
  const tarefa = typeof args?.tarefa === 'string' ? args.tarefa.trim() : '';
  if (!tarefa) return { erro: true, texto: 'faltou a tarefa.' };
  const subpasta = subpastaSegura(PASTA, env.HRZZ_MCP_SUBPASTA);
  const cwd = resolve(PASTA, subpasta);
  mkdirSync(cwd, { recursive: true });
  const { bons, ruins } = conferirArquivos(PASTA, args.arquivos);
  const r = await rodarAgy({ pedido: montarPedido({ tarefa, arquivos: bons, subpasta }), cwd, adicionar: bons.length ? [PASTA] : [] });
  const notas = [];
  if (ruins.length) notas.push(`Arquivos que não usei: ${ruins.join('; ')}.`);
  if (!r.erro) notas.push(`Pasta do Gemini: ${subpasta}/`);
  return { erro: r.erro, texto: [r.texto, ...notas].join('\n\n') };
}

// ---------- JSON-RPC pela entrada padrao ----------
const enviar = (o) => process.stdout.write(JSON.stringify(o) + '\n');

export async function tratar(m) {
  if (!m || typeof m !== 'object') return;
  const { id, method, params } = m;
  const responde = (result) => id !== undefined && enviar({ jsonrpc: '2.0', id, result });
  const falha = (code, message) => id !== undefined && enviar({ jsonrpc: '2.0', id, error: { code, message } });
  if (method === 'initialize') {
    return responde({ protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'hrzz-gemini', version: '1.0.0' } });
  }
  if (method === 'ping') return responde({});
  if (method === 'tools/list') return responde({ tools: [FERRAMENTA] });
  if (method === 'tools/call') {
    if (params?.name !== FERRAMENTA.name) return falha(-32602, `ferramenta desconhecida: ${params?.name}`);
    try {
      const r = await pedirAoGemini(params.arguments);
      return responde({ content: [{ type: 'text', text: r.texto }], isError: r.erro });
    } catch (e) {
      return responde({ content: [{ type: 'text', text: `erro no dueto: ${e.message}` }], isError: true });
    }
  }
  if (id !== undefined) falha(-32601, `método desconhecido: ${method}`);
}

// so liga a leitura quando rodado como programa (os testes importam as funcoes acima)
const principal = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (principal || env.HRZZ_MCP_SERVIR === '1') {
  if (!existsSync(PASTA) || !statSync(PASTA).isDirectory()) {
    process.stderr.write(`pasta do projeto não existe: ${PASTA}${sep}\n`);
    process.exit(1);
  }
  const leitor = createInterface({ input: process.stdin });
  const pendentes = new Set();
  leitor.on('line', (linha) => {
    if (!linha.trim()) return;
    let m;
    try {
      m = JSON.parse(linha);
    } catch {
      return;
    }
    const p = tratar(m).finally(() => pendentes.delete(p));
    pendentes.add(p);
  });
  // o Claude fecha a entrada ao terminar: espera os pedidos em andamento
  leitor.on('close', () => void Promise.allSettled([...pendentes]).then(() => process.exit(0)));
}
