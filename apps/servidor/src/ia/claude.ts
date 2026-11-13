// Motor Claude: roda o `claude` OFICIAL, sem modificacao, como processo filho (docs/02-ias.md).
// O login e feito pelo Joao no terminal. O HRZZ nunca le nem copia credenciais.
import { acharPrograma, ambienteLimpo, rodarComFluxo } from './processo.js';
import { argsPermissao, pastasLiberadas } from './permissoes.js';
import type { Evento, OpcoesTurno, TurnoEmAndamento } from './tipos.js';

const ESFORCO = ['low', 'high', 'max'] as const; // leve, medio, maximo (decidido em 08-decisoes.md)

export function montarArgsClaude(o: OpcoesTurno): string[] {
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
  if (o.modelo) args.push('--model', o.modelo);
  args.push('--effort', ESFORCO[o.esforco]);
  if (o.sessao) args.push('--resume', o.sessao);
  // a memoria muda entre mensagens: sem isso o claude reaproveitaria o prompt gravado na primeira vez
  args.push('--system-prompt-snapshot', 'off');
  args.push('--append-system-prompt', o.promptSistema);
  args.push(...argsPermissao(o.modo, o.liberadas, o.web, o.restrito));
  const pastas = [...o.pastasExtras, ...pastasLiberadas(o.liberadas)];
  if (pastas.length) args.push('--add-dir', ...pastas);
  return args;
}

export function rodarClaude(
  config: { claudeBin: string },
  o: OpcoesTurno,
  aoEvento: (e: Evento) => void,
): TurnoEmAndamento {
  const mensagem = o.pensar === 2 ? `ultrathink\n${o.mensagem}` : o.mensagem;
  return rodarComFluxo({
    programa: acharPrograma(config.claudeBin),
    args: montarArgsClaude(o),
    cwd: o.cwd,
    env: ambienteLimpo(),
    entrada: mensagem,
    nomeMotor: 'claude',
    mostrarPensamento: o.pensar !== 0,
    aoEvento,
  });
}
