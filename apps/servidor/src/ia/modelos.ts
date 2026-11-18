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

// Um item da lista do Google. Modelo que o agy oferece em low/medium/high vira UM item, com id terminado
// em "-*": o botao de esforco escolhe a variante na hora de rodar (resolverModeloAgy). Variante fora dessas
// tres (ex.: xhigh) e modelo sem esforco no nome ficam como item proprio, com esforco fixo.
export type EntradaAgy = { id: string; nome: string; esforco?: boolean };

const ESFORCOS_AGY = ['low', 'medium', 'high'] as const;
const RE_VARIANTE = /^(.*)-(low|medium|high|xhigh|max)$/i;
const RE_NOME_VARIANTE = /\s*\((low|medium|high)\)\s*$/i;

// saida de `agy models`: uma linha por modelo, "id<TAB ou espacos>nome". Fica so o que e Gemini
// (os modelos do Claude vem pela assinatura da Anthropic, no motor claude).
export function lerModelosAgy(saida: string): EntradaAgy[] {
  const brutos: { id: string; nome: string }[] = [];
  for (const linha of saida.split(/\r?\n/)) {
    const m = linha.trim().match(/^(\S+)(?:\t+|\s{2,})(.+)$/);
    if (!m) continue;
    const id = m[1].trim();
    if (!/^gemini/i.test(id)) continue;
    brutos.push({ id, nome: m[2].trim() });
  }
  // quantas variantes low/medium/high cada base tem
  const variantes = new Map<string, number>();
  for (const b of brutos) {
    const v = b.id.match(RE_VARIANTE);
    if (v && (ESFORCOS_AGY as readonly string[]).includes(v[2].toLowerCase())) variantes.set(v[1], (variantes.get(v[1]) ?? 0) + 1);
  }
  const lista: EntradaAgy[] = [];
  const vistos = new Set<string>();
  for (const b of brutos) {
    const v = b.id.match(RE_VARIANTE);
    const base = v?.[1];
    const ehDasTres = !!v && (ESFORCOS_AGY as readonly string[]).includes(v[2].toLowerCase());
    if (base && ehDasTres && (variantes.get(base) ?? 0) >= 2) {
      const id = `${base}-*`;
      if (vistos.has(id)) continue;
      vistos.add(id);
      lista.push({ id, nome: b.nome.replace(RE_NOME_VARIANTE, ''), esforco: true });
    } else {
      // "Gemini 4 Hydrogen (XHigh)" -> "Gemini 4 Hydrogen XHigh"
      lista.push({ id: b.id, nome: b.nome.replace(/\s*\(([^)]+)\)\s*$/, ' $1') });
    }
  }
  return lista;
}

// id da lista -> id que o agy entende. "-*" vira a variante do esforco (0 leve, 1 medio, 2 alto).
export function resolverModeloAgy(id: string, esforco: 0 | 1 | 2): string {
  return id.endsWith('-*') ? `${id.slice(0, -2)}-${ESFORCOS_AGY[esforco] ?? 'medium'}` : id;
}

export const ehModeloGoogle = (id: string | null | undefined): boolean => !!id && /^gemini/i.test(id);

export type Tarefa = 'opus' | 'sonnet';

// trabalho de codigo, site e documento: fica com o Claude (Opus)
const PALAVRAS_OPUS =
  /\b(site|p[aá]gina|landing|app|aplicativo|c[oó]digo|programa|script|fun[cç][aã]o|bug|erro|refator|componente|css|html|react|astro|python|typescript|javascript|planilha|documento|relat[oó]rio|apresenta[cç][aã]o|slides?|pdf|docx|xlsx|pptx|projeto|implement|crie|criar|construa|monte)\w*/i;
const PALAVRAS_CODIGO =
  /\b(site|p[aá]gina|landing|app|aplicativo|c[oó]digo|programa|script|fun[cç][aã]o|bug|refator|componente|css|html|react|astro|python|typescript|javascript|planilha|documento|relat[oó]rio|apresenta[cç][aã]o|slides?|pdf|docx|xlsx|pptx)\w*/i;
// imagem, arte e visual
const PALAVRAS_ARTE = /\b(imagens?|logo\w*|logotipo|[ií]cones?|sprites?|arte|ilustra\w*|desenh\w*|fotos?|banners?|wallpaper|papel de parede|pixel ?art|varia[cç](?:[aã]o|[oõ]es) visu\w*|mascote)\b/i;
// pesquisa e resumo
const PALAVRAS_PESQUISA = /\b(pesquis\w*|resum\w*|busque|procure na (?:web|internet)|fontes|not[ií]cias?|compar[ea] (?:as )?fontes)\b/i;

export type EscolhaMvp = { motor: 'claude' | 'agy'; modelo: string };

// MVP (docs/02-ias.md e 08-decisoes.md 18/11/2026): o HRZZ escolhe o modelo da conversa na primeira mensagem.
// Claude: Opus pro pesado (codigo, site, documento, anexo, texto longo), Sonnet pro resto.
// Gemini (se o agy estiver instalado e nao for dueto): cota do Claude acima de 80%, imagem/arte, pesquisa e
// resumo, e pergunta rapida. Hydrogen pro pesado, Flash pro leve. Sem Gemini, a cota alta cai no Haiku.
export function escolherMvp(opcoes: {
  texto: string;
  anexos: number;
  temProjeto: boolean;
  cotaPct?: number;
  google?: EntradaAgy[];
  dueto?: boolean;
}): EscolhaMvp {
  const t = opcoes.texto.trim();
  const google = opcoes.dueto ? [] : (opcoes.google ?? []);
  const achar = (re: RegExp) => google.find((m) => m.esforco && re.test(m.id)) ?? google.find((m) => re.test(m.id));
  const pesadoGoogle = achar(/hydrogen/i) ?? achar(/argon/i) ?? google.find((m) => m.esforco) ?? google[0];
  const leveGoogle = achar(/flash/i) ?? pesadoGoogle;
  const gm = (m: EntradaAgy | undefined): EscolhaMvp | null => (m ? { motor: 'agy', modelo: m.id } : null);
  const cl = (modelo: 'opus' | 'sonnet' | 'haiku'): EscolhaMvp => ({ motor: 'claude', modelo });

  const pesado =
    opcoes.anexos > 0 || t.length > 600 || PALAVRAS_OPUS.test(t) || (opcoes.temProjeto && t.length > 120) || /\n.*\n.*\n/.test(t);

  if (opcoes.cotaPct !== undefined && opcoes.cotaPct >= 80) return gm(pesado ? pesadoGoogle : leveGoogle) ?? cl('haiku');
  // codigo, site e documento ficam com o Claude, mesmo que falem de imagem ("site com fotos")
  if (opcoes.anexos > 0 || PALAVRAS_CODIGO.test(t)) return cl('opus');
  if (PALAVRAS_ARTE.test(t)) return gm(pesadoGoogle) ?? cl(pesado ? 'opus' : 'sonnet');
  if (PALAVRAS_PESQUISA.test(t)) return gm(pesadoGoogle) ?? cl(pesado ? 'opus' : 'sonnet');
  if (pesado) return cl('opus');
  // pergunta rapida: curta e numa linha so
  if (t.length <= 200 && !t.includes('\n')) return gm(leveGoogle) ?? cl('sonnet');
  return cl('sonnet');
}

// escolha so entre os modelos do Claude (antes do MVP); fica pros testes antigos e pro que ainda chama
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
