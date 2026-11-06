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
| 29/10/2026 | Painel da direita minimiza, abre por completo e abre sozinho com versão nova | pedido do João |
| 02/11/2026 | Claude pelo **binário oficial `claude` em modo headless**, não pelo Agent SDK com login de assinatura | regra da Anthropic sobre credenciais de assinatura (ver `02-ias.md`) |
| 02/11/2026 | Seção de transcrição no estilo do `alexandre-amaral/transcriber`, adaptada pro Windows (faster-whisper + WASAPI) | pedido do João |
| 02/11/2026 | O João constrói pelo terminal, com o Claude Code local seguindo `CLAUDE.md` e `/etapa N` | pedido do João |
| 06/11/2026 | Tecnologias aprovadas: Node + TypeScript (Fastify), React + Vite, SQLite, transcrição em Python | João aprovou a proposta P1 |
| 06/11/2026 | Modelo de conversa nova: **o HRZZ escolhe** pelo tipo de pedido (as regras da escolha ainda vão ser combinadas) | escolha do João |
| 06/11/2026 | Modo **Mid**: faz tudo (edita, roda comandos, instala pacotes), menos apagar, sair da pasta e push, que perguntam | escolha do João |
| 06/11/2026 | Modo **Yolo**: tudo liberado, inclusive push; só apagar e sair da pasta perguntam | escolha do João |
| 06/11/2026 | Seletor de modo no **topo do chat**, junto do dueto, duelo e painel | escolha do João |
| 06/11/2026 | O HRZZ vai rodar num **servidor robusto dividido com amigos** (empresa ainda em escolha). Cada um hospeda os próprios projetos e ferramentas lá; o HRZZ é só do João | decisão do João |
| 06/11/2026 | **PIN sempre**, em qualquer caminho (inclusive Tailscale), lembrado por um tempo em cada aparelho | servidor dividido: outras pessoas lá dentro conseguem chegar no HRZZ sem passar pelo Tailscale |
| 06/11/2026 | Três modos de permissão, escolhidos pelo João a qualquer momento: **Yolo** (faz tudo sem pedir, menos apagar e sair da pasta), **Mid** (meio termo) e **Intern** (pergunta tudo). Detalhes em `02-ias.md` | escolha do João |
| 06/11/2026 | Aba "progresso" no painel (feito, fazendo, a fazer), por conversa e por projeto, atualizada pela IA | pedido do João, igual ao acompanhamento que ele usa no painel do Capta Mundo |

## Propostas do Claude, a confirmar com o João

Estas escolhas foram escritas nos docs como ponto de partida, mas **o João ainda não aprovou**. Antes de implementar qualquer uma, pergunte em múltipla escolha e mova pra "Decididas".

**Base técnica**
- [ ] P2. Projetos podem ficar em qualquer pasta do PC (o HRZZ só guarda o caminho), além de `dados/projetos/`
- [ ] P3. Portas: 7000 (app), 7001 (dev), 7100 (transcrição)

**IAs**
- [ ] P4. Esforço: leve = `low`, médio = `high`, máximo = `max`
- [ ] P5. Dueto: o Claude coordena e chama o Gemini por uma ferramenta própria; o Gemini trabalha numa subpasta (`arte/`), como no Illuminati
- [ ] P6. Duelo: a resposta não escolhida fica guardada e recolhida; se os dois mexerem em arquivos, cada um trabalha numa cópia separada
- [ ] P8. Guardião de cota avisa a partir de 80% e sugere o Haiku

**Preview e versões**
- [ ] P9. Cada mudança vira uma versão (commit numa branch separada do projeto, `hrzz/versoes`)
- [ ] P10. Editar texto no preview: mudança simples grava direto no arquivo sem gastar IA; se o texto aparecer em mais de um lugar, manda pro Claude
- [ ] P11. Link de pitch vale 24 h

**Transcrição**
- [ ] P12. Modelo grande (turbo) pra arquivo e YouTube, modelo pequeno (small) pro ao vivo
- [ ] P13. O áudio original fica fora do backup, só o texto vai

**Acesso**
- [ ] P14. PIN lembrado por 30 dias em cada aparelho (o PIN em si já é decidido: sempre); pelo PC do trabalho a sessão dura 8 h e o terminal fica bloqueado

**Atualização e backup**
- [ ] P15. Backup diário às 03:00 num repositório privado separado (`Riizzi/hrzz-dados`)
- [ ] P16. Mudanças no próprio HRZZ pedidas pelo chat ficam numa branch e só valem quando você clicar em "aplicar"
- [ ] P17. Abrir com o Windows pelo Agendador de Tarefas, sem janela

**Progresso**
- [ ] P18. A IA não apaga itens que você criou, só sugere marcar como feito

**Servidor dividido**
- [ ] P20. O HRZZ roda isolado num container próprio (Docker ou Podman) com usuário sem root, os dados num volume só dele e um Tailscale próprio dentro do container, ligado só à conta do João
- [ ] P21. Ninguém além do João usa o Claude e o agy dele pelo HRZZ (os logins ficam dentro do container do HRZZ)

**Ordem das etapas**
- [ ] P19. 0 fundação, 1 conversa, 2 preview, 3 transcrição, 4 acervo, 5 IA junta, 6 integrações, 7 fora de casa

## Em aberto

- [ ] **Empresa do servidor:** sendo decidida pelo João e pelos amigos.
- [ ] **Quem é administrador (root/sudo) no servidor:** ainda não definido. Até lá, o HRZZ é feito pro pior caso (ver `05-acesso-e-seguranca.md`, "Servidor dividido").
- [ ] **Regras da escolha automática de modelo:** que tipo de pedido vai pra qual modelo, e se aparece um aviso de qual foi escolhido.
- [ ] **Modo padrão** de uma conversa nova (Yolo, Mid ou Intern).
- [ ] **Floresta de noite:** lua e estrelinhas apagadas, sim ou não.
- [ ] **Avisos no celular:** ntfy ou Web Push.
- [ ] **Domínio** pro link do trabalho e pro link de pitch.

## Medições

(preencher nas etapas: tempo de resposta, velocidade da transcrição, uso de RAM)
