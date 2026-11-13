// Le os blocos especiais que o HRZZ pede pra IA escrever no fim da resposta:
//   <progresso> ... </progresso>   lista de tarefas ([x] feito, [~] fazendo, [ ] a fazer)
//   <pergunta> ... </pergunta>     pergunta de multipla escolha (1a linha = pergunta, "- opcao" nas outras)
import type { ItemProgresso } from './tipos.js';

export type Extraido = {
  texto: string; // texto sem os blocos especiais
  progresso?: ItemProgresso[];
  pergunta?: { pergunta: string; opcoes: string[] };
};

const RE_PROGRESSO = /<progresso>([\s\S]*?)<\/progresso>/gi;
const RE_PERGUNTA = /<pergunta>([\s\S]*?)<\/pergunta>/gi;

export function lerProgresso(corpo: string): ItemProgresso[] {
  const itens: ItemProgresso[] = [];
  for (const linha of corpo.split(/\r?\n/)) {
    const m = linha.match(/^\s*(?:[-*]\s*)?\[(x|X|~|\s?)\]\s*(.+?)\s*$/);
    if (!m) continue;
    const marca = m[1].toLowerCase();
    itens.push({ texto: m[2], estado: marca === 'x' ? 'feito' : marca === '~' ? 'fazendo' : 'afazer' });
  }
  return itens;
}

export function lerPergunta(corpo: string): { pergunta: string; opcoes: string[] } | undefined {
  const linhas = corpo
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (linhas.length < 2) return undefined;
  const opcoes = linhas
    .slice(1)
    .map((l) => l.replace(/^(?:[-*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 6);
  if (opcoes.length === 0) return undefined;
  return { pergunta: linhas[0], opcoes };
}

export function extrairBlocos(texto: string): Extraido {
  let progresso: ItemProgresso[] | undefined;
  let pergunta: Extraido['pergunta'];
  let limpo = texto.replace(RE_PROGRESSO, (_t, corpo: string) => {
    progresso = lerProgresso(corpo);
    return '';
  });
  limpo = limpo.replace(RE_PERGUNTA, (_t, corpo: string) => {
    pergunta ??= lerPergunta(corpo);
    return '';
  });
  return { texto: limpo.replace(/\n{3,}/g, '\n\n').trim(), progresso, pergunta };
}

// Itens vindos da ferramenta de to-do do Claude Code (TodoWrite: {todos:[{content,status,activeForm}]})
export function lerTodos(entrada: unknown): ItemProgresso[] | undefined {
  const todos = (entrada as { todos?: unknown })?.todos;
  if (!Array.isArray(todos)) return undefined;
  const itens: ItemProgresso[] = [];
  for (const t of todos) {
    const o = t as { content?: string; subject?: string; status?: string };
    const texto = o.content ?? o.subject;
    if (!texto) continue;
    itens.push({ texto, estado: o.status === 'completed' ? 'feito' : o.status === 'in_progress' ? 'fazendo' : 'afazer' });
  }
  return itens;
}
