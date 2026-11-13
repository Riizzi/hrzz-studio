// Orquestrador: recebe a mensagem, monta o prompt, escolhe o motor e o modelo, roda o processo
// e guarda tudo no SQLite. Fala com a interface por eventos (WebSocket).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config.js';
import { caminhosDados } from './config.js';
import { escolherModeloAuto } from './ia/modelos.js';
import { rodarClaude } from './ia/claude.js';
import { rodarAgy } from './ia/agy.js';
import { garantirMemoria, lerMemoria, montarPromptSistema } from './ia/prompt.js';
import type { Bloco, Evento, Modo, Negada, OpcoesTurno, TurnoEmAndamento } from './ia/tipos.js';
import type { Conversa, Repo } from './repo.js';

export type Anexo = { nome: string; caminho: string; tipo: string };

export type PedidoEnviar = {
  conversa?: number;
  projeto?: number | null;
  texto: string;
  anexos?: Anexo[];
  modelo?: string; // 'auto' | alias do claude | id do agy
  modo?: Modo;
  pensar?: 0 | 1 | 2;
  esforco?: 0 | 1 | 2;
  web?: boolean;
};

export type Saida =
  | { tipo: 'evento'; conversa: number; ev: Evento }
  | { tipo: 'conversa'; conversa: Conversa }
  | { tipo: 'mensagens'; conversa: number }
  | { tipo: 'progresso'; conversa: number }
  | { tipo: 'fim'; conversa: number; erro?: boolean }
  | { tipo: 'removida'; conversa: number };

export class Orquestrador {
  private rodando = new Map<number, TurnoEmAndamento>();
  ultimoUso: { cincoHoras?: number; seteDias?: number; renovaEm?: number; estado?: string; em: number } | null = null;

  constructor(
    private config: Config,
    private repo: Repo,
    private emitir: (s: Saida) => void,
  ) {
    garantirMemoria(caminhosDados(config).memoria);
  }

  estaRodando(conversa: number): boolean {
    return this.rodando.has(conversa);
  }

  parar(conversa: number): void {
    this.rodando.get(conversa)?.parar();
  }

  pastaDaConversa(c: Conversa): string {
    if (c.projetoId) {
      const p = this.repo.obterProjeto(c.projetoId);
      if (p) return p.pasta;
    }
    // conversa solta: pasta propria, pra o claude nao enxergar nada que nao seja dela
    const pasta = join(this.config.dados, 'projetos', '_soltas', String(c.id));
    mkdirSync(pasta, { recursive: true });
    return pasta;
  }

  // ---------- enviar ----------
  async enviar(pedido: PedidoEnviar, restrito: boolean): Promise<number> {
    const texto = (pedido.texto ?? '').trim();
    const anexos = pedido.anexos ?? [];
    if (!texto && anexos.length === 0) throw new Error('mensagem vazia');

    let conversa = pedido.conversa ? this.repo.obterConversa(pedido.conversa) : undefined;
    if (pedido.conversa && !conversa) throw new Error('conversa não encontrada');
    if (conversa && this.rodando.has(conversa.id)) throw new Error('essa conversa ainda está respondendo');

    if (!conversa) {
      conversa = this.repo.criarConversa({
        projetoId: pedido.projeto ?? null,
        titulo: tituloDe(texto || anexos[0]?.nome || 'nova conversa'),
        modo: pedido.modo ?? 'mid',
        pensar: pedido.pensar ?? 1,
        esforco: pedido.esforco ?? 1,
        web: pedido.web ?? true,
      });
    } else {
      // os botoes da interface valem pra conversa toda
      const campos: Record<string, string | number> = {};
      if (pedido.modo && pedido.modo !== conversa.modo) campos.modo = pedido.modo;
      if (pedido.pensar !== undefined && pedido.pensar !== conversa.pensar) campos.pensar = pedido.pensar;
      if (pedido.esforco !== undefined && pedido.esforco !== conversa.esforco) campos.esforco = pedido.esforco;
      if (pedido.web !== undefined && pedido.web !== conversa.web) campos.web = pedido.web ? 1 : 0;
      if (Object.keys(campos).length) this.repo.atualizarConversa(conversa.id, campos);
    }

    // modelo: o Joao escolheu, ou o HRZZ escolhe na primeira mensagem e mantem ate o fim
    const escolhaManual = pedido.modelo && pedido.modelo !== 'auto' ? pedido.modelo : undefined;
    if (escolhaManual && escolhaManual !== conversa.modelo) {
      this.repo.atualizarConversa(conversa.id, { modelo: escolhaManual, modelo_auto: 0, motor: ['opus', 'sonnet', 'haiku'].includes(escolhaManual) ? 'claude' : 'agy' });
    } else if (!conversa.modelo) {
      const m = escolherModeloAuto({
        texto,
        anexos: anexos.length,
        temProjeto: !!conversa.projetoId,
        cotaPct: this.cotaClaude(),
      });
      this.repo.atualizarConversa(conversa.id, { modelo: m, modelo_auto: 1, motor: 'claude' });
    }

    this.repo.salvarMensagem(conversa.id, 'eu', { texto, anexos });
    const conv = this.repo.obterConversa(conversa.id)!;
    this.emitir({ tipo: 'conversa', conversa: conv });
    this.emitir({ tipo: 'mensagens', conversa: conv.id });

    void this.rodar(conv, montarMensagem(texto, anexos), restrito, [], anexos);
    return conv.id;
  }

