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
- **Skills:** ver a seção "Skills por projeto (etapa 4)" mais abaixo.
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

O João escolhe o modo a qualquer momento, por conversa, no botão de escudo do topo do chat (ver protótipo). O modo padrão de conversa nova é o **Mid**. Implementação: cada modo vira uma combinação de `--permission-mode`, listas de ferramentas permitidas e bloqueadas e um hook que barra apagar e sair da pasta. Confira os modos disponíveis no `claude --help`; na versão 2.1 eles eram `acceptEdits`, `auto`, `bypassPermissions`, `manual`, `dontAsk` e `plan`. Faça o equivalente no `agy` com o `--mode` dele.

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

Regras decididas:

- **Opus 5.5:** sites, código, documentos, planilhas e pedidos longos (anexos grandes, muitos passos).
- **Sonnet 5.5:** o resto (perguntas, conversa, textos curtos).
- **Haiku 5.5:** só quando a cota do Claude passa de 80% (guardião de cota).
- O botão do modelo mostra qual foi escolhido; se o João trocar, vale a troca.

A classificação do pedido é feita por regras simples (palavras, anexos, projeto com site aberto, tamanho do pedido). Se ficar em dúvida, usa o Opus.

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


## Como ficou na etapa 1 (conferido na máquina em 13/11/2026)

Flags do `claude` 2.1.322 confirmadas com `--help` e com execução de verdade:

- O prompt vai pela **entrada padrão** (stdin), não como argumento: evita limite de tamanho e problema de aspas no Windows.
- `--permission-prompts none` faz o que precisaria de confirmação ser **negado na hora**. Os negados voltam em `permission_denials` no evento final (`tool_name` e `tool_input`). O HRZZ transforma isso na pergunta "pode / pode sempre nesta conversa / não" e, se o João aprovar, roda de novo com a regra liberada.
- Modos: **yolo** e **mid** usam `--permission-mode acceptEdits` com `Bash` e `PowerShell` liberados. Apagar (`rm`, `rmdir`, `del`, `Remove-Item`, `git clean`...) fica em `--disallowedTools` nos dois; push (`git push*`) também no mid. **Intern** usa `--permission-mode manual`: edição e comando são negados e viram pergunta. Pasta fora do projeto: as ferramentas de arquivo já negam sozinhas fora do `cwd`; aprovar libera com `--add-dir`.
- **Esforço:** leve = `low`, médio = `high`, máximo = `max` (`--effort`).
- **Pensamento:** esta versão não tem flag pra desligar. `MAX_THINKING_TOKENS=0` e `alwaysThinkingEnabled=false` não desligam (o modelo pensa de forma adaptativa). O HRZZ faz assim: **desligado** = esconde o pensamento na tela e pede resposta direta nas instruções; **ligado** = padrão; **profundo** = `ultrathink` no começo da mensagem mais um pedido de raciocínio cuidadoso. O texto do pensamento chega vazio (só o tempo, "pensou por N s").
- **Web desligada:** `--disallowedTools WebSearch WebFetch`.
- **Instruções de fundo:** `--append-system-prompt` junto de `--system-prompt-snapshot off`, senão o `claude` reaproveita o prompt gravado na primeira mensagem e a memória nova não entra.
- **Lista de tarefas:** no modo `-p` desta versão **não existe** a ferramenta `TodoWrite`. O progresso vem do bloco `<progresso>` que as instruções de fundo pedem no fim da resposta (e o HRZZ esconde). Se uma versão futura trouxer `TodoWrite`, o leitor já converte. Perguntas de múltipla escolha vêm do bloco `<pergunta>`, do mesmo jeito.
- **Uso das assinaturas:** o fluxo traz `rate_limit_event` com `unifiedWindows.five_hour.utilization` e `seven_day.utilization` (fração de 0 a 1) e `resetsAt`. É daí que vêm os percentuais do topo e o guardião de cota. Exige uma resposta antes pra aparecer.
- **Segurança:** o processo filho roda sem `ANTHROPIC_API_KEY` (o HRZZ a retira do ambiente do filho), pra nunca cobrar pela API por engano.
- **Restrito (Cloudflare):** com o cabeçalho `Cf-Access-Authenticated-User-Email` o `claude` sobe com `--restricted` e sem liberar `Bash`/`PowerShell`, qualquer que seja o modo.

