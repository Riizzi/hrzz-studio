# servicos/transcritor

Transcrição local no estilo do [alexandre-amaral/transcriber](https://github.com/alexandre-amaral/transcriber), adaptada pro Windows (faster-whisper, yt-dlp, WASAPI loopback). Especificação completa em `docs/04-transcricao.md`.

## Rodar sozinho

```powershell
cd servicos\transcritor
uv sync
uv run python server.py
```

Abre em `http://127.0.0.1:7100` (página avulsa de teste, sem PIN: só use na sua máquina). Dentro do HRZZ, use a tela "transcrição"; o `npm run dev` e o vigia já sobem o serviço sozinhos, com uma chave (`dados/segredos/transcritor.token`) que só o servidor do HRZZ conhece.

A primeira transcrição de cada modelo baixa o modelo pro cache do Hugging Face (turbo ~1,5 GB).

## Variáveis

Ver `docs/04-transcricao.md`, seção "Configuração".
