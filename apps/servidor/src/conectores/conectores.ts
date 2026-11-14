// Conectores (etapa 6): guarda o estado e os tokens em dados/segredos, gera o mcp.json que o `claude` recebe por
// --mcp-config, descobre o que o proprio claude ja tem (`claude mcp list`) e diz, a cada turno, o que liberar.
// Regra 1 do CLAUDE.md: aqui entram so tokens de OUTROS servicos (GitHub etc.). Credenciais do Claude nunca.
import { execFile } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { acharPrograma, ambienteLimpo } from '../ia/processo.js';
import type { Modo } from '../ia/tipos.js';
import { CATALOGO, conectorPorId, prefixoMcp, type DefConector } from './catalogo.js';

export type Acesso = 'perguntar' | 'livre';

type EstadoSalvo = { ligado?: boolean; acesso?: Acesso; somenteLeitura?: boolean; token?: string };
type Arquivo = { conectores: Record<string, EstadoSalvo> };

export type Detectado = { nome: string; url: string; estado: 'conectado' | 'precisa-login' | 'falhou'; detalhe: string };
export type Deteccao = { quando: number; servidores: Detectado[]; erro?: string };

export type ResultadoTeste = { ok: boolean; mensagem: string; quando: number };

export type VisaoConector = {
  id: string;
  grupo: string;
  nome: string;
  descricao: string;
  tipo: 'token' | 'conta';
  ligado: boolean;
  acesso: Acesso;
  somenteLeitura: boolean | null; // null = o conector nao tem esse modo
  temToken: boolean;
  tokenFim: string; // so os 4 ultimos caracteres
  tokenOnde: string | null;
  // token: 'sem-token' | 'pronto' | 'ok' | 'falhou' ; conta: 'conectado' | 'precisa-login' | 'falhou' | 'nao-encontrado' | 'desconhecido'
  status: string;
  detalhe: string;
  servidor: string | null; // nome do servidor MCP (conta: o que o claude listou)
  comoLigar: string[];
};

export type PreparoConectores = {
  mcpConfig?: string;
  permitidas: string[];
  bloqueadas: string[];
  estrito: boolean; // --strict-mcp-config: so o que veio em --mcp-config
  instrucoes?: string;
};

type Busca = typeof fetch;
const VALIDADE_DETECCAO_MS = 90_000;

export function tokenValido(t: unknown): t is string {
  return typeof t === 'string' && t.length >= 8 && t.length <= 400 && !/[\s\u0000-\u001f\u007f]/.test(t);
}

// leitura da saida de `claude mcp list`: "nome: url - ✔ Connected" (o nome pode ter ":" e espacos)
export function lerListaMcp(saida: string): Detectado[] {
  const achados: Detectado[] = [];
  for (const bruta of saida.split(/\r?\n/)) {
    const linha = bruta.trim();
    const corte = linha.lastIndexOf(' - ');
    if (corte < 0) continue;
    const esquerda = linha.slice(0, corte);
    const detalhe = linha.slice(corte + 3).replace(/^[^\p{L}]+/u, '').trim();
    // o nome pode ter ":" ("plugin:vercel:vercel"); o separador certo e o primeiro ": " (com espaco)
    const i = esquerda.indexOf(': ');
    if (i <= 0) continue;
    const nome = esquerda.slice(0, i).trim();
    const url = esquerda.slice(i + 2).trim();
    if (!nome || !url) continue;
    const estado: Detectado['estado'] = /connected/i.test(detalhe) && !/fail|not/i.test(detalhe) ? 'conectado' : /authenticat|login/i.test(detalhe) ? 'precisa-login' : 'falhou';
    achados.push({ nome, url, estado, detalhe });
  }
  return achados;
}

function casa(def: DefConector, d: Detectado): boolean {
  if (def.casaUrl?.test(d.url)) return true;
  // pelo nome so vale pros conectores do claude.ai e plugins (evita "calendar" casar com outra coisa)
  return !!def.casaNome && /^(claude\.ai |plugin:)/i.test(d.nome) && def.casaNome.test(d.nome);
}

export class Conectores {
  private arquivo: string;
  private mcpJson: string;
  private detectadoArq: string;
  private testes = new Map<string, ResultadoTeste>();
  private deteccao: Deteccao | null = null;
  private emDeteccao: Promise<Deteccao> | null = null;