`agy` (Antigravity CLI, `agy.exe`): `agy models` lista os modelos (uma linha por modelo, id e nome separados por espaços); o HRZZ mostra só os `gemini-*`, e quem tem variantes low/medium/high vira um item só (id `base-*`): o botão de esforço escolhe a variante (leve = low, médio = medium, máximo = high). Variante fora dessas (ex.: `-xhigh`) e modelo sem esforço no nome ficam como item próprio, com esforço fixo. **O `-p` do agy recebe o pedido como valor** (conferido no `--help` e no erro do agy em 18/11/2026): o HRZZ manda `-p=<pedido>`; pedido acima de 24 mil caracteres vai num arquivo e o `-p` manda ler. Pelo acesso do trabalho o agy roda com `--sandbox`. `--effort` existe, mas o HRZZ escolhe a variante pelo id. `--output-format stream-json`, `--model`, `--conversation`, `--mode (accept-edits|auto|plan)` e `--add-dir` existem no `--help`. O HRZZ mapeia yolo = `auto`, mid = `accept-edits`, intern = `plan`. O formato do fluxo do `agy` ainda não foi visto com uma resposta real (a construção automática não usa o agy): o leitor aceita o formato do Claude Code e linhas de texto simples. Teste pendente em `docs/pendencias-do-joao.md`.

## Skills por projeto (etapa 4)

Conferido na máquina em 14/11/2026 com o `claude` 2.1.322 (`--plugin-dir` e `--disallowedTools "Skill(nome)"`).

- **Onde as skills moram.** O `claude` já enxerga sozinho as skills de `~/.claude/skills` (as sincronizadas do claude.ai ficam em `~/.claude/skills/synced/<id>/<skill>`, com nome nativo `anthropic-skills:<skill>`) e as de plugins sincronizados (`humanizer:humanizer`). O HRZZ só **lê** essas pastas (nunca altera). As skills que o João cria no próprio HRZZ ficam em `dados/skills/<nome>/SKILL.md`.
- **Origem na tela:** "da anthropic" é o que o `manifest.json` marca como `anthropic` ou `anthropic-example`; o resto (inclusive as do João sincronizadas) aparece como "sua".
- **Ligar e desligar por projeto.** O escopo é o projeto (ou "conversas sem projeto"). Tudo nasce ligado; só o que o João desliga fica gravado (tabela `skills_desligadas`).
  - **Skill do HRZZ** (`dados/skills`): o servidor gera, a cada mensagem, um plugin em `dados/skills-ativas/escopo-<id>` só com as ligadas (nome do plugin `hrzz-skills`, skill nativa `hrzz-skills:<nome>`) e passa `--plugin-dir`. A pasta entra em `--add-dir` pra o `claude` conseguir ler os arquivos da skill. Só reescreve quando algo mudou.
  - **Skill que o `claude` já carrega:** não dá pra tirar da lista, então desligada vira a regra `Skill(<nome nativo>)` em `--disallowedTools` (testado: a chamada volta "Skill execution blocked by permission rules") e as instruções de fundo avisam "não use: ...".
  - O bloqueio de skill é de propósito: o `permission_denials` do tipo `Skill` não vira cartão de "pode / não" no chat.
- **Comandos salvos** são só texto: `dados/comandos/<nome>.md` (cabeçalho com `descricao:` e o pedido no corpo). O servidor troca `/nome texto` pelo pedido antes de mandar pro motor (vale pro Claude e pro agy). `/ata` continua especial (`transcricao/ata.ts`).

## Como ficou na etapa 5 (IA junta)

