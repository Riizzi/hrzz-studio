// Traduz o fluxo JSON (uma linha por evento) do `claude -p --output-format stream-json` em eventos do HRZZ.
// O agy usa o mesmo parser (o formato dele parece o do Claude Code); linhas que nao forem JSON viram texto.
import { extrairBlocos, lerTodos } from './blocos.js';
import { classificarNegada } from './permissoes.js';
import type { Bloco, Evento, ResultadoTurno } from './tipos.js';

type Json = Record<string, any>;

const FERRAMENTAS_DE_ARQUIVO = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const FERRAMENTAS_DE_TAREFA = new Set(['TodoWrite']);

export function resumirFerramenta(nome: string, entrada: Json | undefined): string {
  const e = entrada ?? {};
  const corta = (t: unknown, n = 90) => {
    const s = String(t ?? '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  };
  if (typeof e.command === 'string') return corta(e.command);
  if (typeof e.file_path === 'string') return corta(e.file_path);
  if (typeof e.notebook_path === 'string') return corta(e.notebook_path);
  if (typeof e.pattern === 'string') return corta(e.pattern);
  if (typeof e.query === 'string') return corta(e.query);
  if (typeof e.url === 'string') return corta(e.url);
  if (typeof e.description === 'string') return corta(e.description);
  if (typeof e.prompt === 'string') return corta(e.prompt);
  if (nome === 'Skill' && typeof e.skill === 'string') return corta(e.skill);
  return '';
}

export class LeitorDeFluxo {
  blocos: Bloco[] = [];
  sessao?: string;
  erro?: string;
  terminou = false;
  private pensandoDesde = 0;
  private pensamentoBuf = '';
  private textoVisto = false;

  constructor(
    private aoEvento: (e: Evento) => void,
    private opcoes: { cwd: string; mostrarPensamento: boolean },
  ) {}

  private emitir(e: Evento) {
    this.aoEvento(e);
  }

  linha(bruta: string): void {
    const linha = bruta.trim();
    if (!linha) return;
    let o: Json;
    try {
      o = JSON.parse(linha) as Json;
    } catch {
      // saida que nao e JSON (agy em modo texto, avisos): trata como texto
      this.textoVisto = true;
      this.blocos.push({ tipo: 'texto', texto: linha });
      this.emitir({ t: 'texto_delta', texto: linha + '\n' });
      return;
    }
    this.objeto(o);
  }

  private objeto(o: Json): void {
    const sid = o.session_id ?? o.conversation_id ?? o.conversationId;
    if (typeof sid === 'string' && sid && sid !== this.sessao) {
      this.sessao = sid;
      this.emitir({ t: 'sessao', id: sid });
    }
    switch (o.type) {
      case 'stream_event':
        return this.parcial(o.event ?? {});
      case 'assistant':
        return this.mensagemCompleta(o.message?.content ?? []);
      case 'user':
        return this.resultadoDeFerramenta(o.message?.content ?? []);
      case 'rate_limit_event':
        return this.limite(o.rate_limit_info ?? {});
      case 'result':
        return this.resultado(o);
      default:
        // agy ou versoes futuras: aproveita campos de texto comuns
        if (typeof o.text === 'string' && !o.type?.startsWith('system')) {
          this.textoVisto = true;
          this.blocos.push({ tipo: 'texto', texto: o.text });
          this.emitir({ t: 'texto_delta', texto: o.text });
        }
    }
  }

  private parcial(ev: Json): void {
    if (ev.type === 'content_block_start') {
      const b = ev.content_block ?? {};
      if (b.type === 'thinking') {
        this.pensandoDesde = Date.now();
        this.pensamentoBuf = '';
        if (this.opcoes.mostrarPensamento) this.emitir({ t: 'pensando' });
      } else if (b.type === 'tool_use') {
        this.emitir({ t: 'ferramenta', id: String(b.id), nome: String(b.name), resumo: '' });
      }
    } else if (ev.type === 'content_block_delta') {
      const d = ev.delta ?? {};
      if (d.type === 'thinking_delta' && typeof d.thinking === 'string') {
        this.pensamentoBuf += d.thinking;
        if (this.opcoes.mostrarPensamento) this.emitir({ t: 'pensando_delta', texto: d.thinking });
      } else if (d.type === 'text_delta' && typeof d.text === 'string') {
        this.emitir({ t: 'texto_delta', texto: d.text });
      }
    }
  }

  private mensagemCompleta(conteudo: Json[]): void {
    for (const c of conteudo) {
      if (c.type === 'thinking') {
        const segundos = this.pensandoDesde ? Math.max(1, Math.round((Date.now() - this.pensandoDesde) / 1000)) : 1;
        const texto = String(c.thinking || this.pensamentoBuf || '');
        this.pensandoDesde = 0;
        if (this.opcoes.mostrarPensamento) this.blocos.push({ tipo: 'pensamento', texto, segundos });
      } else if (c.type === 'text' && typeof c.text === 'string') {
        const x = extrairBlocos(c.text);
        if (x.texto) {
          this.textoVisto = true;
          this.blocos.push({ tipo: 'texto', texto: x.texto });
        }
        if (x.progresso) this.emitir({ t: 'progresso', itens: x.progresso });
        if (x.pergunta) this.blocos.push({ tipo: 'pergunta', ...x.pergunta });
      } else if (c.type === 'tool_use') {
        const nome = String(c.name);
        const entrada = (c.input ?? {}) as Json;
        const resumo = resumirFerramenta(nome, entrada);
        this.blocos.push({ tipo: 'ferramenta', id: String(c.id), nome, resumo });
        this.emitir({ t: 'ferramenta', id: String(c.id), nome, resumo });
        if (FERRAMENTAS_DE_ARQUIVO.has(nome)) {
          const caminho = entrada.file_path ?? entrada.notebook_path;
          if (typeof caminho === 'string') this.emitir({ t: 'arquivo_alterado', caminho });
        }
        if (FERRAMENTAS_DE_TAREFA.has(nome)) {
          const itens = lerTodos(entrada);
          if (itens) this.emitir({ t: 'progresso', itens });
        }
      }
    }
  }

  private resultadoDeFerramenta(conteudo: Json[]): void {
    if (!Array.isArray(conteudo)) return;
    for (const c of conteudo) {
      if (c.type !== 'tool_result') continue;
      const id = String(c.tool_use_id);
      const erro = c.is_error === true;
      const bloco = this.blocos.find((b) => b.tipo === 'ferramenta' && b.id === id);
      if (bloco && bloco.tipo === 'ferramenta' && erro) bloco.erro = true;
      this.emitir({ t: 'ferramenta_fim', id, erro });
    }
  }

  private limite(info: Json): void {
    const janelas = (info.unifiedWindows ?? {}) as Json;
    const pct = (v: unknown) => (typeof v === 'number' ? Math.round((v <= 1 ? v * 100 : v) * 10) / 10 : undefined);
    const cinco = janelas.five_hour as Json | undefined;
    const sete = janelas.seven_day as Json | undefined;
    this.emitir({
      t: 'uso',
      cincoHoras: pct(cinco?.utilization),
      seteDias: pct(sete?.utilization),
      renovaEm: typeof cinco?.resetsAt === 'number' ? cinco.resetsAt : typeof info.resetsAt === 'number' ? info.resetsAt : undefined,
      estado: typeof info.status === 'string' ? info.status : undefined,
    });
  }

  private resultado(o: Json): void {
    this.terminou = true;
    const negadas = Array.isArray(o.permission_denials) ? (o.permission_denials as Json[]) : [];
    if (negadas.length > 0) {
      const vistas = new Set<string>();
      const lista = [];
      for (const n of negadas) {
        const item = classificarNegada(String(n.tool_name), (n.tool_input ?? {}) as Json, this.opcoes.cwd);
        const chave = item.categoria + item.resumo;
        if (vistas.has(chave)) continue;
        vistas.add(chave);
        lista.push(item);
      }
      this.blocos.push({ tipo: 'permissao', negadas: lista });
      this.emitir({ t: 'permissao', negadas: lista });
    }
    const falhou = o.is_error === true || (typeof o.subtype === 'string' && o.subtype.startsWith('error'));
    if (falhou) {
      const texto = typeof o.result === 'string' && o.result ? o.result : `o motor terminou com erro (${o.subtype ?? 'desconhecido'})`;
      this.erro = texto;
      this.blocos.push({ tipo: 'erro', texto });
      this.emitir({ t: 'erro', mensagem: texto });
    } else if (!this.textoVisto && typeof o.result === 'string' && o.result.trim() && negadas.length === 0) {
      const x = extrairBlocos(o.result);
      if (x.texto) {
        this.blocos.push({ tipo: 'texto', texto: x.texto });
        this.emitir({ t: 'texto_delta', texto: x.texto });
      }
    }
    const u = (o.usage ?? {}) as Json;
    const tokens = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'].reduce(
      (s, k) => s + (typeof u[k] === 'number' ? (u[k] as number) : 0),
      0,
    );
    this.emitir({ t: 'fim', custo: typeof o.total_cost_usd === 'number' ? o.total_cost_usd : undefined, duracaoMs: o.duration_ms ?? o.duration_api_ms, tokens });
  }

  resultadoFinal(): ResultadoTurno {
    return { sessao: this.sessao, blocos: this.blocos, erro: this.erro };
  }
}