  constructor(
    private pasta: string, // dados/segredos
    private opcoes: {
      claudeBin: string;
      apis: { github: string; supabase: string; cloudflare: string };
      buscar?: Busca;
      agora?: () => number;
    },
  ) {
    mkdirSync(pasta, { recursive: true });
    this.arquivo = join(pasta, 'conectores.json');
    this.mcpJson = join(pasta, 'mcp.json');
    this.detectadoArq = join(pasta, 'conectores-detectados.json');
    try {
      if (existsSync(this.detectadoArq)) this.deteccao = JSON.parse(readFileSync(this.detectadoArq, 'utf8')) as Deteccao;
    } catch {
      this.deteccao = null;
    }
    this.gerarMcpJson();
  }

  private agora = () => (this.opcoes.agora ?? Date.now)();
  private buscar: Busca = (...a) => (this.opcoes.buscar ?? fetch)(...a);

  // ---------- estado salvo ----------
  private ler(): Arquivo {
    try {
      const o = JSON.parse(readFileSync(this.arquivo, 'utf8')) as Arquivo;
      return o && typeof o.conectores === 'object' && o.conectores ? o : { conectores: {} };
    } catch {
      return { conectores: {} };
    }
  }

  private gravar(a: Arquivo): void {
    const tmp = this.arquivo + '.tmp';
    writeFileSync(tmp, JSON.stringify(a, null, 2), { mode: 0o600 });
    renameSync(tmp, this.arquivo);
    this.protegido(this.arquivo);
    this.gerarMcpJson();
  }

  private protegido(arq: string): void {
    try {
      chmodSync(arq, 0o600);
    } catch {
      /* no Windows chmod quase nao faz nada; a pasta segredos ja e do usuario */
    }
  }

  private estadoDe(def: DefConector): Required<Pick<EstadoSalvo, 'ligado' | 'acesso'>> & { somenteLeitura: boolean; token: string } {
    const s = this.ler().conectores[def.id] ?? {};
    return {
      ligado: s.ligado ?? true,
      acesso: s.acesso === 'livre' ? 'livre' : 'perguntar',
      // com os dois modos disponiveis, comeca em somente leitura: o token costuma ter poder de escrita
      somenteLeitura: def.urlSomenteLeitura ? (s.somenteLeitura ?? true) : false,
      token: typeof s.token === 'string' ? s.token : '',
    };
  }

  // ---------- mcp.json (formato do claude) ----------
  private gerarMcpJson(): void {
    const servidores: Record<string, unknown> = {};
    for (const def of CATALOGO) {
      if (def.tipo !== 'token' || !def.url || !def.chaveMcp) continue;
      const e = this.estadoDe(def);
      if (!e.ligado || !e.token) continue;
      const url = e.somenteLeitura && def.urlSomenteLeitura ? def.urlSomenteLeitura : def.url;
      servidores[def.chaveMcp] = { type: 'http', url, headers: { Authorization: `Bearer ${e.token}` } };
    }
    writeFileSync(this.mcpJson, JSON.stringify({ mcpServers: servidores }, null, 2), { mode: 0o600 });
    this.protegido(this.mcpJson);
  }

  // ---------- o que o claude ja tem ----------
  deteccaoAtual(): Deteccao | null {
    return this.deteccao;
  }

  async detectar(forcar = false): Promise<Deteccao> {
    if (!forcar && this.deteccao && this.agora() - this.deteccao.quando < VALIDADE_DETECCAO_MS && !this.deteccao.erro) return this.deteccao;
    if (this.emDeteccao) return this.emDeteccao;
    this.emDeteccao = this.rodarLista().finally(() => {
      this.emDeteccao = null;
    });
    return this.emDeteccao;
  }

  private rodarLista(): Promise<Deteccao> {
    const programa = acharPrograma(this.opcoes.claudeBin);
    return new Promise<Deteccao>((resolve) => {
      const concluir = (d: Deteccao) => {
        // se a leitura falhou, a lista boa anterior continua valendo pras regras de cada turno
        if (!d.erro || !this.deteccao) {
          this.deteccao = d;
          if (!d.erro) {
            try {
              writeFileSync(this.detectadoArq, JSON.stringify(d), { mode: 0o600 });
            } catch {
              /* so um cache */
            }
          }
        }
        resolve(d.erro && this.deteccao ? { ...this.deteccao, erro: d.erro } : d);
      };
      try {
        execFile(
          programa,
          ['mcp', 'list'],
          { env: ambienteLimpo(), timeout: 60_000, windowsHide: true, maxBuffer: 1024 * 1024, shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(programa) },
          (erro, saida) => {
            if (erro && !saida) {
              concluir({ quando: this.agora(), servidores: [], erro: (erro as NodeJS.ErrnoException).code === 'ENOENT' ? 'não achei o claude no PC' : 'o claude não respondeu a tempo (claude mcp list)' });
              return;
            }
            concluir({ quando: this.agora(), servidores: lerListaMcp(String(saida)) });
          },
        );
      } catch (e) {
        concluir({ quando: this.agora(), servidores: [], erro: (e as Error).message });
      }
    });
  }