Conferido na máquina em 14/11/2026 com o `claude` 2.1.322 (`--mcp-config`) e o `agy --help`. O `agy` real não foi usado (regra da construção automática); nos testes entra um `agy` de mentira (`scripts/agy-falso.mjs`).

- **Dueto.** `conversas.parceria = 'dueto'`. A cada mensagem o HRZZ escreve `dados/dueto/conversa-<id>.json` com o servidor `hrzz-gemini` (`node apps/servidor/mcp/gemini.mjs`, variáveis `HRZZ_MCP_*` com a pasta do projeto, a subpasta, o modo do agy e o caminho do agy) e passa `--mcp-config` mais `--allowedTools mcp__hrzz-gemini__pedir_ao_gemini`. As instruções de fundo explicam a ferramenta. O servidor MCP roda `agy -p --output-format text --mode <modo>` com o pedido pela entrada padrão, na subpasta `arte/` (ou a que estiver em "acesso e ajustes"), e devolve o texto. `--add-dir <projeto>` só entra quando o Claude pediu pro Gemini ler arquivos. O fluxo do Claude traz o resultado da ferramenta, que o HRZZ grava como bloco `gemini`. Limite de 15 minutos por pedido. Bloqueado pelo acesso da Cloudflare e sem efeito se o modelo escolhido for do Google.
- **Duelo.** `conversas.parceria = 'duelo'`. A mesma mensagem roda ao mesmo tempo no `claude` e no `agy`, cada um numa cópia da pasta (ver `08-decisoes.md`) e com a sessão guardada por lado na tabela `config` (`duelo:<conversa>:claude` e `:agy`): a cópia tem caminho fixo por conversa, que é o que deixa o `--resume` do Claude Code achar a sessão. O resultado é uma mensagem com um bloco `duelo` (dois lados, o que cada um mudou e `escolhida`). `POST /api/duelo/escolher` aplica a cópia escolhida. No duelo, pedidos de permissão do modo Intern ficam só informativos; use Mid ou Yolo.
- **Guardião de cota.** `cota.ts` guarda o último `rate_limit_event` (tabela `config`), diz o nível (`ok`, `alto` a partir de 80%, `limite`) e controla o "Haiku até renovar". Uso do agy: o `agy` não informa cota; o topo continua com `–` no Gemini. Limite batido: o leitor de fluxo reconhece `rate_limit_event` com status `rejected` ou um texto parecido com "usage limit"/"limite de uso" no erro final e grava um bloco `limite`. **O texto exato que o `claude` real manda quando o limite acaba não deu pra provocar** (testado com um texto de mentira); se o João topar com um limite de verdade e o aviso não aparecer, o erro vai aparecer como erro comum e a frase entra em `RE_LIMITE` (`ia/stream.ts`).
- **Fila e agendamentos.** `fila.ts`. Detalhes em `08-decisoes.md`.
- **Auditoria.** `trabalho/auditoria.ts`, dentro do painel do preview (ícone da lista de verificação).

## Como ficou na etapa 6 (conectores e painel do dia)

Conferido na máquina em 14/11/2026 com o `claude` 2.1.322 (`claude mcp --help`, `claude mcp add --help`, `claude mcp list`, `--mcp-config`, `--strict-mcp-config`, `--allowedTools mcp__<servidor>`) e com execuções reais (Haiku).

