// Backup local do HRZZ (etapa 7): todo dia as 03:00, e quando o Joao clica em "fazer backup agora".
// Cada backup e uma pasta em dados/backups/hrzz-AAAAMMDD-HHMMSS com:
//   hrzz.db (copia segura do SQLite com VACUUM INTO, nunca o arquivo aberto), memoria/, skills/, comandos/
//   e os textos das transcricoes (.txt, .srt, .json). Fica de fora: segredos (PIN, tokens), anexos, audios,
//   logs, capturas e copias do duelo. Guarda os ultimos 14.
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Cron } from 'croner';
import { caminhosDados, type Config } from './config.js';
import { copiarBanco, type Banco } from './db.js';

export const MANTER = 14;
export const CRON_PADRAO = '0 3 * * *';
const NOME = /^hrzz-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(-\d+)?$/;
const EXTENSOES_TRANSCRICAO = new Set(['.txt', '.srt', '.json']);

export type InfoBackup = { nome: string; criado: string; tamanho: number; arquivos: number };

function dois(n: number): string {
  return String(n).padStart(2, '0');
}

export function nomeDoBackup(d: Date): string {
  return `hrzz-${d.getFullYear()}${dois(d.getMonth() + 1)}${dois(d.getDate())}-${dois(d.getHours())}${dois(d.getMinutes())}${dois(d.getSeconds())}`;
}

// a data do backup vem do nome da pasta (hora local); copiar a pasta por fora nao muda isso
export function dataDoNome(nome: string): Date | null {
  const m = NOME.exec(nome);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
}

function medir(pasta: string): { tamanho: number; arquivos: number } {
  let tamanho = 0;
  let arquivos = 0;
  for (const e of readdirSync(pasta, { withFileTypes: true })) {
    const caminho = join(pasta, e.name);
    if (e.isDirectory()) {
      const r = medir(caminho);
      tamanho += r.tamanho;
      arquivos += r.arquivos;
    } else if (e.isFile()) {
      tamanho += statSync(caminho).size;
      arquivos++;
    }
  }
  return { tamanho, arquivos };
}

export class Backups {
  readonly pasta: string;
  fazendo = false;
  private cron: Cron | null = null;
  private recuperacao: NodeJS.Timeout | null = null;
  private dados: ReturnType<typeof caminhosDados>;

  constructor(
    config: Config,
    private db: Banco,
    private opcoes: { manter?: number; cron?: string } = {},
  ) {
    this.dados = caminhosDados(config);
    this.pasta = join(config.dados, 'backups');
  }

  get manter(): number {
    return this.opcoes.manter ?? MANTER;
  }

  get expressao(): string {
    return this.opcoes.cron ?? CRON_PADRAO;
  }

  // mais novo primeiro
  listar(): InfoBackup[] {
    if (!existsSync(this.pasta)) return [];
    const itens: InfoBackup[] = [];
    for (const e of readdirSync(this.pasta, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const data = dataDoNome(e.name);
      if (!data) continue;
      try {
        itens.push({ nome: e.name, criado: data.toISOString(), ...medir(join(this.pasta, e.name)) });
      } catch {
        /* pasta sumiu no meio: ignora */
      }
    }
    return itens.sort((a, b) => (a.nome < b.nome ? 1 : -1));
  }

  proximo(): string | null {
    const c = new Cron(this.expressao, { paused: true });
    const d = c.nextRun();
    c.stop();
    return d ? d.toISOString() : null;
  }

  async fazer(agora: Date = new Date()): Promise<InfoBackup> {
    if (this.fazendo) throw new Error('já tem um backup rodando');
    this.fazendo = true;
    try {
      mkdirSync(this.pasta, { recursive: true });
      this.limparIncompletos();
      let nome = nomeDoBackup(agora);
      for (let n = 2; existsSync(join(this.pasta, nome)); n++) nome = `${nomeDoBackup(agora)}-${n}`;
      // monta numa pasta provisoria e so renomeia no fim: backup pela metade nunca aparece na lista
      const provisoria = join(this.pasta, `.incompleto-${nome}`);
      rmSync(provisoria, { recursive: true, force: true });
      mkdirSync(provisoria, { recursive: true });
      try {
        copiarBanco(this.db, join(provisoria, 'hrzz.db'));
        for (const [origem, destino] of [
          [this.dados.memoria, 'memoria'],
          [this.dados.skills, 'skills'],
          [this.dados.comandos, 'comandos'],
        ] as const) {
          if (existsSync(origem)) cpSync(origem, join(provisoria, destino), { recursive: true });
        }
        if (existsSync(this.dados.transcricoes)) {
          cpSync(this.dados.transcricoes, join(provisoria, 'transcricoes'), {
            recursive: true,
            filter: (origem) => {
              try {
                return statSync(origem).isDirectory() || EXTENSOES_TRANSCRICAO.has(origem.slice(origem.lastIndexOf('.')).toLowerCase());
              } catch {
                return false;
              }
            },
          });
        }
        renameSync(provisoria, join(this.pasta, nome));
      } catch (e) {
        rmSync(provisoria, { recursive: true, force: true });
        throw e;
      }
      this.apararAntigos();
      return { nome, criado: agora.toISOString(), ...medir(join(this.pasta, nome)) };
    } finally {
      this.fazendo = false;
    }
  }

  private limparIncompletos(): void {
    for (const e of readdirSync(this.pasta, { withFileTypes: true })) {
      if (e.isDirectory() && e.name.startsWith('.incompleto-')) rmSync(join(this.pasta, e.name), { recursive: true, force: true });
    }
  }

  private apararAntigos(): void {
    for (const velho of this.listar().slice(this.manter)) rmSync(join(this.pasta, velho.nome), { recursive: true, force: true });
  }

  // 03:00 todo dia. Se o PC estava desligado e ja faz mais de 24 h do ultimo backup, faz um logo depois de ligar.
  iniciar(opcoes: { recuperar?: boolean } = {}): void {
    this.parar();
    this.cron = new Cron(this.expressao, { protect: true }, () => {
      this.fazer().catch((e) => console.error('backup diario falhou:', (e as Error).message));
    });
    if (opcoes.recuperar === false) return;
    const ultimo = this.listar()[0];
    const faz = ultimo ? Date.now() - new Date(ultimo.criado).getTime() : Infinity;
    if (faz > 24 * 3600 * 1000) {
      this.recuperacao = setTimeout(() => {
        this.fazer().catch((e) => console.error('backup de recuperacao falhou:', (e as Error).message));
      }, 2 * 60 * 1000);
      this.recuperacao.unref();
    }
  }

  parar(): void {
    this.cron?.stop();
    this.cron = null;
    if (this.recuperacao) clearTimeout(this.recuperacao);
    this.recuperacao = null;
  }
}
