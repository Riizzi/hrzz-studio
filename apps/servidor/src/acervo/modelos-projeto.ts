// Modelos de projeto: uma pasta nova com o CLAUDE.md do tipo de trabalho (o claude le esse arquivo sozinho
// ao rodar na pasta) e um pedido inicial pra o Joao completar e enviar. Nada e instalado nem rodado na criacao.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type ModeloProjeto = {
  id: string;
  nome: string;
  descricao: string;
  arquivos: Record<string, string>;
  pedido: string;
};

const SITE_LOJA_CLAUDE = `# Site de loja (Astro)

Projeto de site para uma loja física pequena, em português do Brasil.

## Como trabalhar
- Use a skill sites-de-loja quando estiver disponível.
- Stack: Astro, CSS puro, sem framework de CSS, sem biblioteca de componentes. Páginas estáticas e rápidas.
- Antes de criar, confirme o que falta: nome da loja, produtos ou serviços, endereço, horário, telefone e WhatsApp, redes sociais, cores e logo.
- Celular primeiro: alvos de toque de pelo menos 44 px, nada vazando pelas laterais em 360 px.
- Texto simples, sem linguagem promocional exagerada.
- Imagens otimizadas e com texto alternativo.
- Para ver o resultado: \`npm run dev\` (o HRZZ detecta a porta e mostra no preview).

## Estrutura esperada
- src/pages: uma página por arquivo (início, produtos, contato).
- src/components: cabeçalho, rodapé, cartão de produto.
- src/styles/global.css: cores e tamanhos em variáveis CSS.
- public: logo, fotos e favicon.
`;

const RETRO_LEDGER_CLAUDE = `# App no estilo Retro Ledger

App com a identidade visual do HRZZ STUDIO: retrô, só no modo escuro, ícones de linha fina e sombra sólida de 1 px.

## Identidade
- Cores: fundo #1C1917, caixas #24201C, caixas altas #2A2521, texto #E8DFD1, texto secundário #A8A29E, apagado #78716C, bordas #3A332C, âmbar de destaque #D9B26F (fundo #3B3122), verde #7FA8A0.
- Fontes: Plus Jakarta Sans (texto, 13 px) e Space Mono (rótulos pequenos, abas, código).
- Cantos de 9 px nas caixas, 6 a 7 px em botões e campos. Sombra sólida: 1px 1px 0 #0C0A09.
- Botões de ícone de 26x26 px, ícones Tabler de linha fina.
- Textos curtos, em minúsculas nos rótulos, sem linguagem promocional.

## Como trabalhar
- Stack padrão: Vite + React + TypeScript, um arquivo de CSS por componente, variáveis CSS para as cores. Se o pedido pedir outra coisa, siga o pedido.
- Celular primeiro: nada vaza pelas laterais em 360, 420, 620, 760, 960 e 1280 px (use min-width: 0 em filhos de flex e grid).
- Para ver o resultado: \`npm run dev\` (o HRZZ detecta a porta e mostra no preview).
`;

const RELATORIO_CLAUDE = `# Relatório institucional

Documento formal em português do Brasil, para o contexto do serviço público.

## Como trabalhar
- Use a skill estilo-joao-pedro para o texto e a skill docx para gerar o arquivo .docx na pasta do projeto.
- Estrutura padrão: identificação (órgão, setor, data), objetivo, contexto, desenvolvimento por seções numeradas, conclusão e encaminhamentos.
- Linguagem institucional, objetiva e impessoal. Frases curtas. Sem adjetivos de propaganda.
- Não invente dados, números ou citações. Quando faltar informação, marque como [a confirmar] e liste no fim.
- Tabelas só quando comparam dados; cada tabela com título e fonte.
- Antes de gerar o arquivo, mostre o roteiro das seções e peça a confirmação.
`;

export const MODELOS_PROJETO: ModeloProjeto[] = [
  {
    id: 'site-loja',
    nome: 'site de loja (Astro)',
    descricao: 'site estático para loja física, celular primeiro, com a skill sites-de-loja',
    arquivos: { 'CLAUDE.md': SITE_LOJA_CLAUDE },
    pedido: 'Crie o site da loja [nome da loja], que vende [produtos ou serviços]. Endereço: [endereço]. WhatsApp: [número]. Cores: [cores ou "sugira"].',
  },
  {
    id: 'retro-ledger',
    nome: 'app Retro Ledger',
    descricao: 'app com a identidade do HRZZ: retrô, escuro, Space Mono e âmbar',
    arquivos: { 'CLAUDE.md': RETRO_LEDGER_CLAUDE },
    pedido: 'Crie um app que [o que ele faz], no estilo Retro Ledger. Telas: [lista de telas].',
  },
  {
    id: 'relatorio',
    nome: 'relatório institucional',
    descricao: 'documento .docx formal, com a skill estilo-joao-pedro e a skill docx',
    arquivos: { 'CLAUDE.md': RELATORIO_CLAUDE },
    pedido: 'Faça um relatório sobre [assunto], para [destinatário]. Material de apoio: [arquivos anexados ou pontos principais].',
  },
];

export function modeloPorId(id: string): ModeloProjeto | undefined {
  return MODELOS_PROJETO.find((m) => m.id === id);
}

// pasta nova: usa o nome pedido; se ja existir com conteudo, acrescenta -2, -3...
export function criarPastaDoModelo(raiz: string, slug: string, modelo: ModeloProjeto): string {
  let pasta = join(raiz, slug);
  for (let i = 2; existsSync(pasta) && readdirSync(pasta).length > 0; i++) pasta = join(raiz, `${slug}-${i}`);
  criarArquivosEm(pasta, modelo);
  return pasta;
}

export function criarArquivosEm(pasta: string, modelo: ModeloProjeto): void {
  mkdirSync(pasta, { recursive: true });
  for (const [nome, conteudo] of Object.entries(modelo.arquivos)) {
    const c = join(pasta, nome);
    mkdirSync(dirname(c), { recursive: true });
    writeFileSync(c, conteudo);
  }
}
