// Orquestrador: recebe a mensagem, monta o prompt, escolhe o motor e o modelo, roda o processo
// e guarda tudo no SQLite. Fala com a interface por eventos (WebSocket).
// Etapa 5: dueto (o Claude chama o Gemini), duelo (os dois respondem, o Joao escolhe), guardiao de cota
// e execucao em segundo plano (fila e agendamentos).
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config.js';
import { caminhosDados } from './config.js';
import { Guardiao } from './cota.js';
import { escolherModeloAuto } from './ia/modelos.js';
import { rodarClaude } from './ia/claude.js';
import { rodarAgy } from './ia/agy.js';
import { prepararDueto } from './ia/dueto.js';
import { garantirMemoria, lerMemoria, montarPromptSistema } from './ia/prompt.js';
import type { Bloco, Evento, LadoDuelo, Modo, Motor, Negada, OpcoesTurno, TurnoEmAndamento } from './ia/tipos.js';
import type { Conversa, Parceria, Repo } from './repo.js';
import { prepararPluginSkills, regrasSkillsDesligadas } from './acervo/skills.js';

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
  parceria?: Parceria;
};

export type Saida =
  | { tipo: 'evento'; conversa: number; ev: Evento; lado?: 0 | 1 }
  | { tipo: 'conversa'; conversa: Conversa }
  | { tipo: 'mensagens'; conversa: number }
  | { tipo: 'progresso'; conversa: number }
  | { tipo: 'fim'; conversa: number; erro?: boolean }
  | { tipo: 'removida'; conversa: number }
  | { tipo: 'fila' }
  | { tipo: 'cota'; cota: ReturnType<Guardiao['estado']> }
  | { tipo: 'preview_atualizado'; chave: string; motivo: string; conversa?: number };

export type AlvoTurno = { chave: string; pasta: string };

// copias separadas da pasta do projeto, uma pra cada lado do duelo (implementado pelo Versionador)
export type Copias = {
  instantaneo(a: AlvoTurno): Promise<string>;
  extrair(a: AlvoTurno, arvore: string, destino: string): Promise<void>;
  mudancas(a: AlvoTurno, base: string, copia: string): Promise<{ estado: 'A' | 'M' | 'D'; caminho: string }[]>;
  aplicar(a: AlvoTurno, base: string, copia: string): Promise<number>;
};

export type ResultadoRodada = { falhou: boolean; pendentePermissao: boolean };

const LADOS: { motor: Motor; pasta: string }[] = [
  { motor: 'claude', pasta: 'claude' },
  { motor: 'agy', pasta: 'agy' },
];

export class Orquestrador {
  private rodando = new Map<number, TurnoEmAndamento[]>();
  // ganchos da etapa 2: ponto de retorno antes do turno e checagem de mudanca depois dele
  antesDoTurno?: (alvo: AlvoTurno) => Promise<void>;
  depoisDoTurno?: (alvo: AlvoTurno) => Promise<boolean>;
  // etapa 5: copias separadas pro duelo
  copias?: Copias;
  guardiao: Guardiao;

  constructor(
    private config: Config,
    private repo: Repo,
    private emitir: (s: Saida) => void,
  ) {
    garantirMemoria(caminhosDados(config).memoria);
    this.guardiao = new Guardiao(repo);
  }

  estaRodando(conversa: number): boolean {
    return this.rodando.has(conversa);
  }