- **Dois tipos de conector** (`conectores/catalogo.ts`):
  - **token** (GitHub, Cloudflare, Supabase): o João cola um token do próprio serviço na tela. Fica em `dados/segredos/conectores.json` (junto de `ligado`, `acesso` e `somente leitura`); o HRZZ gera `dados/segredos/mcp.json` no formato do `claude` (`{"mcpServers": {"hrzz-github": {"type": "http", "url": ..., "headers": {"Authorization": "Bearer ..."}}}}`) e passa em `--mcp-config`. Testado com o `claude` real: o servidor entra como "dynamic" (com token falso ele aparece como `failed`, sem erro de formato). A tela nunca recebe o token inteiro (só `••••` e os 4 últimos caracteres). São tokens de **outros serviços**; nada do login do Claude passa por aqui.
  - **conta** (Google Drive, Docs, Planilhas, Agenda, Gmail e Vercel): o `claude` já carrega sozinho (conectores do claude.ai da conta, plugins ou `claude mcp add`). O login é do João, pelo fluxo da Anthropic. O HRZZ só roda `claude mcp list` (leva uns 3 s e testa a saúde de cada servidor), reconhece cada conector pela URL (`drivemcp.googleapis.com`, `mcp.vercel.com`...) ou pelo nome, e liga ou desliga o uso. Pra ligar um que falta, a tela mostra o passo a passo (claude.ai > conectores, ou `claude mcp add --transport http --scope user vercel https://mcp.vercel.com` e `/mcp` dentro do `claude`).
- **URLs dos servidores** (conferidas nas páginas dos próprios serviços): GitHub `https://api.githubcopilot.com/mcp/` (e `/readonly`), Cloudflare `https://mcp.cloudflare.com/mcp`, Supabase `https://mcp.supabase.com/mcp` (e `?read_only=true`), Vercel `https://mcp.vercel.com` (só OAuth). Se o Supabase ou outro ignorar o cabeçalho com token e cair no OAuth (há relatos disso no Claude Code), o teste do token na tela passa (ele fala com a API do serviço), mas o conector não conecta no `claude`: confira com `claude mcp list` e, se for o caso, use `claude mcp add` + `/mcp` (ver pendências).
- **Quem usa o quê no turno** (`Conectores.paraTurno`):
  - o prefixo das ferramentas é `mcp__<servidor>` com `.`, espaços e `:` trocados por `_` (`claude.ai Google Drive` vira `mcp__claude_ai_Google_Drive`; os de token são `mcp__hrzz-github` etc.). A regra `mcp__<servidor>` vale pro servidor inteiro, tanto em `--allowedTools` quanto em `--disallowedTools` (testado);
  - **Yolo**: todo conector ligado entra em `--allowedTools`. **Mid e Intern**: só os marcados "livre"; os de "pergunta antes" (o padrão) são negados na hora e viram o cartão do chat com "pode", "pode sempre nesta conversa" e "não" (categoria `conector`; "pode sempre" libera o servidor inteiro naquela conversa). Testado com o `claude` real: a busca do Drive virou cartão e, com "livre", rodou sem pedir;
  - conector **desligado** na tela: os de token saem do `mcp.json`; os de conta entram em `--disallowedTools`;
  - as instruções de fundo ganham uma linha com os conectores ligados;
  - **pela Cloudflare** nenhum conector vale: o `claude` sobe com `--strict-mcp-config` (ignora até os que ele mesmo conhece) e as rotas de mudar, testar e consultar a agenda respondem 403.
  - GitHub e Supabase começam em **somente leitura** (URL `/readonly` e `?read_only=true`), porque o token costuma ter poder de escrita.
- **Painel do dia** (`dia/dia.ts`, `GET /api/dia`):
  - **repositórios**: `git status -b` de cada projeto (ramo, alterações, commits a enviar e a baixar, último commit), sem rede;
  - **GitHub**: com o token do conector, a API do GitHub (`/search/issues` com `@me`): meus PRs abertos, PRs pedindo minha revisão e issues atribuídas, com cache de 5 minutos;
  - **agenda**: não há API direta do Google (precisaria de um app OAuth do João). O HRZZ pede ao `claude` (Haiku, modo que pergunta tudo, só a ferramenta da agenda liberada, sem web) pra listar os eventos de hoje a depois de amanhã em JSON, e guarda o resultado. Só roda quando o João clica "buscar agenda", porque gasta cota;
  - **pendências**: itens de progresso abertos de todas as conversas e projetos; **uso**: cota do Claude (janela de 5 h e semana; o Gemini fica `–`) e fila/agendamentos.
