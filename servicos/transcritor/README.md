# servicos/transcritor

Transcrição local no estilo do [alexandre-amaral/transcriber](https://github.com/alexandre-amaral/transcriber), adaptada pro Windows. Montado na etapa 3. Especificação completa em `docs/04-transcricao.md`.

## Rodar sozinho (depois da etapa 3)

```powershell
cd servicos\transcritor
uv sync
uv run python server.py
```

Abre em `http://127.0.0.1:7100` (página avulsa de teste). Dentro do HRZZ, use a tela "transcrição".

A primeira transcrição baixa o modelo (~1,5 GB) pro cache do Hugging Face.
