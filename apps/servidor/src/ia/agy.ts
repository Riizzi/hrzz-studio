// Motor agy (Antigravity CLI = Gemini do Google AI Plus). Opcoes conferidas em `agy --help`.
// Na construcao automatica o agy NAO e chamado (docs/automatico.md): o formato do fluxo dele ainda nao foi
// conferido com uma resposta real. O leitor e tolerante; o teste real fica em docs/pendencias-do-joao.md.
import { execFile } from 'node:child_process';
import { acharPrograma, ambienteLimpo, rodarComFluxo } from './processo.js';
import { lerModelosAgy, type EntradaAgy } from './modelos.js';
import type { Evento, Modo, OpcoesTurno, TurnoEmAndamento } from './tipos.js';

// agy nao tem as listas de permitir/bloquear do claude: so tres modos de execucao.
const MODO_AGY: Record<Modo, string> = { yolo: 'auto', mid: 'accept-edits', intern: 'plan' };

export function montarArgsAgy(o: OpcoesTurno): string[] {
  const args = ['-p', '--output-format', 'stream-json'];
  if (o.modelo) args.push('--model', o.modelo);
  if (o.sessao) args.push('--conversation', o.sessao);
  args.push('--mode', MODO_AGY[o.modo]);
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
    args: montarArgsAgy(o),
    cwd: o.cwd,
    env: ambienteLimpo(),
    entrada,
    nomeMotor: 'agy',
    mostrarPensamento: o.pensar !== 0,
    aoEvento,
  });
}

// Lista de modelos vinda do proprio agy (`agy models`). Nao fixa nomes no codigo.
export function listarModelosAgy(config: { agyBin: string; agyPastaExtra?: string }): Promise<EntradaAgy[]> {
  return new Promise((resolve) => {
    execFile(
      acharPrograma(config.agyBin, config.agyPastaExtra),
      ['models'],
      { timeout: 20000, windowsHide: true, env: ambienteLimpo() },
      (erro, saida) => resolve(erro ? [] : lerModelosAgy(String(saida))),
    );
  });
}
