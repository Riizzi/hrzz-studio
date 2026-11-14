// Catalogo de conectores (etapa 6). Dois tipos:
//  - "token": o HRZZ guarda um token do proprio servico em dados/segredos e gera o mcp.json que o `claude` recebe
//    por --mcp-config (GitHub, Supabase, Cloudflare). Nunca e token do Claude.
//  - "conta": o `claude` ja carrega sozinho (conectores do claude.ai, plugins ou `claude mcp add`). O login e feito
//    pelo Joao, pelo fluxo da Anthropic; o HRZZ so le a lista (`claude mcp list`) e liga/desliga o uso.
// URLs conferidas em 14/11/2026 nas paginas dos proprios servicos (ver docs/02-ias.md, "Conectores").

export type TipoConector = 'token' | 'conta';

export type DefConector = {
  id: string;
  grupo: 'GitHub' | 'Google' | 'Vercel' | 'Cloudflare' | 'Supabase';
  nome: string;
  descricao: string;
  tipo: TipoConector;
  // tipo token: servidor MCP remoto e como o token e enviado
  url?: string;
  urlSomenteLeitura?: string;
  chaveMcp?: string; // nome do servidor no mcp.json (as ferramentas viram mcp__<chaveMcp>__*)
  tokenOnde?: string; // onde o Joao cria o token
  // tipo conta: como reconhecer o servidor na saida de `claude mcp list`
  casaUrl?: RegExp;
  casaNome?: RegExp;
  comoLigar?: string[]; // passos pro Joao (um comando por linha)
};

export const CATALOGO: DefConector[] = [
  {
    id: 'github',
    grupo: 'GitHub',
    nome: 'GitHub',
    descricao: 'repositórios, issues, pull requests e código',
    tipo: 'token',
    url: 'https://api.githubcopilot.com/mcp/',
    urlSomenteLeitura: 'https://api.githubcopilot.com/mcp/readonly',
    chaveMcp: 'hrzz-github',
    tokenOnde: 'github.com > settings > developer settings > personal access tokens. Dê só o acesso que precisa (repo, issues, pull requests).',
  },
  {
    id: 'google-drive',
    grupo: 'Google',
    nome: 'Drive',
    descricao: 'procurar e ler arquivos do Drive',
    tipo: 'conta',
    casaUrl: /drivemcp\.googleapis\.com/i,
    casaNome: /google drive/i,
    comoLigar: ['No claude.ai: configurações > conectores > Google Drive > conectar.'],
  },
  {
    id: 'google-docs',
    grupo: 'Google',
    nome: 'Docs',
    descricao: 'ler e editar documentos',
    tipo: 'conta',
    casaUrl: /docsmcp\.googleapis\.com/i,
    casaNome: /google docs/i,
    comoLigar: ['No claude.ai: configurações > conectores > Google Docs > conectar.'],
  },
  {
    id: 'google-sheets',
    grupo: 'Google',
    nome: 'Planilhas',
    descricao: 'ler e editar planilhas',
    tipo: 'conta',
    casaUrl: /sheetsmcp\.googleapis\.com/i,
    casaNome: /google sheets/i,
    comoLigar: ['No claude.ai: configurações > conectores > Google Sheets > conectar.'],
  },
  {
    id: 'google-calendar',
    grupo: 'Google',
    nome: 'Agenda',
    descricao: 'eventos do Google Agenda (alimenta o painel do dia)',
    tipo: 'conta',
    casaUrl: /calendarmcp\.googleapis\.com/i,
    casaNome: /(google )?calendar|agenda/i,
    comoLigar: ['No claude.ai: configurações > conectores > Google Calendar > conectar.'],
  },
  {
    id: 'gmail',
    grupo: 'Google',
    nome: 'Gmail',
    descricao: 'procurar e ler e-mails',
    tipo: 'conta',
    casaUrl: /gmailmcp\.googleapis\.com/i,
    casaNome: /gmail/i,
    comoLigar: ['No claude.ai: configurações > conectores > Gmail > conectar.'],
  },
  {
    id: 'vercel',
    grupo: 'Vercel',
    nome: 'Vercel',
    descricao: 'projetos, deploys e logs',
    tipo: 'conta',
    casaUrl: /mcp\.vercel\.com/i,
    casaNome: /vercel/i,
    comoLigar: ['claude mcp add --transport http --scope user vercel https://mcp.vercel.com', 'claude', '(dentro do claude, digite /mcp, escolha vercel e entre pelo navegador)'],
  },
  {
    id: 'cloudflare',
    grupo: 'Cloudflare',
    nome: 'Cloudflare',
    descricao: 'DNS, Workers, túneis e Access',
    tipo: 'token',
    url: 'https://mcp.cloudflare.com/mcp',
    chaveMcp: 'hrzz-cloudflare',
    tokenOnde: 'dash.cloudflare.com > meu perfil > tokens de API. Crie um token só com as permissões que quer dar.',
  },
  {
    id: 'supabase',
    grupo: 'Supabase',
    nome: 'Supabase',
    descricao: 'bancos, tabelas e funções',
    tipo: 'token',
    url: 'https://mcp.supabase.com/mcp',
    urlSomenteLeitura: 'https://mcp.supabase.com/mcp?read_only=true',
    chaveMcp: 'hrzz-supabase',
    tokenOnde: 'supabase.com/dashboard/account/tokens: crie um token de acesso pessoal.',
  },
];

export function conectorPorId(id: string): DefConector | undefined {
  return CATALOGO.find((c) => c.id === id);
}

// nome do servidor MCP -> prefixo das ferramentas, como o claude monta (caracteres fora de [A-Za-z0-9_-] viram "_")
export function prefixoMcp(nomeServidor: string): string {
  return 'mcp__' + nomeServidor.replace(/[^A-Za-z0-9_-]/g, '_');
}
