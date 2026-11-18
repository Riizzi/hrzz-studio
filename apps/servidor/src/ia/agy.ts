// Motor agy (Antigravity CLI = Gemini do Google AI Plus). Opcoes conferidas em `agy --help`.
// Na construcao automatica o agy NAO e chamado (docs/automatico.md): o formato do fluxo dele ainda nao foi
// conferido com uma resposta real. O leitor e tolerante; o teste real fica em docs/pendencias-do-joao.md.
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acharPrograma, ambienteLimpo, rodarComFluxo } from './processo.js';
import { lerModelosAgy, resolverModeloAgy, type EntradaAgy } from './modelos.js';
import type { Evento, Modo, OpcoesTurno, TurnoEmAndamento } from './tipos.js';

// agy nao tem as listas de permitir/bloquear do claude: so tres modos de execucao.
const MODO_AGY: Record<Modo, string> = { yolo: 'auto', mid: 'accept-edits', intern: 'plan' };

// O -p do agy recebe o pedido como VALOR (`agy --help` na maquina do Joao, 18/11/2026: "-p took
// '--output-format' as its prompt"); por isso vai colado: -p=<pedido>. O agy e um .exe (sem shell), entao o
// texto vai inteiro como um argumento. A linha de comando do Windows aguenta ~32 mil caracteres: pedido maior
// vai num arquivo e o -p manda ler o arquivo.
export const LIMITE_PEDIDO_NA_LINHA = 24000;

export function argumentoPedido(pedido: string, pastaArquivo = join(tmpdir(), 'hrzz-agy')): string {
  if (pedido.length <= LIMITE_PEDIDO_NA_LINHA) return `-p=${pedido}`;
  mkdirSync(pastaArquivo, { recursive: true });
  const arquivo = join(pastaArquivo, `pedido-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.md`);
  writeFileSync(arquivo, pedido, 'utf8');
  return `-p=O pedido completo (instruções e mensagem) está no arquivo ${arquivo}. Leia esse arquivo inteiro e siga o que ele diz.`;
}

export function montarArgsAgy(o: OpcoesTurno, pedido = ''): string[] {
  const args = [argumentoPedido(pedido), '--output-format', 'stream-json'];
  if (o.modelo) args.push('--model', resolverModeloAgy(o.modelo, o.esforco));
  if (o.sessao) args.push('--conversation', o.sessao);
  args.push('--mode', MODO_AGY[o.modo]);
  // acesso do trabalho (Cloudflare): o Claude sobe com --restricted; o agy, com --sandbox ("terminal restrictions")
  if (o.restrito) args.push('--sandbox');
  for (const p of o.pastasExtras) args.push('--add-dir', p);
  return args;
}

export function rodarAgy(
  config: { agyBin: string; agyPastaExtra?: string },
  o: OpcoesTurno,
  aoEvento: (e: Evento) => void,
): TurnoEmAndamento {
  // o agy nao tem --append-system-prompt: as instrucoes vao junto da mensagem
  const entrada = `${o.promptSistema}\n\n---\n\n${o.mensagem}`;
  return rodarComFluxo({
    programa: acharPrograma(config.agyBin, config.agyPastaExtra),
    args: montarArgsAgy(o, entrada),
    cwd: o.cwd,
    env: ambienteLimpo(),
    entrada: '',
    nomeMotor: 'agy',
    mostrarPensamento: o.pensar !== 0,
    aoEvento,
  });
}

// lista guardada por 10 min (a tela e o MVP usam a mesma)
let cacheModelos: { em: number; lista: EntradaAgy[] } | null = null;
export async function modelosAgyGuardados(config: { agyBin: string; agyPastaExtra?: string }): Promise<EntradaAgy[]> {
  if (!cacheModelos || Date.now() - cacheModelos.em > 10 * 60 * 1000) cacheModelos = { em: Date.now(), lista: await listarModelosAgy(config) };
  return cacheModelos.lista;
}

// Lista de modelos vinda do proprio agy (`agy models`). Nao fixa nomes no codigo.
export function listarModelosAgy(config: { agyBin: string; agyPastaExtra?: string }): Promise<EntradaAgy[]> {
  return new Promise((resolve) => {
    const programa = acharPrograma(config.agyBin, config.agyPastaExtra);
    try {
      execFile(
        programa,
        ['models'],
        // .cmd/.bat no Windows precisam de shell; .exe nao
        { timeout: 20000, windowsHide: true, env: ambienteLimpo(), shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(programa) },
        (erro, saida) => resolve(erro ? [] : lerModelosAgy(String(saida))),
      );
    } catch {
      resolve([]); // programa que nao da pra rodar: a lista fica vazia e a tela explica
    }
  });
}