  private achado(def: DefConector): Detectado | undefined {
    return this.deteccao?.servidores.find((d) => casa(def, d));
  }

  // servidor MCP de um conector "conta" (nome como o claude listou), se existir
  servidorDe(id: string): { nome: string; estado: Detectado['estado'] } | undefined {
    const def = conectorPorId(id);
    const d = def ? this.achado(def) : undefined;
    return d ? { nome: d.nome, estado: d.estado } : undefined;
  }

  // ---------- telas ----------
  listar(): VisaoConector[] {
    return CATALOGO.map((def) => this.visao(def));
  }

  private visao(def: DefConector): VisaoConector {
    const e = this.estadoDe(def);
    const base = {
      id: def.id,
      grupo: def.grupo,
      nome: def.nome,
      descricao: def.descricao,
      tipo: def.tipo,
      ligado: e.ligado,
      acesso: e.acesso,
      somenteLeitura: def.urlSomenteLeitura ? e.somenteLeitura : null,
      temToken: !!e.token,
      tokenFim: e.token ? '••••' + e.token.slice(-4) : '',
      tokenOnde: def.tokenOnde ?? null,
      comoLigar: def.comoLigar ?? [],
    };
    if (def.tipo === 'token') {
      const t = this.testes.get(def.id);
      const status = !e.token ? 'sem-token' : t ? (t.ok ? 'ok' : 'falhou') : 'pronto';
      const detalhe = !e.token ? 'sem token' : (t?.mensagem ?? 'token salvo, ainda não testado');
      return { ...base, status, detalhe, servidor: def.chaveMcp ?? null };
    }
    const d = this.achado(def);
    if (!this.deteccao) return { ...base, status: 'desconhecido', detalhe: 'ainda não consultei o claude', servidor: null };
    if (!d) return { ...base, status: 'nao-encontrado', detalhe: 'o claude não tem esse conector', servidor: null };
    return { ...base, status: d.estado, detalhe: d.detalhe, servidor: d.nome };
  }

  mudar(id: string, campos: { ligado?: unknown; acesso?: unknown; somenteLeitura?: unknown; token?: unknown }): VisaoConector {
    const def = conectorPorId(id);
    if (!def) throw new Error('conector desconhecido');
    const a = this.ler();
    const s = { ...(a.conectores[id] ?? {}) };
    if (campos.ligado !== undefined) s.ligado = campos.ligado === true;
    if (campos.acesso !== undefined) {
      if (campos.acesso !== 'perguntar' && campos.acesso !== 'livre') throw new Error('acesso inválido: use "perguntar" ou "livre"');
      s.acesso = campos.acesso;
    }
    if (campos.somenteLeitura !== undefined) {
      if (!def.urlSomenteLeitura) throw new Error('esse conector não tem modo somente leitura');
      s.somenteLeitura = campos.somenteLeitura === true;
    }
    if (campos.token !== undefined) {
      if (def.tipo !== 'token') throw new Error('esse conector usa o login do próprio claude, sem token aqui');
      if (campos.token === '') delete s.token;
      else if (tokenValido(campos.token)) s.token = campos.token;
      else throw new Error('token inválido: sem espaços, de 8 a 400 caracteres');
      this.testes.delete(id);
    }
    a.conectores[id] = s;
    this.gravar(a);
    return this.visao(def);
  }

