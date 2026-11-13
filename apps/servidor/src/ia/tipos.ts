// Tipos compartilhados pelos motores de IA (claude e agy) e pelo orquestrador da conversa.

export type Modo = 'yolo' | 'mid' | 'intern';
export type Motor = 'claude' | 'agy';

export type ItemProgresso = { texto: string; estado: 'afazer' | 'fazendo' | 'feito' };

export type Negada = {
  ferramenta: string;
  entrada: Record<string, unknown>;
  categoria: 'apagar' | 'push' | 'fora' | 'comando' | 'edicao' | 'outra';
  resumo: string;
  regra: string; // texto guardado em conversas.liberadas quando o Joao aprova
};

// o que o motor avisa pra quem chamou, na ordem em que acontece
export type Evento =
  | { t: 'sessao'; id: string }
  | { t: 'pensando' }
  | { t: 'pensando_delta'; texto: string }
  | { t: 'texto_delta'; texto: string }
  | { t: 'ferramenta'; id: string; nome: string; resumo: string }
  | { t: 'ferramenta_fim'; id: string; erro: boolean }
  | { t: 'arquivo_alterado'; caminho: string }
  | { t: 'progresso'; itens: ItemProgresso[] }
  | { t: 'uso'; cincoHoras?: number; seteDias?: number; renovaEm?: number; estado?: string }
  | { t: 'permissao'; negadas: Negada[] }
  | { t: 'fim'; custo?: number; duracaoMs?: number; tokens?: number }
  | { t: 'erro'; mensagem: string };

// o que fica gravado na conversa (tabela mensagens.conteudo, em JSON)
export type Bloco =
  | { tipo: 'pensamento'; texto: string; segundos: number }
  | { tipo: 'texto'; texto: string }
  | { tipo: 'ferramenta'; id: string; nome: string; resumo: string; erro?: boolean }
  | { tipo: 'pergunta'; pergunta: string; opcoes: string[] }
  | { tipo: 'permissao'; negadas: Negada[]; respondida?: 'sim' | 'sempre' | 'nao' }
  | { tipo: 'erro'; texto: string };

export type OpcoesTurno = {
  motor: Motor;
  mensagem: string;
  cwd: string;
  modelo?: string; // alias do claude (opus|sonnet|haiku) ou id do agy
  esforco: 0 | 1 | 2;
  pensar: 0 | 1 | 2;
  web: boolean;
  modo: Modo;
  restrito: boolean;
  sessao?: string | null;
  promptSistema: string;
  pastasExtras: string[];
  liberadas: string[]; // regras aprovadas (nesta conversa ou so neste turno)
};

export type ResultadoTurno = {
  sessao?: string;
  blocos: Bloco[];
  erro?: string;
  parado?: boolean;
};

export type TurnoEmAndamento = {
  parar: () => void;
  terminou: Promise<ResultadoTurno>;
};
