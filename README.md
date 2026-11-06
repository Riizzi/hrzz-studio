# HRZZ STUDIO

Estúdio pessoal de IA do João Pedro, no estilo Retro Ledger escuro:

- conversa com o **Claude** (assinatura) e com o **Gemini** via `agy` (Google AI Plus), separados, em dueto ou em duelo;
- **preview** de sites, documentos e planilhas, com versões, editar texto direto, rabiscar, antes/depois e auditoria;
- terminal, arquivos, galeria, memória, skills, comandos salvos e conectores;
- **transcrição local** de arquivo, YouTube e ao vivo (microfone e áudio do PC);
- acesso pelo celular (Tailscale) e pelo PC do trabalho (Cloudflare + código por e-mail + PIN).

Protótipo navegável: abra `docs/prototipo.html` no navegador.

## Jeito rápido: um script só

No PowerShell, um comando por linha:

```powershell
git clone https://github.com/Riizzi/hrzz-studio.git "$HOME\projetos\hrzz-studio"
cd "$HOME\projetos\hrzz-studio"
powershell -ExecutionPolicy Bypass -File .\scripts\montar-tudo.ps1
```

Ele instala o que falta, confere os logins, constrói as etapas 0 a 6 sozinho (leva horas; continua de onde parou se você rodar de novo), liga o HRZZ com o Windows e abre `http://localhost:7000`. No fim, mostra o que ficou pra você fazer (`docs/pendencias-do-joao.md`).

## Como começar (passo a passo manual)

Siga o [PASSO-A-PASSO.md](PASSO-A-PASSO.md). Em resumo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\instalar.ps1
npm run checar
claude
```

Dentro do Claude Code, construa por etapas: `/etapa 0`, `/etapa 1`... (plano em `docs/07-etapas.md`).

## Comandos

| Comando | O que faz |
|---|---|
| `scripts\montar-tudo.ps1` | instala, constrói as etapas 0 a 6 sozinho e liga o HRZZ |
| `npm run dev` | sobe o HRZZ em modo desenvolvimento (a partir da etapa 0) |
| `npm run checar` | confere programas, versões e a chave de API |
| `npm run checar:login` | também testa se o `claude` e o `agy` respondem |
| `npm run testar:layout` | procura coisas vazando pelas laterais em 6 larguras de tela |
| `npm run testar:prototipo` | o mesmo teste, no protótipo |
| `scripts\iniciar.ps1 -Instalar` | abre o HRZZ sozinho quando você entra no Windows (a partir da etapa 1) |

## Documentação

`docs/01-arquitetura.md` até `docs/08-decisoes.md`. As regras pro Claude Code estão em `CLAUDE.md`.
