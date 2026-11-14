// Teste de qualidade da etapa 1 (comando /qualidade): roda 10 perguntas pelo servidor do HRZZ com o
// claude de verdade (assinatura do Joao) e grava as respostas em docs/qualidade.md, com um espaco
// pra ele colar a resposta do claude.ai. Usa uma pasta de dados temporaria. Gasta mensagens da assinatura:
// para sozinho se o uso da janela de 5 h passar de 75%.
//
// Uso: npm run qualidade            (modelo: sonnet, pra poupar a cota)
//      npm run qualidade -- opus    (outro modelo)
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { conversarPeloWs, subirServidorDeTeste } from './lib-teste.mjs';

const modelo = process.argv[2] ?? 'sonnet';
const LIMITE_USO = 75;

const servidor = await subirServidorDeTeste({ porta: 7093, claudeReal: true });
const h = { 'content-type': 'application/json', cookie: servidor.cabecalhoCookie };
const get = async (u) => (await fetch(servidor.url + u, { headers: h })).json();
const post = async (u, corpo) => (await fetch(servidor.url + u, { method: 'POST', headers: h, body: JSON.stringify(corpo) })).json();

// material de apoio: um projeto de site e um documento pra anexar
const material = mkdtempSync(join(tmpdir(), 'hrzz-qualidade-'));
const pastaSite = join(material, 'site-loja');
mkdirSync(pastaSite);
writeFileSync(
  join(pastaSite, 'index.html'),
  '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Loja Brisa</title><style>.comprar{background:#c26d5c;color:#fff;border:0;padding:6px 10px;border-radius:4px}</style></head><body><h1>Loja Brisa</h1><p>Camisetas de algodão orgânico.</p><button class="comprar">Comprar</button></body></html>',
);
const documento = join(material, 'relatorio-trimestral.txt');
writeFileSync(
  documento,
  `Relatório trimestral da Gerência de Projetos Digitais, 3º trimestre.

Neste trimestre a gerência concluiu 14 das 18 entregas planejadas (78%). As quatro entregas pendentes são: a migração do portal de transparência para o novo servidor (atrasada por falta de janela de manutenção), a integração com o sistema de protocolo (depende de contrato com o fornecedor, previsto para outubro), o painel de indicadores de atendimento (em homologação) e a revisão de acessibilidade do portal do servidor (iniciada em setembro).

O tempo médio de resposta aos chamados caiu de 3,2 dias para 2,1 dias, depois da criação da fila única de atendimento. A satisfação medida em pesquisa interna subiu de 3,8 para 4,3 (escala de 1 a 5), com 212 respostas.

Orçamento: dos R$ 480 mil previstos, R$ 391 mil foram executados (81%). A diferença se explica principalmente pelo atraso da contratação da integração com o protocolo, cujo empenho deve ser feito no quarto trimestre.

Riscos: (1) a equipe de desenvolvimento perdeu duas pessoas no trimestre e há uma vaga aberta; (2) o fornecedor de hospedagem avisou reajuste de 12% a partir de janeiro; (3) a revisão de acessibilidade encontrou 37 não conformidades, sendo 9 críticas.

Próximos passos: fechar a migração do portal de transparência em outubro, assinar o contrato do protocolo, abrir processo seletivo para a vaga de desenvolvedor e priorizar a correção das 9 não conformidades críticas até novembro.`,
);
// o anexo sobe pelo mesmo caminho da interface (/api/anexos), que o deixa na pasta liberada pro claude
const anexo = await (await fetch(servidor.url + '/api/anexos?nome=relatorio-trimestral.txt', { method: 'POST', headers: { cookie: servidor.cabecalhoCookie, 'content-type': 'application/octet-stream' }, body: readFileSync(documento) })).json();
const projeto = await post('/api/projetos', { nome: 'Loja Brisa (teste)', pasta: pastaSite });

