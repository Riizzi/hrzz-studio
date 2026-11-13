// Tabela de modelos. Os nomes exibidos saem daqui pra trocar quando sair modelo novo.
// Os modelos do Google (agy) NAO ficam aqui: vem do proprio `agy models`.

export type ModeloClaude = { id: 'opus' | 'sonnet' | 'haiku'; nome: string; descricao: string };

export const MODELOS_CLAUDE: ModeloClaude[] = [
  { id: 'opus', nome: 'Opus 5.5', descricao: 'mais capaz' },
  { id: 'sonnet', nome: 'Sonnet 5.5', descricao: 'equilibrado' },
  { id: 'haiku', nome: 'Haiku 5.5', descricao: 'rápido' },
];

export function nomeModeloClaude(id: string | null | undefined): string {
  return MODELOS_CLAUDE.find((m) => m.id === id)?.nome ?? id ?? '';
}

export type EntradaAgy = { id: string; nome: string };

// saida de `agy models`: uma linha por modelo, "id<TAB>nome". Fica so o que e Gemini
// (os modelos do Claude vem pela assinatura da Anthropic, no motor claude).
export function lerModelosAgy(saida: string): EntradaAgy[] {
  const lista: EntradaAgy[] = [];
  for (const linha of saida.split(/\r?\n/)) {
    const [id, ...resto] = linha.split('\t');
    if (!id || resto.length === 0) continue;
    if (!/^gemini/i.test(id.trim())) continue;
    lista.push({ id: id.trim(), nome: resto.join(' ').trim() });
  }
  return lista;
}

export type Tarefa = 'opus' | 'sonnet';

const PALAVRAS_OPUS =
  /\b(site|p[aá]gina|landing|app|aplicativo|c[oó]digo|programa|script|fun[cç][aã]o|bug|erro|refator|componente|css|html|react|astro|python|typescript|javascript|planilha|documento|relat[oó]rio|apresenta[cç][aã]o|slides?|pdf|docx|xlsx|pptx|projeto|implement|crie|criar|construa|monte)\w*/i;

// Escolha automatica de modelo em conversa nova (docs/02-ias.md): regras simples, na duvida usa o Opus.
export function escolherModeloAuto(opcoes: { texto: string; anexos: number; temProjeto: boolean; cotaPct?: number }): 'opus' | 'sonnet' | 'haiku' {
  if (opcoes.cotaPct !== undefined && opcoes.cotaPct >= 80) return 'haiku';
  const t = opcoes.texto.trim();
  if (opcoes.anexos > 0) return 'opus';
  if (t.length > 600) return 'opus';
  if (PALAVRAS_OPUS.test(t)) return 'opus';
  if (opcoes.temProjeto && t.length > 120) return 'opus';
  // pergunta ou conversa curta
  if (t.length <= 400 && !/\n.*\n.*\n/.test(t)) return 'sonnet';
  return 'opus';
}
