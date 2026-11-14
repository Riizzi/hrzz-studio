// Monta as instrucoes de fundo: memoria + preferencias + como o HRZZ funciona.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lerMemoriaParaPrompt, listarMemoria } from '../acervo/memoria.js';

const MEMORIA_INICIAL = `# Preferências

- Responda sempre em português do Brasil, em tom direto e informal, sem jargão desnecessário.
- Prefira respostas curtas. Detalhe só quando eu pedir.
`;

export function garantirMemoria(pasta: string): void {
  mkdirSync(pasta, { recursive: true });
  if (listarMemoria(pasta).length === 0) writeFileSync(join(pasta, 'preferencias.md'), MEMORIA_INICIAL);
}

// toda a memoria (inclusive subpastas) entra nas instrucoes de fundo
export function lerMemoria(pasta: string): string {
  return lerMemoriaParaPrompt(pasta);
}

const COMO_FUNCIONA = `Você está rodando dentro do HRZZ STUDIO, o app pessoal do João Pedro Rizzi. A interface mostra o que você escreve.

Regras de formato do HRZZ:
- Em todo pedido com mais de um passo, termine a resposta com a lista de tarefas atualizada neste bloco (uma linha por item; [x] feito, [~] fazendo agora, [ ] a fazer). Quando fizer uma pergunta ao João, deixe o item correspondente como "esperando sua resposta".
<progresso>
[x] exemplo de item feito
[~] exemplo de item em andamento
[ ] exemplo de item a fazer
</progresso>
- Quando precisar que o João escolha entre opções, escreva a pergunta neste bloco no fim da resposta (primeira linha é a pergunta, depois uma opção por linha começando com "- ", de 2 a 4 opções, a recomendada primeiro). Não repita as opções no texto.
<pergunta>
Qual ícone fica no lugar do endereço?
- mapa
- pin
</pergunta>
- Esses blocos são lidos pelo HRZZ e escondidos do João. Não os explique.
- Documentos, planilhas, apresentações e PDFs: use as skills de documentos (docx, xlsx, pptx, pdf) quando estiverem disponíveis, e salve o arquivo na pasta do projeto. O HRZZ mostra a pré-visualização na aba "arquivos" e na galeria. Diga só o nome do arquivo criado.`;

export function montarPromptSistema(opcoes: { memoria: string; pensar: 0 | 1 | 2; nomeProjeto?: string; skillsDesligadas?: string[] }): string {
  const partes = [COMO_FUNCIONA];
  if (opcoes.nomeProjeto) partes.push(`Projeto atual: ${opcoes.nomeProjeto}. Você está na pasta dele.`);
  if (opcoes.skillsDesligadas?.length) partes.push(`O João desligou estas skills ${opcoes.nomeProjeto ? 'neste projeto' : 'nas conversas sem projeto'}; não use: ${opcoes.skillsDesligadas.join(', ')}.`);
  if (opcoes.pensar === 0) partes.push('Responda direto, sem raciocínio estendido.');
  if (opcoes.pensar === 2) partes.push('Pense com profundidade antes de responder: considere alternativas e confira o resultado.');
  if (opcoes.memoria) partes.push(`## Memória e preferências do João\n${opcoes.memoria}`);
  return partes.join('\n\n');
}
