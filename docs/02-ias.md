# As IAs: Claude e Gemini (agy)

## Regra de uso da assinatura do Claude (importante)

A Anthropic separa duas coisas:

- **Login com a assinatura (Pro/Max)** serve pro uso normal do Claude Code e dos apps da própria Anthropic.
- **Quem desenvolve produtos** com o Agent SDK deve usar chave de API. É proibido oferecer login do Claude.ai em app de terceiros, ou guardar e repassar credenciais da assinatura.

A mesma página deixa claro que isso não impede o usuário de entrar com a própria assinatura no **binário oficial do Claude Code, sem modificação**.

Fonte: <https://code.claude.com/docs/en/legal-and-compliance> (seção "Authentication and credential use"). Leia de novo antes da etapa 1, porque as regras podem mudar.

**Como o HRZZ fica dentro da regra:**

- O HRZZ não usa o Agent SDK com login de assinatura. Ele roda o **`claude` oficial instalado no PC**, em modo headless, como se fosse o João digitando no terminal.
- O login é feito pelo João, no terminal, pelo fluxo da Anthropic (`claude` e depois `/login`). O HRZZ só verifica se está logado (por exemplo, rodando um comando simples e olhando o erro).
- O HRZZ nunca lê nem copia arquivos de credencial. Nunca define `ANTHROPIC_API_KEY`.
- É uso pessoal: o HRZZ não é distribuído como serviço pra outras pessoas usarem a assinatura do João.
- **Plano B, se um dia a Anthropic barrar até isso:** um campo opcional em "acesso e ajustes" pra usar chave de API (paga por uso), desligado por padrão. Só implementar se for preciso.

## Motor Claude (`apps/servidor/src/ia/claude.ts`)

Roda o Claude Code em modo não interativo. As flags abaixo foram conferidas no `claude --help` da versão 2.1 (novembro de 2026), mas **confira de novo** na máquina do João, porque mudam entre versões:

```
claude -p "<mensagem>" --output-format stream-json --verbose --include-partial-messages ^
  --model <opus|sonnet|haiku ou nome completo> ^
  --effort <low|medium|high|xhigh|max> ^
  --resume <id-da-sessao>            (a partir da 2ª mensagem) ^
  --append-system-prompt "<memória + preferências + instruções do projeto>" ^
  --permission-mode acceptEdits ^
  --mcp-config <dados/segredos/mcp.json>  (quando houver conectores) ^
  --restricted                        (só quando o acesso vem pela Cloudflare: tira as ferramentas que rodam comandos)
```

- `--include-partial-messages` faz o texto chegar aos pedaços, como no claude.ai.
- `--input-format stream-json` permite manter um processo aberto por conversa e mandar mensagens novas sem reabrir. Vale testar se fica mais rápido.
- **Esforço (bracinho):** leve = `low`, médio = `high`, máximo = `max`.
- **Pensamento (lâmpada):** não há flag própria nessa versão. Verifique se dá pra ligar por `--settings` com um JSON (ex.: a configuração de pensamento sempre ligado) ou pelo esforço.

- **Pasta de trabalho:** o processo roda com `cwd` na pasta do projeto. Assim o Claude enxerga e edita os arquivos.
- **Sessão:** o primeiro evento do fluxo traz o `session_id`. Guarde em `conversas.sessao_claude` pra continuar depois.
- **Eventos:** cada linha é um JSON. Mapeie pros eventos do HRZZ: pensamento, texto, uso de ferramenta, resultado, custo/uso e fim. Mostre o pensamento recolhido ("pensou por 12 s").
- **Pensamento e esforço:** ligue os três estados de cada botão às opções acima e registre como ficou em `08-decisoes.md`.
- **Web:** o Claude Code tem pesquisa na web como ferramenta. Com o globo desligado, bloqueie as ferramentas de web (`--disallowedTools` ou equivalente); ligado, deixe liberado.
- **Skills:** o Claude Code carrega skills de `.claude/skills/`. O HRZZ copia ou cria links das skills do João (de `dados/skills/`) pra pasta do projeto, ou usa a pasta de skills do usuário (`~/.claude/skills`). Incluir as skills públicas de documentos da Anthropic (docx, xlsx, pptx, pdf), do repositório `anthropics/skills`.
- **Permissões:** `acceptEdits` dentro da pasta do projeto. Comandos perigosos (apagar fora do projeto, mexer no sistema) devem pedir confirmação na interface. Use os hooks ou o modo de permissão do CLI e faça o pedido aparecer no chat como pergunta de múltipla escolha.
- **Qualidade:** é o mesmo modelo do claude.ai. O que muda são as instruções de fundo, que aqui são as do Claude Code mais as nossas. A etapa 1 termina com o teste lado a lado (`/qualidade`).

## Progresso das conversas

O painel de progresso (`03-design.md`) é alimentado pela própria IA:

- **Claude:** o Claude Code mantém uma lista de tarefas (a ferramenta de to-do que aparece no fluxo `stream-json` como uso de ferramenta). O motor captura essas chamadas e converte em itens `afazer`, `fazendo` e `feito`. Confira o nome exato da ferramenta e o formato no fluxo real antes de implementar.
- **Instruções de fundo:** acrescente uma linha mandando o Claude manter a lista de tarefas atualizada em todo pedido com mais de um passo, inclusive marcando "esperando resposta" quando fizer uma pergunta.
- **agy:** se ele não tiver lista de tarefas própria no fluxo, peça nas instruções que termine cada resposta com um bloco `<progresso>` (uma linha por item: `[x]`, `[~]` ou `[ ]` + texto), e o HRZZ lê e esconde esse bloco.
- **Itens do João:** os que ele adiciona ou marca na mão têm origem `você` e a IA não apaga. Ela só pode sugerir marcar como feito.
- **Visão de projeto:** junta os itens abertos de todas as conversas do projeto mais os itens soltos do projeto.