  // O Joao respondeu uma pergunta de permissao (botoes "pode", "pode sempre nesta conversa", "nao").
  async responderPermissao(
    d: { conversa: number; mensagem: number; indiceBloco: number; resposta: 'sim' | 'sempre' | 'nao' },
    restrito: boolean,
  ): Promise<void> {
    const conv = this.repo.obterConversa(d.conversa);
    const msg = this.repo.obterMensagem(d.mensagem);
    if (!conv || !msg || msg.conversaId !== conv.id || !Array.isArray(msg.conteudo)) throw new Error('pedido não encontrado');
    if (this.rodando.has(conv.id)) throw new Error('essa conversa ainda está respondendo');
    const blocos = msg.conteudo as Bloco[];
    const bloco = blocos[d.indiceBloco];
    if (!bloco || bloco.tipo !== 'permissao') throw new Error('pedido não encontrado');
    if (bloco.respondida) return;
    bloco.respondida = d.resposta;
    this.repo.atualizarMensagem(msg.id, blocos);
    this.emitir({ tipo: 'mensagens', conversa: conv.id });
    if (d.resposta === 'nao') return;

    const regras = bloco.negadas.map((n: Negada) => n.regra);
    let liberadas = conv.liberadas;
    if (d.resposta === 'sempre') {
      liberadas = [...new Set([...conv.liberadas, ...regras])];
      this.repo.atualizarConversa(conv.id, { liberadas: JSON.stringify(liberadas) });
    }
    const lista = bloco.negadas.map((n: Negada) => `- ${n.resumo}`).join('\n');
    const texto = `Autorizei o que foi negado. Pode fazer agora:\n${lista}`;
    this.repo.salvarMensagem(conv.id, 'eu', { texto, sistema: true });
    this.emitir({ tipo: 'mensagens', conversa: conv.id });
    void this.rodar(this.repo.obterConversa(conv.id)!, texto, restrito, d.resposta === 'sim' ? regras : [], []);
  }

  private cotaClaude(): number | undefined {
    const u = this.ultimoUso;
    if (!u || Date.now() - u.em > 6 * 3600 * 1000) return undefined;
    return Math.max(u.cincoHoras ?? 0, 0);
  }

  private async rodar(conv: Conversa, mensagem: string, restrito: boolean, liberadasDoTurno: string[], anexos: Anexo[]): Promise<void> {
    const cwd = this.pastaDaConversa(conv);
    const projeto = conv.projetoId ? this.repo.obterProjeto(conv.projetoId) : undefined;
    const sessao = conv.motor === 'agy' ? conv.sessaoAgy : conv.sessaoClaude;
    const dados = caminhosDados(this.config);
    const opcoes: OpcoesTurno = {
      motor: conv.motor,
      mensagem,
      cwd,
      modelo: conv.modelo ?? undefined,
      esforco: conv.esforco,
      pensar: conv.pensar,
      web: conv.web,
      modo: conv.modo,
      restrito,
      sessao,
      promptSistema: montarPromptSistema({ memoria: lerMemoria(dados.memoria), pensar: conv.pensar, nomeProjeto: projeto?.nome }),
      pastasExtras: [dados.anexos],
      liberadas: [...conv.liberadas, ...liberadasDoTurno],
    };

    const aoEvento = (ev: Evento) => {
      if (ev.t === 'sessao') {
        this.repo.atualizarConversa(conv.id, conv.motor === 'agy' ? { sessao_agy: ev.id } : { sessao_claude: ev.id });
      } else if (ev.t === 'progresso') {
        try {
          this.repo.sincronizarProgressoIa(conv.id, ev.itens);
          this.emitir({ tipo: 'progresso', conversa: conv.id });
        } catch {
          /* progresso e acessorio: nao derruba a conversa */
        }
      } else if (ev.t === 'uso') {
        this.ultimoUso = { cincoHoras: ev.cincoHoras, seteDias: ev.seteDias, renovaEm: ev.renovaEm, estado: ev.estado, em: Date.now() };
      }
      this.emitir({ tipo: 'evento', conversa: conv.id, ev });
    };

    const turno = conv.motor === 'agy' ? rodarAgy(this.config, opcoes, aoEvento) : rodarClaude(this.config, opcoes, aoEvento);
    this.rodando.set(conv.id, turno);
    let falhou = false;
    try {
      const r = await turno.terminou;
      falhou = !!r.erro;
      if (r.blocos.length) this.repo.salvarMensagem(conv.id, 'ia', r.blocos);
      else if (r.parado) this.repo.salvarMensagem(conv.id, 'ia', [{ tipo: 'texto', texto: '(parado)' }]);
      if (r.sessao) this.repo.atualizarConversa(conv.id, conv.motor === 'agy' ? { sessao_agy: r.sessao } : { sessao_claude: r.sessao });
    } catch (e) {
      falhou = true;
      this.repo.salvarMensagem(conv.id, 'ia', [{ tipo: 'erro', texto: (e as Error).message }]);
    } finally {
      this.rodando.delete(conv.id);
      this.repo.tocarConversa(conv.id);
      this.emitir({ tipo: 'mensagens', conversa: conv.id });
      this.emitir({ tipo: 'conversa', conversa: this.repo.obterConversa(conv.id)! });
      this.emitir({ tipo: 'fim', conversa: conv.id, erro: falhou });
    }
  }
}

function tituloDe(texto: string): string {
  const t = texto.replace(/\s+/g, ' ').trim();
  return t.length > 48 ? t.slice(0, 47) + '…' : t || 'nova conversa';
}

export function montarMensagem(texto: string, anexos: Anexo[]): string {
  if (anexos.length === 0) return texto;
  const lista = anexos.map((a) => `- ${a.nome} (${a.tipo || 'arquivo'}): ${a.caminho}`).join('\n');
  return `${texto}\n\nArquivos anexados (leia pelo caminho):\n${lista}`;
}