const perguntas = [
  { id: 1, tema: 'texto no meu estilo', texto: 'Escreva um e-mail curto pro meu chefe pedindo pra adiar a reunião de quinta pra sexta de manhã, por causa de um compromisso na UFMG. Tom profissional, mas direto.' },
  { id: 2, tema: 'ajuste num site de loja', projeto: projeto.id, texto: 'No index.html, troque o texto do botão "Comprar" por "Adicionar ao carrinho" e deixe o botão com pelo menos 44 px de altura.' },
  { id: 3, tema: 'planilha com fórmulas', texto: 'Monte uma planilha de controle de gastos mensais com colunas data, categoria, descrição e valor, mais uma aba de resumo com o total por categoria (fórmulas, não valores fixos) e o saldo do mês dado um salário de R$ 5.000. Salve como gastos.xlsx.' },
  { id: 4, tema: 'pesquisa na web', texto: 'Qual é a versão LTS mais recente do Node.js hoje e até quando ela recebe suporte? Pesquise na web e cite a fonte.' },
  { id: 5, tema: 'análise com pensamento profundo', pensar: 2, esforco: 2, texto: 'Analise os prós e contras de migrar uma loja pequena de WordPress para Astro com hospedagem na Vercel, considerando custo, manutenção por quem não é desenvolvedor e SEO. Termine com uma recomendação clara e o que faria primeiro.' },
  { id: 6, tema: 'código em PowerShell', texto: 'Escreva um script PowerShell 5 (sem usar &&) que renomeie todos os arquivos .jpeg de uma pasta pra .jpg, mostre quantos foram renomeados e não sobrescreva arquivos que já existam.' },
  { id: 7, tema: 'resumo de documento anexado', texto: 'Resuma esse relatório em 5 linhas pra eu levar numa reunião e destaque o que preciso decidir.', anexos: [anexo] },
  { id: 8, tema: 'pedido ambíguo (deve perguntar)', texto: 'Faz um logo pra mim.' },
  { id: 9, tema: 'resposta curta e direta', texto: 'Qual a capital da Austrália?' },
];
const longa = [
  'Quero planejar 4 dias em Ouro Preto. Quais pontos priorizar?',
  'Tenho R$ 2.000 no total, saindo de Belo Horizonte, em duas pessoas. Cabe?',
  'Monte um roteiro dia a dia.',
  'Troque o dia 3 por algo mais ao ar livre.',
  'Resuma tudo numa lista de reservas e compras pra eu fazer esta semana.',
];

const resultados = [];
let parou = null;

async function rodar(p) {
  const inicio = Date.now();
  const r = await conversarPeloWs(
    servidor,
    { texto: p.texto, anexos: p.anexos ?? [], modelo, projeto: p.projeto, conversa: p.conversa, pensar: p.pensar ?? 1, esforco: p.esforco ?? 1, web: true, modo: 'mid' },
    { limiteMs: 600000 },
  );
  const seg = Math.round((Date.now() - inicio) / 1000);
  const det = await get(`/api/conversas/${r.conversa}`);
  const ultima = [...det.mensagens].reverse().find((m) => m.papel === 'ia');
  const blocos = Array.isArray(ultima?.conteudo) ? ultima.conteudo : [];
  return { conversa: r.conversa, seg, blocos, erro: r.erro, modelo: det.conversa.modelo };
}

for (const p of perguntas) {
  const uso = await get('/api/uso');
  if ((uso.cincoHoras ?? 0) >= LIMITE_USO || (uso.seteDias ?? 0) >= 85) {
    parou = `parou antes da pergunta ${p.id}: uso da janela de 5 h em ${uso.cincoHoras}%`;
    break;
  }
  console.log(`pergunta ${p.id}: ${p.tema}`);
  try {
    resultados.push({ ...p, ...(await rodar(p)) });
  } catch (e) {
    resultados.push({ ...p, erro: true, blocos: [{ tipo: 'erro', texto: e.message }], seg: 0 });
  }
}

