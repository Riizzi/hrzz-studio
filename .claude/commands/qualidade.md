---
description: Teste lado a lado de qualidade das respostas (HRZZ x claude.ai)
---

Monte o teste de qualidade da etapa 1:

1. Crie `docs/qualidade.md` com 10 perguntas variadas, parecidas com o meu uso real:
   - um texto no meu estilo (skill estilo-joao-pedro);
   - um ajuste num site de loja;
   - uma planilha com fórmulas;
   - uma pergunta que precisa de pesquisa na web;
   - uma análise que precisa de pensamento profundo;
   - uma pergunta de código em PowerShell;
   - um resumo de documento anexado;
   - um pedido ambíguo (pra ver se ele pergunta em múltipla escolha);
   - uma resposta curta e direta;
   - uma conversa longa de 5 mensagens.
2. Rode cada pergunta no HRZZ com Opus 5.5 e guarde as respostas no arquivo.
3. Me diga pra rodar as mesmas no claude.ai e colar as respostas lá.
4. Depois que eu colar, compare item por item (correção, completude, tom, formato, tempo), aponte onde o HRZZ ficou pior e proponha ajustes nas instruções de fundo (`--append-system-prompt`, memória, skills).