  parar(conversa: number): void {
    for (const t of this.rodando.get(conversa) ?? []) t.parar();
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

  private alvoDe(c: Conversa): AlvoTurno {
    return { chave: c.projetoId ? `p${c.projetoId}` : `c${c.id}`, pasta: this.pastaDaConversa(c) };
  }

  // ---------- enviar ----------
  // Grava a mensagem e prepara a conversa. Devolve o que falta rodar.
  private async preparar(pedido: PedidoEnviar, restrito: boolean): Promise<{ conv: Conversa; mensagem: string; anexos: Anexo[] }> {
    const texto = (pedido.texto ?? '').trim();
    const anexos = pedido.anexos ?? [];
    if (!texto && anexos.length === 0) throw new Error('mensagem vazia');

    let conversa = pedido.conversa ? this.repo.obterConversa(pedido.conversa) : undefined;
    if (pedido.conversa && !conversa) throw new Error('conversa não encontrada');
    if (conversa && this.rodando.has(conversa.id)) throw new Error('essa conversa ainda está respondendo');

    const parceria: Parceria = pedido.parceria === 'dueto' || pedido.parceria === 'duelo' ? pedido.parceria : '';
    if (restrito && (pedido.parceria !== undefined ? parceria : (conversa?.parceria ?? ''))) {
      throw new Error('dueto e duelo não funcionam pelo acesso do trabalho (Cloudflare): o Gemini poderia rodar comandos aí');
    }
    if (conversa && this.duelaSemEscolha(conversa.id)) throw new Error('escolha uma das respostas do duelo (ou "nenhuma") antes de continuar');

    if (!conversa) {
      conversa = this.repo.criarConversa({
        projetoId: pedido.projeto ?? null,
        titulo: tituloDe(texto || anexos[0]?.nome || 'nova conversa'),
        modo: pedido.modo ?? 'mid',
        pensar: pedido.pensar ?? 1,
        esforco: pedido.esforco ?? 1,
        web: pedido.web ?? true,
      });
      if (parceria) this.repo.atualizarConversa(conversa.id, { parceria });
    } else {
      // os botoes da interface valem pra conversa toda
      const campos: Record<string, string | number> = {};
      if (pedido.modo && pedido.modo !== conversa.modo) campos.modo = pedido.modo;
      if (pedido.pensar !== undefined && pedido.pensar !== conversa.pensar) campos.pensar = pedido.pensar;
      if (pedido.esforco !== undefined && pedido.esforco !== conversa.esforco) campos.esforco = pedido.esforco;
      if (pedido.web !== undefined && pedido.web !== conversa.web) campos.web = pedido.web ? 1 : 0;
      if (pedido.parceria !== undefined && pedido.parceria !== conversa.parceria && ['', 'dueto', 'duelo'].includes(pedido.parceria)) campos.parceria = pedido.parceria;
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
        cotaPct: this.guardiao.cincoHoras(),
      });
      this.repo.atualizarConversa(conversa.id, { modelo: m, modelo_auto: 1, motor: 'claude' });
    }

    const conv = this.repo.obterConversa(conversa.id)!;
    if (conv.parceria === 'dueto' && conv.motor === 'agy') {
      // nada foi gravado ainda alem dos ajustes; a conversa nova some pra nao ficar vazia
      if (!pedido.conversa) this.repo.apagarConversa(conv.id);
      throw new Error('o dueto precisa de um modelo do Claude: é ele quem coordena. Troque o modelo ou desligue o dueto');
    }

