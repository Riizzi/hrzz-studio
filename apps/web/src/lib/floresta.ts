// Cenas ASCII da floresta e dos pinheirinhos. Portado de docs/prototipo.html.
// Os desenhos ficam em arrays de strings comuns (nao use String.raw com linha
// terminando em barra invertida: ver docs/03-design.md).

export const PINHEIROS: Record<string, string[]> = {
  classico: ['   ^', '  /|\\', ' //|\\\\', '///|\\\\\\', '   |'],
  largo: ['    ^', '  //|\\\\', ' ///|\\\\\\', '////|\\\\\\\\', '    |'],
  fino: [' ^', '/|\\', '/|\\', '/|\\', ' |', ' |'],
  torto: ['  ^', ' /|\\', '//|\\\\', ' //|\\\\', ' ///|\\\\', '    |'],
  ponta: ['  ^', ' /|\\', '//|\\\\', '  |', '  |', '  |'],
  redondo: ['  .-.', ' (   )', '(     )', " '-|-'", '   |'],
  alto: ['   ^', '  /|\\', ' //|\\\\', '  /|\\', ' //|\\\\', '///|\\\\\\', '   |'],
  p1: [' ^', '/|\\', ' |'],
  p2: [' ^', '/^\\', '/|\\'],
  p3: ['^', '|'],
  p4: ['  ^', ' /|\\', '//|\\\\'],
  p5: [' .', '(_)', ' |'],
};

// gerador pseudoaleatorio com semente fixa: a cena nao muda a cada abertura
export function rng(semente: number): () => number {
  let s = semente >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function cena(
  largura: number,
  linhas: number,
  nomes: string[],
  gmin: number,
  gmax: number,
  semente: number,
  extras: boolean,
): string[] {
  const r = rng(semente);
  const g: string[][] = Array.from({ length: linhas }, () => Array<string>(largura).fill(' '));
  const chao = linhas - 1;
  for (let x = 0; x < largura; x++) g[chao][x] = r() < 0.82 ? '_' : r() < 0.5 ? ',' : '.';
  let x = Math.floor(r() * 3);
  while (x < largura - 2) {
    if (extras && r() < 0.09) {
      const w = 6 + Math.floor(r() * 6);
      if (r() < 0.6) {
        // lago, e as vezes um peixe
        for (let k = 0; k < w && x + k < largura; k++) g[chao][x + k] = k % 3 === 1 ? ' ' : '~';
        if (r() < 0.5 && x + 2 < largura) g[chao - 1][x + 2] = r() < 0.5 ? '>' : '<';
      } else {
        // pedras
        for (let k = 0; k < w && x + k < largura; k++) g[chao][x + k] = '_';
        if (x + 1 < largura) g[chao - 1][x + 1] = 'o';
        if (x + 4 < largura) g[chao - 1][x + 4] = 'O';
      }
      x += w + 2;
      continue;
    }
    const arvore = PINHEIROS[nomes[Math.floor(r() * nomes.length)]];
    const h = arvore.length;
    const w = Math.max(...arvore.map((l) => l.length));
    if (h > chao || x + w > largura) {
      x += 1;
      continue;
    }
    arvore.forEach((l, i) => {
      const linha = chao - h + i;
      [...l].forEach((c, j) => {
        if (c !== ' ') g[linha][x + j] = c;
      });
    });
    x += w + gmin + Math.floor(r() * (gmax - gmin + 1));
  }
  return g.map((l) => l.join(''));
}

// a faixa e duplicada na horizontal: o CSS anda 50% e recomeca sem emenda
export function faixaDuplicada(linhas: string[]): string {
  return linhas.map((l) => l + l).join('\n');
}

export const CAMADAS_FLORESTA = [
  { id: 'fundo', linhas: 5, largura: 220, nomes: ['p1', 'p2', 'p3', 'p4', 'p5'], gmin: 0, gmax: 3, semente: 7, extras: false, segundos: 520, opacidade: 0.045, bottom: 30 },
  { id: 'meio', linhas: 7, largura: 200, nomes: ['classico', 'fino', 'ponta', 'redondo', 'p4', 'torto', 'p2'], gmin: 1, gmax: 5, semente: 19, extras: false, segundos: 300, opacidade: 0.07, bottom: 12 },
  { id: 'frente', linhas: 8, largura: 180, nomes: ['classico', 'largo', 'fino', 'torto', 'ponta', 'redondo', 'alto'], gmin: 2, gmax: 8, semente: 31, extras: true, segundos: 170, opacidade: 0.1, bottom: 0 },
] as const;

const NOMES_PINHOS = ['classico', 'fino', 'torto', 'ponta', 'redondo', 'p4', 'p1', 'largo', 'alto'];

export function pinhosDeCanto(largura: number, linhas: number, semente: number): string {
  return cena(largura, linhas, NOMES_PINHOS, 0, 2, semente, false).join('\n');
}