## Motor agy (`apps/servidor/src/ia/agy.ts`)

O `agy` (Antigravity CLI) é o Gemini do Google AI Plus. O João já usa no Illuminati com `agy --mode accept-edits`. Confira com `agy --help`; o esboço é:

```
agy -p "<mensagem>" --output-format stream-json ^
  --model <modelo> ^
  --conversation <id>   (ou -c pra continuar a última) ^
  --mode accept-edits
```

- **Lista de modelos:** venha do próprio `agy` (comando de listagem ou ajuda). Não fixe nomes no código. O protótipo mostra "Gemini 3 Pro" e "Gemini 3 Flash" só como exemplo.
- **Instalação:** se o `agy` não estiver no PATH, procure em `%LOCALAPPDATA%\agy\bin`, igual ao Illuminati.
- **Cota:** no AI Plus as requisições de agente são limitadas. O guardião de cota precisa contar isso.

## Modos de permissão (Yolo, Mid, Intern)

O João escolhe o modo a qualquer momento, por conversa, no botão de escudo do topo do chat (ver protótipo). O modo padrão de conversa nova ainda vai ser combinado. Implementação: cada modo vira uma combinação de `--permission-mode`, listas de ferramentas permitidas e bloqueadas e um hook que barra apagar e sair da pasta. Confira os modos disponíveis no `claude --help`; na versão 2.1 eles eram `acceptEdits`, `auto`, `bypassPermissions`, `manual`, `dontAsk` e `plan`. Faça o equivalente no `agy` com o `--mode` dele.

| Modo | Comportamento (decidido) | A confirmar com o João |
|---|---|---|
| **Yolo** | faz tudo sem pedir confirmação, inclusive push. Só apagar e sair da pasta do projeto perguntam | — |
| **Mid** | faz tudo (edita, roda comandos, instala pacotes), menos apagar, sair da pasta e push, que perguntam | — |
| **Intern** | pergunta tudo: cada edição e cada comando | nada |

- **Em qualquer modo:** apagar e sair da pasta nunca acontecem sem confirmação.
- **Pela Cloudflare (PC do trabalho):** continua valendo `--restricted` (sem comandos), qualquer que seja o modo.
- **Perguntas na tela:** os pedidos de confirmação aparecem no chat como pergunta com botões ("pode", "não", "pode sempre nesta conversa").

## Escolha automática de modelo

Decidido: numa conversa nova, o HRZZ escolhe o modelo pelo tipo de pedido. O João pode trocar na mão a qualquer momento, e a troca vale até o fim da conversa.

As regras de qual pedido vai pra qual modelo ainda vão ser combinadas com o João (ver `08-decisoes.md`). Não implemente regras próprias sem perguntar.

## Seletor de modelo

Dividido por empresa, como no protótipo:

- **Anthropic** (ponto cor `--cl`, "sua assinatura"): Opus 5.5 (mais capaz), Sonnet 5.5 (equilibrado), Haiku 5.5 (rápido). Os nomes exibidos saem de uma tabela de config, pra trocar quando sair modelo novo.
- **Google** (ponto cor `--gm`, "via agy"): lista vinda do `agy`.
- O botão mostra o ponto da empresa + o nome do modelo.
- Padrão: o HRZZ escolhe (ver "Escolha automática de modelo" acima).

## Dueto (botão das duas pessoinhas, no topo do chat)

- O Claude coordena. Ele recebe uma ferramenta extra, `pedir_ao_gemini(tarefa, arquivos)`, implementada como um servidor MCP local do HRZZ. Assim ele delega partes do trabalho (ex.: "gera 3 variações dessa arte na pasta arte/").
- Por baixo, o servidor roda o `agy` com a tarefa e devolve a resposta pro Claude.
- Na interface, as falas do Gemini aparecem recuadas e marcadas com o ponto `--gm`, pra dar pra acompanhar quem fez o quê.
- O Gemini trabalha numa subpasta (padrão `arte/`, configurável), como no Illuminati.

## Duelo (botão das espadas)

- A mesma mensagem vai pros dois motores ao mesmo tempo, cada um na sua sessão.
- As duas respostas aparecem lado a lado (empilhadas no celular), cada uma com "usar essa".
- A escolhida segue como resposta oficial da conversa. A outra fica guardada, recolhida, e dá pra abrir depois.
- Se os dois mexerem em arquivos, cada um trabalha numa cópia (git worktree) e só a escolhida é aplicada.

## Guardião de cota

- Mostra no topo o uso das duas assinaturas, com uma barrinha e a porcentagem.
- **Claude:** o CLI informa limites e reinícios em mensagens e erros. Guarde o que vier no fluxo e, se o CLI tiver comando de uso/status, leia de lá. Se não der pra saber a % exata, estime por mensagens na janela de 5 h e mostre "estimado".
- **Ação:** acima de 80%, o chip fica âmbar e oferece "usar o Haiku 5.5 até renovar".
- **Erro de limite:** a interface explica quando renova e oferece trocar de modelo ou mandar pro agy.
