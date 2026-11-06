# Design

Referência oficial: `docs/prototipo.html`. Em caso de dúvida, o protótipo manda. Este documento só explica as regras por trás dele.

## Identidade

- **Nome:** HRZZ STUDIO, em Space Mono com espaçamento de 1.5px, no começo da faixa de cima. No celular aparece só "HRZZ".
- **Estilo:** Retro Ledger, **só no modo escuro**, com a paleta do terminal Illuminati. Retrô com um pouco de acabamento "premium": botões menores, ícones de linha fina, sombra sólida de 1px.
- **Assinatura visual:** a floresta ASCII andando no fundo do chat e os pinheirinhos transparentes nos cantos das outras telas.

## Tokens

```css
--bg:   #1C1917;  /* fundo */
--card: #24201C;  /* caixas */
--card2:#2A2521;  /* mensagens da IA, popovers, botões */
--tx:   #E8DFD1;  /* texto */
--md:   #A8A29E;  /* texto secundário, ícones */
--ap:   #78716C;  /* texto apagado */
--bd:   #3A332C;  /* bordas */
--bd2:  #2F2925;  /* bordas suaves */
--sh:   #0C0A09;  /* sombra sólida */
--aba:  #332D28;  /* abas inativas, hover, mensagem do usuário */
--am:   #D9B26F;  /* âmbar: destaque, estado ligado, avisos */
--amb:  #3B3122;  /* fundo do âmbar */
--ok:   #7FA8A0;  /* verde: conectado, pc ligado */
--cl:   #C99A8A;  /* ponto da Anthropic */
--gm:   #8FB0C9;  /* ponto do Google */
```

- **Fontes:** Plus Jakarta Sans (texto, 13px base) e Space Mono (rótulos pequenos, abas, código, nome do app).
- **Cantos:** 9px nas caixas grandes, 6 a 7px em botões e campos, 5px em tags.
- **Sombra:** `1px 1px 0 var(--sh)`, sólida, sem desfoque. Popovers ganham também uma sombra difusa leve.

## Componentes

| Componente | Regra |
|---|---|
| Botão de ícone (`.ib`) | 26×26, sem borda, ícone 15px cor `--md`. Hover: fundo `--aba`. Ligado: fundo `--amb`, borda #5A4A2E, ícone `--am` |
| Botão com texto (`.bt`) | 26px de altura, borda `--bd`, sombra sólida 1px, "afunda" 1px ao clicar |
| Enviar e nova conversa | mesmo tamanho dos outros botões de ícone, com fundo `--aba` e borda |
| Seletor de modelo | 26px de altura, 156px de largura (encolhe até 96px). Mostra o ponto da empresa + o nome. Popover dividido em Anthropic e Google |
| Pensamento | lâmpada: riscada (desligado), normal (ligado), âmbar com brilho (profundo) |
| Esforço | bracinho em SVG próprio: fino (leve), com muque (médio), com muque grande e risquinhos (máximo, âmbar) |
| Web | globo: apagado (desligado), âmbar com fundo e pontinho (ligado) |
| Abas | estilo aba de pasta, em Space Mono 11px. A ativa "encosta" no conteúdo |
| Chips da faixa de cima | 22px de altura: uso (pontos `--cl`/`--gm` + barrinhas), fila, pc ligado |
| Chip de progresso | no topo do chat, ao lado do título: barrinha verde + "feitas/total" em Space Mono. Clicar abre o painel na aba progresso |
| Seletor de modo | no topo do chat, antes do dueto: botão com escudo + nome do modo em Space Mono (yolo em vermelho-tijolo, mid neutro, intern em verde). Abre um popover com os três modos e o que cada um faz. No celular, só o ícone |
| Ferramentas do preview | grupos de ícones dentro de uma caixinha (`.grp`), com o nome no tooltip |

## Progresso (aba do painel da direita)

- **Lugar:** é a segunda aba do painel, depois do preview. Abre também pelo chip de progresso no topo do chat.
- **Alternância:** "conversa" (só esta conversa) e "projeto" (todas as conversas do projeto).
- **Barra:** verde (`--ok`) pra feitas e âmbar (`--am`) pra em andamento, com a legenda "N feitas · N em andamento · N a fazer · %".
- **Grupos, nesta ordem:** fazendo agora, a fazer, feito. Cada grupo recolhe ao clicar no título.
- **Item:**
  - **Bolinha:** vazia (a fazer), tracejada âmbar girando devagar (fazendo), verde com ✓ (feito).
  - **Texto:** a tarefa, com uma linha de detalhe (versão, horário ou "esperando sua resposta") e a tag de origem: `ia` ou `você`.
- **Ações:** clicar na bolinha marca ou reabre. Embaixo fica o campo "adicionar tarefa". Item que acabou de mudar pisca verde uma vez.

## Layout e responsividade

- **Barra lateral:** 168px. Recolhe pra 44px (só ícones) pelo botão "recolher" no pé dela. Quando abre, **empurra** o chat em vez de cobrir.
- **Chat + painel:** lado a lado (1fr / 1.1fr). O painel minimiza (botão no topo do chat ou `ctrl+\`), abre por completo (setas, `ctrl+.`) e abre sozinho quando sai versão nova.
- **Larguras de referência:**
  - **≤ 820px:** barra lateral começa recolhida.
  - **≤ 640px:** o painel da direita passa a abrir por cima do chat.
  - **≤ 480px (celular):** o nome vira "HRZZ", as barrinhas de uso somem (ficam só os %), o painel ocupa a tela toda.
- **Nada pode vazar pelas laterais.** Use `min-width:0` em todo filho de flex/grid que tenha texto, e reticências em títulos. Rode `npm run testar:layout`.

## Floresta e pinheiros

- **Fundo do chat:** três camadas de ASCII andando pra esquerda (CSS `translateX` com a faixa duplicada, sem JavaScript por quadro).
  - **Fundo:** pinheirinhos pequenos, opacidade 0.045, 520 s por volta.
  - **Meio:** pinheiros médios, opacidade 0.07, 300 s.
  - **Frente:** pinheiros grandes, opacidade 0.10, 170 s, com lago (`~`), peixe (`><>`) e pedras (`o O`) de vez em quando.
- **Tipos de pinheiro:** clássico, largo, fino, torto, só com copa na ponta, redondo e alto, mais os pequenos do fundo. A cena é sorteada com semente fixa, pra não mudar a cada abertura.
- **Cantos das outras telas:** pinheirinhos estáticos com opacidade 0.09, sorteados por tela.
- Respeitar `prefers-reduced-motion`; dá pra desligar em "acesso e ajustes".
- **Lição do protótipo:** não use `String.raw` com linha terminando em barra invertida. Os desenhos dos pinheiros ficam num array de strings comuns (ver o script do protótipo).

## Texto da interface

- Português, minúsculas nos rótulos, frases curtas.
- Sem linguagem promocional ("incrível", "poderoso" etc.).
- Erros dizem o que aconteceu e o que fazer, sem pedir desculpa.