    this.repo.salvarMensagem(conv.id, 'eu', { texto, anexos });
    this.emitir({ tipo: 'conversa', conversa: conv });
    this.emitir({ tipo: 'mensagens', conversa: conv.id });
    return { conv, mensagem: montarMensagem(texto, anexos), anexos };
  }

  async enviar(pedido: PedidoEnviar, restrito: boolean): Promise<number> {
    const { conv, mensagem, anexos } = await this.preparar(pedido, restrito);
    void this.comecar(conv, mensagem, restrito, anexos);
    return conv.id;
  }

  // Fila em segundo plano: roda como uma conversa de verdade (aparece na barra lateral) e espera acabar.
  async enviarEEsperar(pedido: PedidoEnviar, aoCriar?: (conversa: number) => void): Promise<ResultadoRodada & { conversa: number }> {
    const { conv, mensagem, anexos } = await this.preparar(pedido, false);
    aoCriar?.(conv.id);
    const r = await this.comecar(conv, mensagem, false, anexos);
    return { ...r, conversa: conv.id };
  }

  private comecar(conv: Conversa, mensagem: string, restrito: boolean, anexos: Anexo[]): Promise<ResultadoRodada> {
    return conv.parceria === 'duelo' ? this.rodarDuelo(conv, mensagem, restrito, anexos) : this.rodar(conv, mensagem, restrito, [], anexos);
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

  // avisa a interface que o projeto mudou (o painel abre sozinho e recarrega o preview); no maximo uma vez por segundo
  private ultimoAviso = new Map<string, number>();
  private avisarPreview(alvo: AlvoTurno, conversa: number, forcar = false): void {
    const agora = Date.now();
    if (!forcar && agora - (this.ultimoAviso.get(alvo.chave) ?? 0) < 1000) return;
    this.ultimoAviso.set(alvo.chave, agora);
    this.emitir({ tipo: 'preview_atualizado', chave: alvo.chave, motivo: 'ia', conversa });
  }

  private registrarUso(ev: Extract<Evento, { t: 'uso' }>): void {
    const antes = this.guardiao.estado().nivel;
    this.guardiao.registrar({ cincoHoras: ev.cincoHoras, seteDias: ev.seteDias, renovaEm: ev.renovaEm, estado: ev.estado });
    const depois = this.guardiao.estado();
    if (depois.nivel !== antes) this.emitir({ tipo: 'cota', cota: depois });
  }

  // ---------- opcoes do processo (iguais pro turno normal, pro dueto e pros lados do duelo) ----------
  private opcoesDoTurno(
    conv: Conversa,
    d: { mensagem: string; cwd: string; restrito: boolean; liberadas: string[]; motor: Motor; modelo?: string | null; sessao?: string | null },
  ): OpcoesTurno {
    const projeto = conv.projetoId ? this.repo.obterProjeto(conv.projetoId) : undefined;
    const dados = caminhosDados(this.config);
    // skills: as do HRZZ ligadas neste projeto viram um plugin; as desligadas ganham regra de bloqueio
    const escopo = conv.projetoId ?? 0;
    const desligadas = this.repo.skillsDesligadas(escopo);
    let pluginDirs: string[] = [];
    try {
      const plugin = prepararPluginSkills(dados.skills, dados.skillsAtivas, `escopo-${escopo}`, desligadas);
      pluginDirs = plugin ? [plugin] : [];
    } catch {
      /* skills sao acessorias: a conversa segue sem elas */
    }
    // "usar o Haiku ate renovar": vale pro Claude em qualquer conversa
    const modelo = d.motor === 'claude' && this.guardiao.haikuAtivo() ? 'haiku' : (d.modelo ?? undefined);
    const o: OpcoesTurno = {
      motor: d.motor,
      mensagem: d.mensagem,
      cwd: d.cwd,
      modelo,
      esforco: conv.esforco,
      pensar: conv.pensar,
      web: conv.web,
      modo: conv.modo,
      restrito: d.restrito,
      sessao: d.sessao,
      promptSistema: montarPromptSistema({ memoria: lerMemoria(dados.memoria), pensar: conv.pensar, nomeProjeto: projeto?.nome, skillsDesligadas: desligadas }),
      pastasExtras: [dados.anexos, ...(pluginDirs.length ? [dados.skillsAtivas] : [])],
      pluginDirs,
      bloqueadasExtra: regrasSkillsDesligadas(desligadas),
      liberadas: [...conv.liberadas, ...d.liberadas],
    };
    return o;
  }

  // o dueto acrescenta o servidor MCP do Gemini ao turno do Claude
  private comDueto(conv: Conversa, o: OpcoesTurno, pastaProjeto: string): OpcoesTurno {
    const dados = caminhosDados(this.config);
    const p = prepararDueto(this.config, {
      pastaDueto: dados.dueto,
      conversa: conv.id,
      pastaProjeto,
      subpasta: this.repo.lerConfig('dueto:subpasta'),
      modo: conv.modo,
      modeloAgy: this.repo.lerConfig('dueto:modelo_agy') || undefined,
    });
    return { ...o, mcpConfig: p.mcpConfig, permitidasExtra: p.permitidas, promptSistema: `${o.promptSistema}\n\n${p.instrucoes}` };
  }

  private async rodar(conv: Conversa, mensagem: string, restrito: boolean, liberadasDoTurno: string[], anexos: Anexo[]): Promise<ResultadoRodada> {
    void anexos;
    const cwd = this.pastaDaConversa(conv);
    const sessao = conv.motor === 'agy' ? conv.sessaoAgy : conv.sessaoClaude;
    // depois de um duelo, o que foi escolhido entra como contexto da proxima mensagem
    const contexto = this.repo.lerConfig(`duelo_ctx:${conv.id}`);
    if (contexto) {
      this.repo.apagarConfig(`duelo_ctx:${conv.id}`);
      mensagem = `${contexto}\n\n${mensagem}`;
    }
    let opcoes = this.opcoesDoTurno(conv, { mensagem, cwd, restrito, liberadas: liberadasDoTurno, motor: conv.motor, modelo: conv.modelo, sessao });
    if (conv.parceria === 'dueto' && conv.motor === 'claude' && !restrito) opcoes = this.comDueto(conv, opcoes, cwd);

    let alterou = false;
    const alvo = this.alvoDe(conv);
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
      } else if (ev.t === 'arquivo_alterado') {
        alterou = true;
        this.avisarPreview(alvo, conv.id);
      } else if (ev.t === 'uso') {
        this.registrarUso(ev);
      }
      this.emitir({ tipo: 'evento', conversa: conv.id, ev });
    };

    // ponto de retorno escondido antes da IA mexer em qualquer coisa (botao "desfazer ultima mudanca")
    try {
      await this.antesDoTurno?.(alvo);
    } catch {
      /* sem git ou pasta ilegivel: a conversa segue sem ponto de retorno */
    }

    const turno = conv.motor === 'agy' ? rodarAgy(this.config, opcoes, aoEvento) : rodarClaude(this.config, opcoes, aoEvento);
    this.rodando.set(conv.id, [turno]);
    let falhou = false;
    let pendentePermissao = false;
    try {
      const r = await turno.terminou;
      falhou = !!r.erro;
      pendentePermissao = r.blocos.some((b) => b.tipo === 'permissao');
      if (r.blocos.length) this.repo.salvarMensagem(conv.id, 'ia', r.blocos);
      else if (r.parado) this.repo.salvarMensagem(conv.id, 'ia', [{ tipo: 'texto', texto: '(parado)' }]);
      if (r.sessao) this.repo.atualizarConversa(conv.id, conv.motor === 'agy' ? { sessao_agy: r.sessao } : { sessao_claude: r.sessao });
    } catch (e) {
      falhou = true;
      this.repo.salvarMensagem(conv.id, 'ia', [{ tipo: 'erro', texto: (e as Error).message }]);
    } finally {
      // arquivos mexidos por comando (Bash) nao geram evento: confere pela pasta
      try {
        if (!alterou && (await this.depoisDoTurno?.(alvo))) alterou = true;
      } catch {
        /* acessorio */
      }
      if (alterou) this.avisarPreview(alvo, conv.id, true);
      this.rodando.delete(conv.id);
      this.repo.tocarConversa(conv.id);
      this.emitir({ tipo: 'mensagens', conversa: conv.id });
      this.emitir({ tipo: 'conversa', conversa: this.repo.obterConversa(conv.id)! });
      this.emitir({ tipo: 'fim', conversa: conv.id, erro: falhou });
    }
    return { falhou, pendentePermissao };
  }

  // ---------- duelo ----------
  // A ultima mensagem da conversa e um duelo ainda sem escolha?
  private duelaSemEscolha(conversa: number): boolean {
    const msgs = this.repo.listarMensagens(conversa);
    const ultima = msgs[msgs.length - 1];
    if (!ultima || ultima.papel !== 'ia' || !Array.isArray(ultima.conteudo)) return false;
    const d = (ultima.conteudo as Bloco[]).find((b) => b.tipo === 'duelo');
    return !!d && d.tipo === 'duelo' && d.escolhida === null;
  }

  private pastaLado(conversa: number, lado: 0 | 1): string {
    return join(caminhosDados(this.config).duelo, String(conversa), LADOS[lado].pasta);
  }

  private async rodarDuelo(conv: Conversa, mensagem: string, restrito: boolean, anexos: Anexo[]): Promise<ResultadoRodada> {
    void anexos;
    const alvo = this.alvoDe(conv);
    const contexto = this.repo.lerConfig(`duelo_ctx:${conv.id}`);
    if (contexto) {
      this.repo.apagarConfig(`duelo_ctx:${conv.id}`);
      mensagem = `${contexto}\n\n${mensagem}`;
    }
    const pedidoOriginal = mensagem;

    // cada lado trabalha numa copia dos arquivos de agora
    let base = '';
    const pastas = [this.pastaLado(conv.id, 0), this.pastaLado(conv.id, 1)];
    let erroPreparo: string | undefined;
    try {
      if (!this.copias) throw new Error('as cópias do duelo não estão disponíveis');
      base = await this.copias.instantaneo(alvo);
      await Promise.all(pastas.map((p) => this.copias!.extrair(alvo, base, p)));
    } catch (e) {
      erroPreparo = (e as Error).message;
    }
    if (erroPreparo) {
      this.repo.salvarMensagem(conv.id, 'ia', [{ tipo: 'erro', texto: `não consegui preparar as cópias do duelo: ${erroPreparo}` }]);
      this.emitir({ tipo: 'mensagens', conversa: conv.id });
      this.emitir({ tipo: 'fim', conversa: conv.id, erro: true });
      return { falhou: true, pendentePermissao: false };
    }

    const modeloClaude = conv.motor === 'claude' && conv.modelo ? conv.modelo : escolherModeloAuto({ texto: mensagem, anexos: anexos.length, temProjeto: !!conv.projetoId, cotaPct: this.guardiao.cincoHoras() });
    const modeloAgy = conv.motor === 'agy' ? conv.modelo : null;
    const modelos: (string | null)[] = [modeloClaude, modeloAgy];
    const lados: LadoDuelo[] = LADOS.map((l, i) => ({ motor: l.motor, modelo: modelos[i] ?? null, nome: l.motor === 'claude' ? 'Claude' : 'Gemini', blocos: [], mudancas: [] }));

    const turnos: TurnoEmAndamento[] = [];
    const rodadas = LADOS.map(async (l, i) => {
      const lado = i as 0 | 1;
      const chaveSessao = `duelo:${conv.id}:${l.motor}`;
      const o = this.opcoesDoTurno(conv, { mensagem, cwd: pastas[i], restrito, liberadas: [], motor: l.motor, modelo: modelos[i], sessao: this.repo.lerConfig(chaveSessao) ?? null });
      const aoEvento = (ev: Evento) => {
        if (ev.t === 'sessao') this.repo.gravarConfig(chaveSessao, ev.id);
        else if (ev.t === 'uso') this.registrarUso(ev);
        else if (ev.t === 'progresso' || ev.t === 'arquivo_alterado') return; // cada lado mexe so na propria copia
        this.emitir({ tipo: 'evento', conversa: conv.id, ev, lado });
      };
      const turno = l.motor === 'agy' ? rodarAgy(this.config, o, aoEvento) : rodarClaude(this.config, o, aoEvento);
      turnos.push(turno);
      try {
        const r = await turno.terminou;
        lados[i].blocos = r.blocos.length ? r.blocos : r.parado ? [{ tipo: 'texto', texto: '(parado)' }] : [];
        lados[i].falhou = !!r.erro;
        if (r.sessao) this.repo.gravarConfig(chaveSessao, r.sessao);
      } catch (e) {
        lados[i].blocos = [{ tipo: 'erro', texto: (e as Error).message }];
        lados[i].falhou = true;
      }
    });
    this.rodando.set(conv.id, turnos);
    try {
      await Promise.all(rodadas);
      for (let i = 0; i < 2; i++) {
        try {
          lados[i].mudancas = (await this.copias!.mudancas(alvo, base, pastas[i])).map((m) => `${m.estado} ${m.caminho}`);
        } catch {
          lados[i].mudancas = [];
        }
      }
      this.repo.salvarMensagem(conv.id, 'ia', [{ tipo: 'duelo', id: randomBytes(4).toString('hex'), base, lados, escolhida: null }]);
      this.repo.gravarConfig(`duelo_pedido:${conv.id}`, pedidoOriginal.slice(0, 2000));
    } finally {
      this.rodando.delete(conv.id);
      this.repo.tocarConversa(conv.id);
      this.emitir({ tipo: 'mensagens', conversa: conv.id });
      this.emitir({ tipo: 'conversa', conversa: this.repo.obterConversa(conv.id)! });
      this.emitir({ tipo: 'fim', conversa: conv.id, erro: lados.every((l) => l.falhou) });
    }
    return { falhou: lados.every((l) => l.falhou), pendentePermissao: false };
  }

  // "usar essa": a resposta escolhida passa a ser a oficial e as mudancas dela vao pro projeto
  async escolherDuelo(d: { conversa: number; mensagem: number; lado: 0 | 1 | -1 }): Promise<{ aplicados: number; aviso: string }> {
    const conv = this.repo.obterConversa(d.conversa);
    const msg = this.repo.obterMensagem(d.mensagem);
    if (!conv || !msg || msg.conversaId !== conv.id || !Array.isArray(msg.conteudo)) throw new Error('duelo não encontrado');
    if (this.rodando.has(conv.id)) throw new Error('essa conversa ainda está respondendo');
    const blocos = msg.conteudo as Bloco[];
    const bloco = blocos.find((b) => b.tipo === 'duelo');
    if (!bloco || bloco.tipo !== 'duelo') throw new Error('duelo não encontrado');
    if (bloco.escolhida !== null) throw new Error('esse duelo já foi decidido');
    if (![0, 1, -1].includes(d.lado)) throw new Error('lado inválido');

    let aplicados = 0;
    let aviso = 'nenhuma resposta escolhida; nada foi pro projeto';
    if (d.lado !== -1) {
      const lado = bloco.lados[d.lado];
      const pasta = this.pastaLado(conv.id, d.lado);
      if (lado.mudancas.length === 0) {
        aviso = 'sem mudanças em arquivos';
      } else if (!existsSync(pasta) || !this.copias) {
        aviso = 'não achei mais a cópia dessa resposta; os arquivos não foram pro projeto';
      } else {
        aplicados = await this.copias.aplicar(this.alvoDe(conv), bloco.base, pasta);
        aviso = `${aplicados} arquivo${aplicados === 1 ? '' : 's'} ${aplicados === 1 ? 'foi' : 'foram'} pro projeto (dá pra desfazer)`;
      }
      // a conversa segue com o motor e o modelo que ganharam
      if (lado.modelo && (lado.motor !== conv.motor || lado.modelo !== conv.modelo)) this.repo.atualizarConversa(conv.id, { motor: lado.motor, modelo: lado.modelo, modelo_auto: 0 });
      // a sessao do motor que ganhou nao conhece esta rodada: ela entra como contexto da proxima mensagem
      const pedido = this.repo.lerConfig(`duelo_pedido:${conv.id}`) ?? '';
      const resposta = lado.blocos
        .filter((b): b is Extract<Bloco, { tipo: 'texto' }> => b.tipo === 'texto')
        .map((b) => b.texto)
        .join('\n')
        .slice(0, 4000);
      this.repo.gravarConfig(`duelo_ctx:${conv.id}`, `[Contexto do HRZZ: na rodada anterior, em duelo, eu pedi: "${pedido.slice(0, 1200)}". Escolhi a resposta d${lado.motor === 'claude' ? 'o Claude' : 'o Gemini'}:\n${resposta}]`);
    }
    bloco.escolhida = d.lado;
    bloco.aviso = aviso;
    this.repo.atualizarMensagem(msg.id, blocos);
    this.emitir({ tipo: 'mensagens', conversa: conv.id });
    this.emitir({ tipo: 'conversa', conversa: this.repo.obterConversa(conv.id)! });
    if (aplicados > 0) this.emitir({ tipo: 'preview_atualizado', chave: this.alvoDe(conv).chave, motivo: 'ia', conversa: conv.id });
    return { aplicados, aviso };
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
