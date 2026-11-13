// Modos de permissao (docs/02-ias.md): cada modo vira uma combinacao de --permission-mode,
// ferramentas liberadas e regras de bloqueio. Nada de perguntar no meio do processo: o claude sobe com
// --permission-prompts none, o que precisaria de confirmacao e negado, e o HRZZ pergunta pro Joao no chat.
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type { Modo, Negada } from './tipos.js';

const APAGAR_BASH = ['rm *', 'rmdir *', 'del *', 'unlink *', 'shred *', 'git clean*'];
const APAGAR_PS = ['Remove-Item*', 'rm *', 'del *', 'rmdir *', 'ri *', 'rd *', 'erase *'];
const PUSH = ['git push*'];

export type Politica = {
  permissionMode: 'acceptEdits' | 'manual';
  permitidas: string[];
  bloqueadas: string[];
};

function regras(prefixo: 'Bash' | 'PowerShell', padroes: string[]): string[] {
  return padroes.map((p) => `${prefixo}(${p})`);
}

export function politicaDoModo(modo: Modo, liberadas: string[] = [], web = true): Politica {
  const libera = (c: string) => liberadas.includes(`cat:${c}`);
  const bloqueadas: string[] = [];
  if (!libera('apagar')) bloqueadas.push(...regras('Bash', APAGAR_BASH), ...regras('PowerShell', APAGAR_PS));
  if (modo !== 'yolo' && !libera('push')) bloqueadas.push(...regras('Bash', PUSH), ...regras('PowerShell', PUSH));
  if (!web) bloqueadas.push('WebSearch', 'WebFetch');

  const permitidas = liberadas.filter((r) => !r.startsWith('cat:') && !r.startsWith('dir:'));
  if (modo === 'intern') {
    return { permissionMode: 'manual', permitidas, bloqueadas };
  }
  // yolo e mid: edita e roda comandos sem perguntar
  return { permissionMode: 'acceptEdits', permitidas: ['Bash', 'PowerShell', ...permitidas], bloqueadas };
}

export function argsPermissao(modo: Modo, liberadas: string[], web: boolean, restrito: boolean): string[] {
  const p = politicaDoModo(modo, liberadas, web);
  const args = ['--permission-prompts', 'none', '--permission-mode', p.permissionMode];
  if (restrito) args.push('--restricted');
  // restrito: nao libera Bash/PowerShell nem por aprovacao
  const permitidas = restrito ? p.permitidas.filter((r) => !/^(Bash|PowerShell)/.test(r)) : p.permitidas;
  if (permitidas.length) args.push('--allowedTools', ...permitidas);
  if (p.bloqueadas.length) args.push('--disallowedTools', ...p.bloqueadas);
  return args;
}

export function pastasLiberadas(liberadas: string[]): string[] {
  return liberadas.filter((r) => r.startsWith('dir:')).map((r) => r.slice(4));
}

const RE_APAGAR = /(^|[\s;&|(])(rm|rmdir|del|unlink|shred|Remove-Item|ri|rd|erase)(\s|$)|git\s+clean/i;
const RE_PUSH = /git\s+push/i;

function dentroDe(pasta: string, alvo: string): boolean {
  const rel = relative(resolve(pasta), resolve(alvo));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

// Transforma uma negativa do claude (result.permission_denials) numa pergunta pro Joao.
export function classificarNegada(ferramenta: string, entrada: Record<string, unknown>, cwd: string): Negada {
  const comando = typeof entrada.command === 'string' ? entrada.command : '';
  const arquivo = typeof entrada.file_path === 'string' ? entrada.file_path : typeof entrada.notebook_path === 'string' ? entrada.notebook_path : '';

  if (comando) {
    if (RE_PUSH.test(comando)) {
      return { ferramenta, entrada, categoria: 'push', resumo: `enviar pro GitHub: ${recorta(comando)}`, regra: 'cat:push' };
    }
    if (RE_APAGAR.test(comando)) {
      return { ferramenta, entrada, categoria: 'apagar', resumo: `apagar: ${recorta(comando)}`, regra: 'cat:apagar' };
    }
    const primeira = comando.trim().split(/\s+/)[0] ?? '';
    return {
      ferramenta,
      entrada,
      categoria: 'comando',
      resumo: `rodar: ${recorta(comando)}`,
      regra: primeira ? `${ferramenta}(${primeira} *)` : ferramenta,
    };
  }
  if (arquivo) {
    if (!dentroDe(cwd, arquivo)) {
      return { ferramenta, entrada, categoria: 'fora', resumo: `mexer fora da pasta do projeto: ${arquivo}`, regra: `dir:${dirname(arquivo)}` };
    }
    return { ferramenta, entrada, categoria: 'edicao', resumo: `${ferramenta === 'Write' ? 'escrever' : 'editar'} ${arquivo}`, regra: ferramenta };
  }
  return { ferramenta, entrada, categoria: 'outra', resumo: `usar ${ferramenta}`, regra: ferramenta };
}

function recorta(t: string, n = 140): string {
  const limpo = t.replace(/\s+/g, ' ').trim();
  return limpo.length > n ? limpo.slice(0, n - 1) + '…' : limpo;
}
