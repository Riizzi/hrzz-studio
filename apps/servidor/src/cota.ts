// Guardiao de cota (docs/02-ias.md): guarda o ultimo uso da assinatura do Claude que o proprio `claude` informou
// (evento rate_limit_event), avisa a partir de 80% e, se o Joao pedir, troca pro Haiku ate a janela renovar.
import type { Repo } from './repo.js';

export type UsoClaude = { cincoHoras?: number; seteDias?: number; renovaEm?: number; estado?: string; em: number };

export type EstadoCota = {
  cincoHoras?: number;
  seteDias?: number;
  renovaEm?: number; // epoch em segundos
  estado?: string;
  nivel: 'sem-dado' | 'ok' | 'alto' | 'limite';
  haikuAte?: number; // epoch em segundos: ate quando o Haiku esta forcado
};

export const LIMITE_AVISO = 80;
const CINCO_HORAS_S = 5 * 3600;
const CHAVE_USO = 'cota:uso_claude';
const CHAVE_HAIKU = 'cota:haiku_ate';

export class Guardiao {
  private uso: UsoClaude | null = null;

  constructor(
    private repo: Repo,
    private agora: () => number = () => Date.now(),
  ) {
    try {
      const salvo = repo.lerConfig(CHAVE_USO);
      if (salvo) this.uso = JSON.parse(salvo) as UsoClaude;
    } catch {
      /* uso salvo ilegivel: comeca sem dado */
    }
  }

  registrar(u: Omit<UsoClaude, 'em'>): void {
    // um evento sem porcentagem nao apaga o que ja se sabe
    const anterior = this.uso;
    // um horario de renovacao que ja passou nao serve (relogio estranho): vale a janela de 6 h a partir de agora
    const renova = u.renovaEm && u.renovaEm * 1000 > this.agora() ? u.renovaEm : undefined;
    this.uso = {
      cincoHoras: u.cincoHoras ?? anterior?.cincoHoras,
      seteDias: u.seteDias ?? anterior?.seteDias,
      renovaEm: renova ?? (u.renovaEm ? undefined : anterior?.renovaEm),
      estado: u.estado ?? anterior?.estado,
      em: this.agora(),
    };
    this.repo.gravarConfig(CHAVE_USO, JSON.stringify(this.uso));
  }

  // porcentagem da janela de 5 h, se o dado ainda vale (some quando a janela renova)
  cincoHoras(): number | undefined {
    const u = this.vivo();
    return u?.cincoHoras;
  }

  private vivo(): UsoClaude | null {
    const u = this.uso;
    if (!u) return null;
    if (u.renovaEm && this.agora() > u.renovaEm * 1000) return null; // a janela renovou
    if (!u.renovaEm && this.agora() - u.em > 6 * 3600 * 1000) return null;
    return u;
  }

  haikuAte(): number | undefined {
    const v = Number(this.repo.lerConfig(CHAVE_HAIKU));
    if (!Number.isFinite(v) || v <= 0) return undefined;
    if (this.agora() / 1000 >= v) {
      this.repo.apagarConfig(CHAVE_HAIKU);
      return undefined;
    }
    return v;
  }

  haikuAtivo(): boolean {
    return this.haikuAte() !== undefined;
  }

  // "usar o Haiku ate renovar": vale ate o fim da janela de 5 h (ou 5 h a partir de agora, se nao se sabe)
  ligarHaiku(): number {
    const renova = this.vivo()?.renovaEm;
    const ate = renova && renova * 1000 > this.agora() ? renova : Math.floor(this.agora() / 1000) + CINCO_HORAS_S;
    this.repo.gravarConfig(CHAVE_HAIKU, String(ate));
    return ate;
  }

  desligarHaiku(): void {
    this.repo.apagarConfig(CHAVE_HAIKU);
  }

  estado(): EstadoCota {
    const u = this.vivo();
    const pct = u?.cincoHoras;
    let nivel: EstadoCota['nivel'] = 'sem-dado';
    if (pct !== undefined) nivel = pct >= 100 || u?.estado === 'rejected' ? 'limite' : pct >= LIMITE_AVISO ? 'alto' : 'ok';
    return { cincoHoras: pct, seteDias: u?.seteDias, renovaEm: u?.renovaEm, estado: u?.estado, nivel, haikuAte: this.haikuAte() };
  }
}
