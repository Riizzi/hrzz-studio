// Tudo que muda de uma maquina pra outra sai daqui (variaveis de ambiente com padrao).
// Nenhum caminho fixo do Windows no resto do codigo.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));

function numero(valor: string | undefined, padrao: number): number {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : padrao;
}

export function lerConfig(env: NodeJS.ProcessEnv = process.env) {
  // src/ ou dist/ ficam dois niveis abaixo de apps/servidor, que fica dois abaixo da raiz
  const raiz = resolve(env.HRZZ_RAIZ ?? join(aqui, '..', '..', '..'));
  const dados = resolve(env.HRZZ_DADOS ?? join(raiz, 'dados'));
  return {
    // o servidor so escuta em loopback; o acesso de fora passa por Tailscale ou Cloudflare
    host: '127.0.0.1',
    porta: numero(env.HRZZ_PORTA, 7000),
    raiz,
    dados,
    web: resolve(env.HRZZ_WEB ?? join(raiz, 'apps', 'web', 'dist')),
    // programas externos: nome no PATH ou caminho completo
    claudeBin: env.HRZZ_CLAUDE ?? 'claude',
    agyBin: env.HRZZ_AGY ?? 'agy',
    // pasta onde procurar o agy se ele nao estiver no PATH (padrao do Illuminati)
    agyPastaExtra: env.HRZZ_AGY_PASTA ?? (env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'agy', 'bin') : undefined),
    // dias que o PIN fica lembrado em cada aparelho
    diasPin: 30,
    // se verdadeiro, o claude sobe com --restricted (acesso vindo da Cloudflare)
    // (o servidor tambem liga isso sozinho quando ve o cabecalho da Cloudflare Access)
  };
}

export type Config = ReturnType<typeof lerConfig>;

export function caminhosDados(config: Config) {
  return {
    banco: join(config.dados, 'hrzz.db'),
    memoria: join(config.dados, 'memoria'),
    anexos: join(config.dados, 'anexos'),
    segredos: join(config.dados, 'segredos'),
    logs: join(config.dados, 'logs'),
  };
}