// pergunta 10: conversa de 5 mensagens na mesma conversa
if (!parou) {
  console.log('pergunta 10: conversa longa');
  let conversa;
  const trocas = [];
  for (const [i, texto] of longa.entries()) {
    const uso = await get('/api/uso');
    if ((uso.cincoHoras ?? 0) >= LIMITE_USO || (uso.seteDias ?? 0) >= 85) {
      parou = `parou na mensagem ${i + 1} da conversa longa: uso em ${uso.cincoHoras}%`;
      break;
    }
    try {
      const r = await rodar({ texto, conversa });
      conversa = r.conversa;
      trocas.push({ texto, ...r });
    } catch (e) {
      trocas.push({ texto, erro: true, blocos: [{ tipo: 'erro', texto: e.message }], seg: 0 });
      break;
    }
  }
  resultados.push({ id: 10, tema: 'conversa longa de 5 mensagens', trocas });
}

const uso = await get('/api/uso');

function textoDe(blocos) {
  return blocos
    .map((b) => {
      if (b.tipo === 'texto') return b.texto;
      if (b.tipo === 'pergunta') return `[pergunta com botoes] ${b.pergunta}\n${b.opcoes.map((o) => `  - ${o}`).join('\n')}`;
      if (b.tipo === 'ferramenta') return `(ferramenta: ${b.nome} ${b.resumo})`;
      if (b.tipo === 'permissao') return `(pediu permissao: ${b.negadas.map((n) => n.resumo).join('; ')})`;
      if (b.tipo === 'erro') return `ERRO: ${b.texto}`;
      if (b.tipo === 'pensamento') return `(pensou por ${b.segundos} s)`;
      return '';
    })
    .filter(Boolean)
    .join('\n\n');
}

let md = `# Teste de qualidade: HRZZ x claude.ai (etapa 1)

Gerado por \`npm run qualidade\` em ${new Date().toLocaleString('pt-BR')}.
Modelo no HRZZ: **${modelo}**. Uso da janela de 5 h ao fim: ${uso.cincoHoras ?? '?'}%.
${parou ? `\n> **Atenção:** ${parou}. As perguntas seguintes não foram rodadas.\n` : ''}
## Como usar

1. Abra uma conversa nova no claude.ai com o mesmo modelo e rode cada pergunta abaixo (a 7 precisa do arquivo anexo; a 10 é uma conversa de 5 mensagens seguidas).
2. Cole a resposta do claude.ai na seção "claude.ai" de cada item.
3. Peça pro Claude Code: "compare as respostas do docs/qualidade.md" (ele compara correção, completude, tom, formato e tempo e propõe ajustes nas instruções de fundo).

O arquivo anexo da pergunta 7 fica em \`dados/qualidade/relatorio-trimestral.txt\`.

`;

for (const r of resultados) {
  md += `---\n\n## ${r.id}. ${r.tema}\n\n`;
  if (r.trocas) {
    r.trocas.forEach((t, i) => {
      md += `**Mensagem ${i + 1}:** ${t.texto}\n\n**HRZZ** (${t.seg} s${t.erro ? ', com erro' : ''}):\n\n${textoDe(t.blocos)}\n\n`;
    });
    md += `**claude.ai:**\n\n(colar aqui)\n\n**Anotações:**\n\n`;
    continue;
  }
  md += `**Pergunta:** ${r.texto}\n\n**HRZZ** (${r.seg} s, modelo ${r.modelo ?? modelo}${r.erro ? ', com erro' : ''}):\n\n${textoDe(r.blocos)}\n\n**claude.ai:**\n\n(colar aqui)\n\n**Anotações:**\n\n`;
}

mkdirSync('docs', { recursive: true });
mkdirSync(join('dados', 'qualidade'), { recursive: true });
writeFileSync(join('dados', 'qualidade', 'relatorio-trimestral.txt'), readFileSync(documento, 'utf8'));
writeFileSync(join('docs', 'qualidade.md'), md);
console.log('docs/qualidade.md gravado.' + (parou ? ' ' + parou : ''));
await servidor.parar();
