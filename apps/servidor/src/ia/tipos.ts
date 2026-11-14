// Tipos compartilhados pelos motores de IA (claude e agy) e pelo orquestrador da conversa.

export type Modo = 'yolo' | 'mid' | 'intern';
export type Motor = 'claude' | 'agy';

export type ItemProgresso = { texto: string; estado: 'afazer' | 'fazendo' | 'feito' };

export type Negada = {
  ferramenta: string;
  entrada: Record<string, unknown>;
  categoria: 'apagar' | 'push' | 'fora' | 'comando' | 'edicao' | 'conector' | 'outra';
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
  | { t: 'gemini'; id: string; tarefa: string; texto: string; erro: boolean }
  | { t: 'limite'; texto: string; renovaEm?: number }
  | { t: 'erro'; mensagem: string };

// o que fica gravado na conversa (tabela mensagens.conteudo, em JSON)
export type Bloco =
  | { tipo: 'pensamento'; texto: string; segundos: number }
  | { tipo: 'texto'; texto: string }
  | { tipo: 'ferramenta'; id: string; nome: string; resumo: string; erro?: boolean }
  | { tipo: 'pergunta'; pergunta: string; opcoes: string[] }
  | { tipo: 'permissao'; negadas: Negada[]; respondida?: 'sim' | 'sempre' | 'nao' }
  | { tipo: 'erro'; texto: string }
  // dueto: o que o Gemini devolveu pro Claude (aparece recuado, com o ponto do Google)
  | { tipo: 'gemini'; id: string; tarefa: string; texto: string; erro?: boolean }
  // limite de uso da assinatura batido: a tela oferece trocar de modelo
  | { tipo: 'limite'; texto: string; renovaEm?: number }
  // duelo: as duas respostas lado a lado
  | { tipo: 'duelo'; id: string; base: string; lados: LadoDuelo[]; escolhida: 0 | 1 | -1 | null; aviso?: string };

export type LadoDuelo = { motor: Motor; modelo: string | null; nome: string; blocos: Bloco[]; mudancas: string[]; falhou?: boolean };

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
  pluginDirs?: string[]; // plugins extras do claude (skills do Joao no HRZZ)
  bloqueadasExtra?: string[]; // regras --disallowedTools a mais (skills desligadas)
  mcpConfig?: string; // arquivo de conectores MCP (dueto)
  mcpExtras?: string[]; // mais arquivos --mcp-config (conectores)
  mcpEstrito?: boolean; // --strict-mcp-config: ignora os servidores MCP que o claude ja tem
  permitidasExtra?: string[]; // ferramentas liberadas a mais (a do dueto)
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
