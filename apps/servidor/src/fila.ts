// Fila em segundo plano e agendamentos (docs/01-arquitetura.md): um executor simples, uma tarefa por vez.
// Cada tarefa vira uma conversa de verdade (aparece na barra lateral). Agendamentos usam cron de 5 campos (croner).
import { Cron } from 'croner';
import type { Orquestrador, Saida } from './orquestrador.js';
import type { Agendamento, Repo, Tarefa } from './repo.js';

// valida um cron de 5 campos (minuto hora dia mes dia-da-semana) e devolve a proxima execucao
export function proximaExecucao(cron: string, de: Date = new Date()): Date | null {
  const c = new Cron(cron, { paused: true });
  const prox = c.nextRun(de);
  c.stop();
  return prox;
}

export function validarCron(cron: string): string | null {
  const campos = cron.trim().split(/\s+/);
  if (campos.length !== 5) return 'use 5 campos: minuto hora dia mês dia-da-semana (ex.: 0 8 * * 1-5)';
  try {
    const prox = proximaExecucao(cron);
    if (!prox) return 'esse horário nunca acontece';
  } catch (e) {
    return `horário inválido: ${(e as Error).message}`;
  }
  return null;
}

export class Fila {
  private ocupado = false;
  private atual: { tarefa: number; conversa: number | null; cancelada: boolean } | null = null;
  private jobs = new Map<number, Cron>();
  private ligada = false;

  constructor(
    private repo: Repo,
    private orq: Orquestrador,
    private emitir: (s: Saida) => void,
  ) {}

  iniciar(): void {
    this.ligada = true;
    // uma tarefa que ficou "rodando" porque o servidor caiu volta pra fila
    this.repo.recolocarTarefasInterrompidas();
    for (const a of this.repo.listarAgendamentos()) if (a.ligado) this.armar(a);
    void this.andar();
  }

  parar(): void {
    this.ligada = false;
    for (const j of this.jobs.values()) j.stop();
    this.jobs.clear();
  }

  // ---------- tarefas ----------
  adicionar(d: { titulo: string; pedido: string; projetoId?: number | null; modelo?: string | null; modo?: Tarefa['modo']; origem?: 'voce' | 'agenda'; agendamentoId?: number | null }): Tarefa {
    const t = this.repo.criarTarefa(d);
    this.emitir({ tipo: 'fila' });
    void this.andar();
    return t;
  }

  cancelar(id: number): boolean {
    const t = this.repo.obterTarefa(id);
    if (!t) return false;
    if (t.estado === 'fila') {
      this.repo.mudarTarefa(id, { estado: 'cancelada', terminou: true });
    } else if (t.estado === 'rodando' && this.atual?.tarefa === id) {
      this.atual.cancelada = true;
      if (this.atual.conversa) this.orq.parar(this.atual.conversa);
    } else {
      return false;
    }
    this.emitir({ tipo: 'fila' });
    return true;
  }

  private async andar(): Promise<void> {
    if (!this.ligada || this.ocupado) return;
    const t = this.repo.proximaTarefa();
    if (!t) return;
    this.ocupado = true;
    try {
      await this.executar(t);
    } finally {
      this.ocupado = false;
      this.atual = null;
      this.emitir({ tipo: 'fila' });
    }
    void this.andar();
  }

  private async executar(t: Tarefa): Promise<void> {
    this.atual = { tarefa: t.id, conversa: null, cancelada: false };
    this.repo.mudarTarefa(t.id, { estado: 'rodando', iniciou: true });
    this.emitir({ tipo: 'fila' });
    try {
      const r = await this.orq.enviarEEsperar(
        { projeto: t.projetoId, texto: t.pedido, modelo: t.modelo ?? 'auto', modo: t.modo },
        (conversa) => {
          if (this.atual) this.atual.conversa = conversa;
          this.repo.mudarTarefa(t.id, { conversa_id: conversa });
          // o titulo da conversa e o da tarefa
          this.repo.atualizarConversa(conversa, { titulo: t.titulo.slice(0, 120) });
          this.emitir({ tipo: 'fila' });
        },
      );
      if (this.atual?.cancelada) this.repo.mudarTarefa(t.id, { estado: 'cancelada', terminou: true });
      else if (r.falhou) this.repo.mudarTarefa(t.id, { estado: 'erro', erro: 'a conversa terminou com erro: abra pra ver', terminou: true });
      else if (r.pendentePermissao) this.repo.mudarTarefa(t.id, { estado: 'pronta', erro: 'ficou esperando a sua permissão: abra a conversa', terminou: true });
      else this.repo.mudarTarefa(t.id, { estado: 'pronta', terminou: true });
    } catch (e) {
      this.repo.mudarTarefa(t.id, { estado: this.atual?.cancelada ? 'cancelada' : 'erro', erro: (e as Error).message, terminou: true });
    }
  }

  // ---------- agendamentos ----------
  private armar(a: Agendamento): void {
    this.desarmar(a.id);
    if (!this.ligada || !a.ligado) return;
    try {
      this.jobs.set(
        a.id,
        new Cron(a.cron, { protect: true }, () => {
          this.disparar(a.id);
        }),
      );
    } catch {
      /* cron invalido gravado por fora: fica parado */
    }
  }

  private desarmar(id: number): void {
    this.jobs.get(id)?.stop();
    this.jobs.delete(id);
  }

  // chamado pelo cron (ou pelo botao "rodar agora"); nao empilha se a rodada anterior ainda nao acabou
  disparar(id: number): Tarefa | null {
    const a = this.repo.obterAgendamento(id);
    if (!a) return null;
    if (this.repo.listarTarefas(0).some((t) => t.agendamentoId === a.id)) return null;
    this.repo.mudarAgendamento(a.id, { ultimo: true });
    return this.adicionar({ titulo: a.titulo, pedido: a.pedido, projetoId: a.projetoId, modelo: a.modelo, modo: a.modo, origem: 'agenda', agendamentoId: a.id });
  }

  agendar(d: { titulo: string; pedido: string; projetoId?: number | null; cron: string; modelo?: string | null; modo?: Tarefa['modo'] }): Agendamento {
    const a = this.repo.criarAgendamento(d);
    this.armar(a);
    return a;
  }

  mudarAgendamento(id: number, campos: Parameters<Repo['mudarAgendamento']>[1]): Agendamento | undefined {
    this.repo.mudarAgendamento(id, campos);
    const a = this.repo.obterAgendamento(id);
    if (a) this.armar(a);
    return a;
  }

  apagarAgendamento(id: number): void {
    this.desarmar(id);
    this.repo.apagarAgendamento(id);
  }

  proxima(a: Agendamento): number | null {
    if (!a.ligado) return null;
    try {
      return proximaExecucao(a.cron)?.getTime() ?? null;
    } catch {
      return null;
    }
  }
}
