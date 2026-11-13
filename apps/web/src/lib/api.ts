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
    const d = dados as { erro?: string; mensagem?: string } | null;
    throw new ErroApi(r.status, d?.erro ?? d?.mensagem ?? `erro ${r.status}`);
  }
  return dados as T;
}

// ---------- tipos que vem do servidor ----------
export type Modo = 'yolo' | 'mid' | 'intern';
export type Nivel = 0 | 1 | 2;

export type Projeto = { id: number; nome: string; pasta: string };

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
  atualizada: string;
};

export type Negada = { ferramenta: string; categoria: string; resumo: string; regra: string };

export type Bloco =
  | { tipo: 'pensamento'; texto: string; segundos: number; vivo?: boolean }
  | { tipo: 'texto'; texto: string }
  | { tipo: 'ferramenta'; id: string; nome: string; resumo: string; erro?: boolean; rodando?: boolean }
  | { tipo: 'pergunta'; pergunta: string; opcoes: string[] }
  | { tipo: 'permissao'; negadas: Negada[]; respondida?: 'sim' | 'sempre' | 'nao' }
  | { tipo: 'erro'; texto: string };

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
  google: { id: string; nome: string }[];
};

export type Uso = { cincoHoras?: number; seteDias?: number; renovaEm?: number; estado?: string };

export type ResultadoBusca = { conversaId: number; titulo: string; trecho: string };

export function nomeDoModelo(id: string | null | undefined, modelos: ModelosApi | null): string {
  if (!id) return 'automático';
  return modelos?.claude.find((m) => m.id === id)?.nome ?? modelos?.google.find((m) => m.id === id)?.nome ?? id;
}