  // ---------- teste do token (chama a API do proprio servico, nunca a do claude) ----------
  async testar(id: string): Promise<ResultadoTeste> {
    const def = conectorPorId(id);
    if (!def || def.tipo !== 'token') throw new Error('só os conectores com token têm teste aqui');
    const token = this.estadoDe(def).token;
    if (!token) throw new Error('salve um token antes de testar');
    const { apis } = this.opcoes;
    const quando = this.agora();
    const pedir = async (url: string, extra: Record<string, string> = {}) =>
      this.buscar(url, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'hrzz-studio', Accept: 'application/json', ...extra }, signal: AbortSignal.timeout(10_000) });
    let r: ResultadoTeste;
    try {
      if (id === 'github') {
        const resp = await pedir(`${apis.github}/user`, { 'X-GitHub-Api-Version': '2022-11-28' });
        const j = (await resp.json().catch(() => ({}))) as { login?: string; message?: string };
        r = resp.ok ? { ok: true, mensagem: `conectado como ${j.login ?? 'usuário do GitHub'}`, quando } : { ok: false, mensagem: erroHttp(resp.status, j.message), quando };
      } else if (id === 'supabase') {
        const resp = await pedir(`${apis.supabase}/v1/projects`);
        const j = (await resp.json().catch(() => null)) as unknown;
        r = resp.ok ? { ok: true, mensagem: Array.isArray(j) ? `token válido, ${j.length} projeto${j.length === 1 ? '' : 's'}` : 'token válido', quando } : { ok: false, mensagem: erroHttp(resp.status), quando };
      } else if (id === 'cloudflare') {
        const resp = await pedir(`${apis.cloudflare}/user/tokens/verify`);
        const j = (await resp.json().catch(() => ({}))) as { result?: { status?: string }; errors?: { message?: string }[] };
        r = resp.ok && j.result?.status === 'active' ? { ok: true, mensagem: 'token ativo', quando } : { ok: false, mensagem: resp.ok ? `token ${j.result?.status ?? 'sem status'}` : erroHttp(resp.status, j.errors?.[0]?.message), quando };
      } else {
        r = { ok: false, mensagem: 'sem teste pra esse conector', quando };
      }
    } catch (e) {
      const nome = (e as Error).name;
      r = { ok: false, mensagem: nome === 'TimeoutError' || nome === 'AbortError' ? 'o serviço não respondeu em 10 s' : 'não consegui falar com o serviço (sem internet?)', quando };
    }
    this.testes.set(id, r);
    return r;
  }

  // chamada simples a um servico com o token salvo (usada pelo painel do dia)
  tokenDe(id: string): string {
    const def = conectorPorId(id);
    if (!def || def.tipo !== 'token') return '';
    const e = this.estadoDe(def);
    return e.ligado ? e.token : '';
  }

  // ---------- o que cada turno do claude recebe ----------
  paraTurno(modo: Modo, restrito: boolean): PreparoConectores {
    // pelo caminho da Cloudflare (sem ninguem olhando de perto) nenhum conector vale
    if (restrito) return { permitidas: [], bloqueadas: [], estrito: true };
    const permitidas: string[] = [];
    const bloqueadas: string[] = [];
    const ligadosNomes: string[] = [];
    let temServidor = false;
    for (const def of CATALOGO) {
      const e = this.estadoDe(def);
      const livre = modo === 'yolo' || e.acesso === 'livre';
      if (def.tipo === 'token') {
        if (!def.chaveMcp || !e.ligado || !e.token) continue;
        temServidor = true;
        ligadosNomes.push(def.nome);
        if (livre) permitidas.push(prefixoMcp(def.chaveMcp));
      } else {
        const d = this.achado(def);
        if (!d) continue;
        const prefixo = prefixoMcp(d.nome);
        if (!e.ligado) bloqueadas.push(prefixo);
        else {
          if (d.estado === 'conectado') ligadosNomes.push(`${def.grupo === 'Google' ? 'Google ' : ''}${def.nome}`);
          if (livre) permitidas.push(prefixo);
        }
      }
    }
    return {
      mcpConfig: temServidor ? this.mcpJson : undefined,
      permitidas,
      bloqueadas,
      estrito: false,
      instrucoes: ligadosNomes.length
        ? `Conectores ligados no HRZZ: ${ligadosNomes.join(', ')}. As ferramentas deles aparecem como mcp__*. Use quando o pedido for sobre esses serviços e diga ao João, em uma linha, o que consultou ou mudou. Se uma ferramenta for negada, o HRZZ pergunta ao João; não tente contornar.`
        : undefined,
    };
  }
}

function erroHttp(status: number, mensagem?: string): string {
  if (status === 401 || status === 403) return 'o serviço recusou o token (errado, vencido ou sem permissão)';
  if (status === 429) return 'o serviço pediu pra esperar (muitas chamadas)';
  return `o serviço respondeu erro ${status}${mensagem ? `: ${mensagem.slice(0, 80)}` : ''}`;
}
