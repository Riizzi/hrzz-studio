# Decisões

Registro curto do que foi decidido e do que ainda está aberto. O Claude Code acrescenta aqui no fim de cada etapa.

## Decididas

| Data | Decisão | Motivo |
|---|---|---|
| 29/10/2026 | Nome: **HRZZ STUDIO** | identidade do João (coincide com o nome provisório do jogo) |
| 29/10/2026 | Visual Retro Ledger **só escuro**, paleta do Illuminati | pedido do João |
| 29/10/2026 | Floresta ASCII andando no fundo do chat, pinheiros de vários tipos | pedido do João |
| 29/10/2026 | Gemini pelo `agy` (Antigravity CLI), com Google AI Plus | já usa no Illuminati |
| 29/10/2026 | Dueto e duelo como botões no topo do chat, fora do seletor de modelo | pedido do João |
| 29/10/2026 | Seletor de modelo dividido por empresa (Anthropic / Google) | pedido do João |
| 29/10/2026 | Painel da direita minimiza, abre por completo e abre sozinho quando o preview atualiza | pedido do João |
| 02/11/2026 | Claude pelo **binário oficial `claude` em modo headless**, não pelo Agent SDK com login de assinatura | regra da Anthropic sobre credenciais de assinatura (ver `02-ias.md`) |
| 02/11/2026 | Seção de transcrição no estilo do `alexandre-amaral/transcriber`, adaptada pro Windows (faster-whisper + WASAPI) | pedido do João |
| 02/11/2026 | O João constrói pelo terminal, com o Claude Code local seguindo `CLAUDE.md` e `/etapa N` | pedido do João |
| 06/11/2026 | Tecnologias aprovadas: Node + TypeScript (Fastify), React + Vite, SQLite, transcrição em Python | João aprovou a proposta P1 |
| 06/11/2026 | Modelo de conversa nova: **o HRZZ escolhe**. Opus 5.5 pra sites, código, documentos e pedidos longos; Sonnet 5.5 pro resto; Haiku 5.5 só quando a cota do Claude passa de 80%. O botão do modelo mostra qual foi escolhido | escolha do João |
| 06/11/2026 | Modo **Mid**: faz tudo (edita, roda comandos, instala pacotes), menos apagar, sair da pasta e push, que perguntam | escolha do João |
| 06/11/2026 | Modo **Yolo**: tudo liberado, inclusive push; só apagar e sair da pasta perguntam | escolha do João |
| 06/11/2026 | Seletor de modo no **topo do chat**, junto do dueto, duelo e painel | escolha do João |
| 06/11/2026 | O HRZZ vai rodar num **servidor robusto dividido com amigos** (empresa ainda em escolha). Cada um hospeda os próprios projetos e ferramentas lá; o HRZZ é só do João | decisão do João |
| 06/11/2026 | **PIN sempre**, em qualquer caminho (inclusive Tailscale), lembrado por um tempo em cada aparelho | servidor dividido: outras pessoas lá dentro conseguem chegar no HRZZ sem passar pelo Tailscale |
| 06/11/2026 | Três modos de permissão, escolhidos pelo João a qualquer momento: **Yolo** (faz tudo sem pedir, menos apagar e sair da pasta), **Mid** (meio termo) e **Intern** (pergunta tudo). Detalhes em `02-ias.md` | escolha do João |
| 06/11/2026 | Aba "progresso" no painel (feito, fazendo, a fazer), por conversa e por projeto, atualizada pela IA | pedido do João, igual ao acompanhamento que ele usa no painel do Capta Mundo |
| 06/11/2026 | Modo padrão de conversa nova: **Mid** | escolha do João |
| 06/11/2026 | **Versões só quando o João pedir** (botão "salvar versão"). Antes de cada mudança da IA, o HRZZ guarda um ponto de retorno escondido, que alimenta o botão **"desfazer última mudança"** | escolha do João (rodada 3) |
| 06/11/2026 | Editar texto no preview: mudança simples grava direto no arquivo, sem IA; se o texto aparecer em mais de um lugar, manda pro Claude | proposta aceita |
| 06/11/2026 | Dueto: o Claude coordena e chama o Gemini por uma ferramenta própria; o Gemini trabalha numa subpasta (`arte/`). Duelo: a resposta não escolhida fica guardada e recolhida; se os dois mexerem em arquivos, cada um trabalha numa cópia separada | proposta aceita |
| 06/11/2026 | Prazos: link de pitch 24 h; PIN lembrado 30 dias por aparelho; pelo PC do trabalho a sessão dura **10 h** e o terminal fica bloqueado | escolha do João |
| 06/11/2026 | Transcrição: turbo pra arquivo e YouTube, small no ao vivo; áudio original fora do backup | proposta aceita |
| 06/11/2026 | Backup diário às 03:00 em `Riizzi/hrzz-dados` (privado); mudanças no próprio HRZZ pedidas pelo chat só valem no botão "aplicar"; no PC, abre com o Windows sem janela | proposta aceita |
| 06/11/2026 | Servidor dividido: HRZZ num container próprio, sem root, com Tailscale próprio ligado só à conta do João; Claude e agy dele só ele usa | proposta aceita |
| 06/11/2026 | Projetos em qualquer pasta do PC; portas 7000, 7001 e 7100; esforço leve/médio/máximo = `low`/`high`/`max`; guardião de cota a partir de 80% sugerindo o Haiku; a IA não apaga itens de progresso criados pelo João; ordem das etapas 0 a 7 como está em `07-etapas.md` | propostas aceitas |
| 06/11/2026 | Construção automática: o `scripts/montar-tudo.ps1` constrói as etapas de uma vez, sem parar, seguindo `docs/automatico.md` | pedido do João |
| 09/11/2026 | Duas fases: **fase PC** (etapas 0 a 7, com a nova etapa 7 "fechamento no PC") e **fase hospedagem** (etapa 8). Primeiro o HRZZ 100% usável no PC, depois o servidor | pedido do João |
| 09/11/2026 | A construção automática usa **só o Claude, com o Sonnet 5.5** (plano Pro). O agy não é usado na montagem: as partes do app que usam o agy são construídas, mas o teste fica pendente | escolha do João |
| 09/11/2026 | O HRZZ só é ligado no fim da fase PC, não durante a construção | escolha do João |
| 09/11/2026 | Tailscale e acesso pelo celular ficam pra fase hospedagem | escolha do João |
| 09/11/2026 | Backup: local diário em `dados/backups/` na fase PC; no GitHub (`Riizzi/hrzz-dados`) na fase hospedagem | consequência das duas fases |

## Em aberto

- [ ] **Empresa do servidor:** sendo decidida pelo João e pelos amigos.
- [ ] **Quem é administrador (root/sudo) no servidor:** ainda não definido. Até lá, o HRZZ é feito pro pior caso (ver `05-acesso-e-seguranca.md`, "Servidor dividido").
- [ ] **Floresta de noite:** lua e estrelinhas apagadas, sim ou não. (Até decidir: sem lua.)
- [ ] **Avisos no celular:** ntfy ou Web Push. (Etapa 8, hospedagem.)
- [ ] **Domínio** pro link do trabalho e pro link de pitch. (Etapa 8, hospedagem.)

## Medições

(preencher nas etapas: tempo de resposta, velocidade da transcrição, uso de RAM)
