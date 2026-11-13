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
  return {
    // o servidor so escuta em loopback; o acesso de fora passa por Tailscale ou Cloudflare
    host: '127.0.0.1',
    porta: numero(env.HRZZ_PORTA, 7000),
    raiz,
    dados: resolve(env.HRZZ_DADOS ?? join(raiz, 'dados')),
    web: resolve(env.HRZZ_WEB ?? join(raiz, 'apps', 'web', 'dist')),
  };
}

export type Config = ReturnType<typeof lerConfig>;
