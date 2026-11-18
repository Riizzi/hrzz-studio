// Chamadas ao servidor. Todas levam o cookie do PIN (mesma origem). 401 = precisa entrar.
export class ErroApi extends Error {
  constructor(
    public status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

let aoPrecisarPin: (() => void) | null = null;
export function quandoPrecisarPin(f: () => void) {
  aoPrecisarPin = f;
}

export async function api<T = unknown>(url: string, opcoes: { metodo?: string; corpo?: unknown; bruto?: Blob } = {}): Promise<T> {
  const init: RequestInit = { method: opcoes.metodo ?? (opcoes.corpo !== undefined || opcoes.bruto ? 'POST' : 'GET'), cache: 'no-store' };
  if (opcoes.bruto) {
    init.body = opcoes.bruto;
    init.headers = { 'content-type': 'application/octet-stream' };
  } else if (opcoes.corpo !== undefined) {
    init.body = JSON.stringify(opcoes.corpo);
    init.headers = { 'content-type': 'application/json' };
  }
  const r = await fetch(url, init);
  if (r.status === 401 && !url.startsWith('/api/auth/')) aoPrecisarPin?.();
  const texto = await r.text();
  let dados: unknown = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    /* resposta nao-JSON */
  }
  if (!r.ok) {
    // o transcritor (FastAPI) devolve o motivo em "detail"
    const d = dados as { erro?: string; mensagem?: string; detail?: unknown } | null;
    throw new ErroApi(r.status, d?.erro ?? d?.mensagem ?? (typeof d?.detail === 'string' ? d.detail : `erro ${r.status}`));
  }
  return dados as T;
}

// ---------- tipos que vem do servidor ----------
export type Modo = 'yolo' | 'mid' | 'intern';
export type Nivel = 0 | 1 | 2;

export type Projeto = { id: number; nome: string; pasta: string };

// dueto: o Claude coordena e chama o Gemini; duelo: os dois respondem e voce escolhe
export type Parceria = '' | 'dueto' | 'duelo';

export type Conversa = {
  id: number;
  projetoId: number | null;
  titulo: string;
  motor: 'claude' | 'agy';
  modelo: string | null;
  modeloAuto: boolean;
  modo: Modo;
  pensar: Nivel;
  esforco: Nivel;
  web: boolean;
  liberadas: string[];
  parceria: Parceria;
  atualizada: string;
};

export type Negada = { ferramenta: string; categoria: string; resumo: string; regra: string };

export type Bloco =
  | { tipo: 'pensamento'; texto: string; segundos: number; vivo?: boolean }
  | { tipo: 'texto'; texto: string }
  | { tipo: 'ferramenta'; id: string; nome: string; resumo: string; erro?: boolean; rodando?: boolean }
  | { tipo: 'pergunta'; pergunta: string; opcoes: string[] }
  | { tipo: 'permissao'; negadas: Negada[]; respondida?: 'sim' | 'sempre' | 'nao' }
  | { tipo: 'erro'; texto: string }
  | { tipo: 'gemini'; id: string; tarefa: string; texto: string; erro?: boolean }
  | { tipo: 'limite'; texto: string; renovaEm?: number }
  | { tipo: 'duelo'; id: string; base: string; lados: LadoDuelo[]; escolhida: 0 | 1 | -1 | null; aviso?: string };

export type LadoDuelo = { motor: 'claude' | 'agy'; modelo: string | null; nome: string; blocos: Bloco[]; mudancas: string[]; falhou?: boolean };

export type Anexo = { nome: string; caminho: string; tipo: string };

export type Mensagem = {
  id: number;
  papel: 'eu' | 'ia';
  conteudo: { texto: string; anexos?: Anexo[]; sistema?: boolean } | Bloco[];
};

export type ItemProgresso = {
  id: number;
  conversaId: number | null;
  projetoId: number | null;
  texto: string;
  estado: 'afazer' | 'fazendo' | 'feito';
  origem: 'ia' | 'voce';
  detalhe: string | null;
  mudou: string;
};

export type ModelosApi = {
  claude: { id: string; nome: string; descricao: string }[];
  google: { id: string; nome: string; esforco?: boolean }[];
};

export type Uso = { cincoHoras?: number; seteDias?: number; renovaEm?: number; estado?: string; nivel?: 'sem-dado' | 'ok' | 'alto' | 'limite'; haikuAte?: number };

export type ResultadoBusca = { conversaId: number; titulo: string; trecho: string };

export function nomeDoModelo(id: string | null | undefined, modelos: ModelosApi | null): string {
  if (!id) return 'MVP';
  const achado = modelos?.claude.find((m) => m.id === id)?.nome ?? modelos?.google.find((m) => m.id === id)?.nome;
  if (achado) return achado;
  // conversa antiga com a variante gravada (gemini-4-argon-medium): mostra o nome do grupo
  const grupo = id.match(/^(.*)-(low|medium|high)$/i);
  const doGrupo = grupo ? modelos?.google.find((m) => m.id === `${grupo[1]}-*`)?.nome : undefined;
  return doGrupo ?? id;
}

// modelo do Google (agy): os ids comecam com "gemini"
export const ehGemini = (id: string | null | undefined): boolean => !!id && /^gemini/i.test(id);

// ---------- etapa 2: trabalho (preview, versoes, arquivos) ----------
export type DeteccaoPreview = { npm?: { script: string; comando: string }; estatico?: { arquivo: string } };

export type EstadoPreview = {
  rodando: boolean;
  porta?: number;
  tipo?: 'npm' | 'estatico' | 'manual';
  comando?: string;
  subindo?: boolean;
  erro?: string;
  log?: string;
  opcoes: DeteccaoPreview;
};

export type VersaoSalva = { n: number; commit: string; nome: string; data: string };

export type ResumoTrabalho = {
  alvo: { chave: string; nome: string; projetoId: number | null };
  preview: EstadoPreview;
  versoes: VersaoSalva[];
  podeDesfazer: boolean;
};

export type TipoArquivo = 'pasta' | 'imagem' | 'pdf' | 'documento' | 'planilha' | 'apresentacao' | 'site' | 'codigo' | 'texto' | 'outro';

export type EntradaArquivo = { nome: string; tipo: TipoArquivo; tamanho: number; mtime: number; caminho: string };

export type Previa =
  | { tipo: 'texto'; nome: string; conteudo: string; truncado: boolean }
  | { tipo: 'documento'; nome: string; html: string; avisos: number }
  | { tipo: 'planilha'; nome: string; abas: { nome: string; linhas: string[][]; truncada: boolean }[] }
  | { tipo: 'imagem' | 'pdf'; nome: string }
  | { tipo: 'site'; nome: string; conteudo: string; truncado: boolean }
  | { tipo: 'sem-previa'; nome: string; motivo: string };

export type ItemGaleria = { caminho: string; nome: string; tipo: TipoArquivo; tamanho: number; mtime: number; raiz: string; origem: string };

export type ResultadoEdicao =
  | { ok: true; arquivo: string; antesDe: string }
  | { ok: false; motivo: 'nao-achei' | 'ambiguo' | 'invalido'; arquivos?: string[]; ocorrencias?: number };

export const urlArquivo = (raiz: string, caminho: string, baixar = false) =>
  `/api/arquivos/baixar?raiz=${encodeURIComponent(raiz)}&caminho=${encodeURIComponent(caminho)}${baixar ? '&baixar=1' : ''}`;

// ---------- etapa 3: transcricao ----------
export type TarefaTranscricao = {
  id: string;
  tipo: 'arquivo' | 'youtube' | 'refazer';
  titulo: string;
  idioma: string | null;
  modelo: string;
  status: 'fila' | 'baixando' | 'transcrevendo' | 'pronta' | 'erro' | 'cancelada';
  pct: number;
  eta_s: number | null;
  erro: string | null;
  transcricao_id: string | null;
  criada: number;
  terminou: number | null;
};

export type Transcricao = {
  id: string;
  titulo: string;
  origem: 'arquivo' | 'youtube' | 'ao-vivo';
  idioma?: string;
  modelo?: string;
  duracao?: number;
  criada: string;
  palavras: number;
  audioGravado?: boolean;
};

export type EstadoTranscritor = {
  ligado: boolean;
  saude: { dispositivo: string; modelo: string; modeloVivo: string; carregados: string[]; audioDoPc: boolean; ffmpeg: boolean } | null;
};

export type FontesAudio = { disponivel: boolean; microfones: { indice: number; nome: string }[]; saidas: { indice: number; nome: string }[]; saidaPadrao?: string; motivo?: string };

// ---------- etapa 4: acervo ----------
export type ArquivoMemoria = { nome: string; tamanho: number; modificado: number };
export type ListaMemoria = { arquivos: ArquivoMemoria[]; total: number; limite: number };

export type SkillItem = {
  chave: string;
  nome: string;
  descricao: string;
  origem: 'sua' | 'anthropic';
  editavel: boolean;
  ligada: boolean;
};

export type ComandoItem = { nome: string; descricao: string; embutido: boolean };
export type ModeloProjetoItem = { id: string; nome: string; descricao: string };

// ---------- etapa 5: IA junta (fila, agendamentos, auditoria) ----------
export type TarefaFila = {
  id: number;
  titulo: string;
  pedido: string;
  projetoId: number | null;
  conversaId: number | null;
  modelo: string | null;
  modo: Modo;
  estado: 'fila' | 'rodando' | 'pronta' | 'erro' | 'cancelada';
  origem: 'voce' | 'agenda';
  agendamentoId: number | null;
  erro: string | null;
  criada: string;
  iniciou: string | null;
  terminou: string | null;
};

export type Agendamento = {
  id: number;
  titulo: string;
  pedido: string;
  projetoId: number | null;
  cron: string;
  modelo: string | null;
  modo: Modo;
  ligado: boolean;
  ultimo: string | null;
  proxima: number | null;
};

export type ListaFila = { tarefas: TarefaFila[]; agendamentos: Agendamento[] };

export type ItemAuditoria = { onde: string; detalhe: string; texto?: string };
export type VerificacaoAuditoria = { id: 'estouro' | 'alvos' | 'acessibilidade' | 'contraste'; titulo: string; ok: boolean; total: number; itens: ItemAuditoria[] };
export type ResultadoAuditoria = {
  quando: string;
  porta: number;
  caminho: string;
  larguras: number[];
  verificacoes: VerificacaoAuditoria[];
  problemas: number;
  pedido: string;
};

// ---------- etapa 6: conectores e painel do dia ----------
export type VisaoConector = {
  id: string;
  grupo: string;
  nome: string;
  descricao: string;
  tipo: 'token' | 'conta';
  ligado: boolean;
  acesso: 'perguntar' | 'livre';
  somenteLeitura: boolean | null;
  temToken: boolean;
  tokenFim: string;
  tokenOnde: string | null;
  status: string;
  detalhe: string;
  servidor: string | null;
  comoLigar: string[];
};

export type RespostaConectores = {
  conectores: VisaoConector[];
  deteccao: { quando: number; erro: string | null } | null;
  bloqueado: boolean;
};

export type PendenciaDia = {
  id: number;
  texto: string;
  estado: 'afazer' | 'fazendo';
  origem: 'ia' | 'voce';
  detalhe: string | null;
  conversaId: number | null;
  conversaTitulo: string | null;
  projetoId: number | null;
  projetoNome: string | null;
  mudou: string;
};

export type EstadoRepo = {
  projetoId: number;
  nome: string;
  existe: boolean;
  git: boolean;
  ramo?: string;
  alteracoes?: number;
  aFrente?: number;
  atras?: number;
  semRemoto?: boolean;
  ultimo?: { assunto: string; em: number };
};

export type ItemGithub = { tipo: 'meu-pr' | 'revisar' | 'issue'; titulo: string; repo: string; numero: number; url: string; atualizado: string };
export type ResumoGithub = { ligado: boolean; itens: ItemGithub[]; quando?: number; erro?: string };
export type EventoAgenda = { inicio: string; fim?: string; titulo: string; local?: string; diaTodo?: boolean };
export type ResumoAgenda = { disponivel: boolean; motivo?: string; eventos: EventoAgenda[]; quando?: number; erro?: string; atualizando: boolean };

export type ResumoDia = {
  quando: number;
  pendencias: PendenciaDia[];
  fila: { naFila: number; rodando: number; comErro: { id: number; titulo: string; erro: string | null }[]; proximos: { id: number; titulo: string; proxima: number }[] };
  uso: { cincoHoras?: number; seteDias?: number; renovaEm?: number; nivel: 'sem-dado' | 'ok' | 'alto' | 'limite'; haikuAte?: number };
  repositorios: EstadoRepo[];
  github: ResumoGithub;
  agenda: ResumoAgenda;
};
