# Transcrição

Inspirada no [alexandre-amaral/transcriber](https://github.com/alexandre-amaral/transcriber), que é só pra Mac com chip Apple. Aqui é a mesma ideia adaptada pro Windows e encaixada no HRZZ.

## O que o original faz e o que muda aqui

| Original (macOS) | HRZZ (Windows) | Por quê |
|---|---|---|
| `mlx-whisper` (só Apple Silicon) | `faster-whisper` (CTranslate2) | roda em CPU Intel com `int8`, e em GPU NVIDIA se houver |
| Whisper `large-v3-turbo` | `large-v3-turbo` pra arquivos e YouTube; um modelo menor (`small`) pro ao vivo | o i7 não tem a velocidade do M5. O ao vivo precisa acompanhar a fala |
| áudio do sistema via BlackHole (driver virtual) | **WASAPI loopback** via `PyAudioWPatch` | o Windows já deixa gravar o que sai na caixa de som, sem instalar driver |
| `ffmpeg -f avfoundation` | `PyAudioWPatch` pro áudio do PC; microfone pelo navegador | `avfoundation` não existe no Windows |
| `brew install ffmpeg yt-dlp uv` | `winget install Gyan.FFmpeg yt-dlp.yt-dlp astral-sh.uv` | já está no `scripts/instalar.ps1` |
| página própria `static/index.html` | tela "transcrição" dentro do HRZZ + página avulsa opcional | integra com chat, galeria e fila |
| `npm run dev` na porta 7100 | serviço na 7100, ligado pelo `npm run dev` do HRZZ | mesma porta do original |

Fica igual ao original:

- 99 idiomas com detecção automática;
- exportação em `.txt` e `.srt`;
- ao vivo em janelas de ~4 s com 0,5 s de sobreposição, removendo palavras repetidas na emenda;
- modelo carregado uma vez e mantido na memória;
- nada sai do PC: sem nuvem e sem chave de API.

## Estrutura (mesmo espírito do original)

```
servicos/transcritor/
├── server.py          FastAPI: rotas de arquivo, YouTube e ao vivo (WebSocket)
├── motor.py           carrega o faster-whisper, transcreve, junta janelas, gera .srt
├── audio_windows.py   captura do áudio do PC (WASAPI loopback) e mistura com o microfone
├── static/index.html  página avulsa simples (opcional, igual ao original), pra testar sem o HRZZ
├── pyproject.toml     dependências (uv)
├── README.md          como rodar sozinho
└── tmp/               arquivos temporários (limpos automaticamente, ignorado pelo git)
```

## Dependências (Python 3.12, via `uv`)

`faster-whisper`, `fastapi`, `uvicorn[standard]`, `python-multipart`, `websockets`, `numpy`, `PyAudioWPatch` (só Windows: marcar com `sys_platform == "win32"`), `yt-dlp` (ou o executável do winget).

O `ffmpeg` precisa estar no PATH (winget `Gyan.FFmpeg`).

**Modelo:** confirme como a versão instalada do faster-whisper aceita o turbo. Versões recentes aceitam o nome `large-v3-turbo` direto; se não aceitar, use um repositório convertido do Hugging Face, como `deepdml/faster-whisper-large-v3-turbo-ct2`. O download (~1,5 GB) acontece na primeira vez e fica em cache em `%USERPROFILE%\.cache\huggingface`.

## Rotas

| Rota | O que faz |
|---|---|
| `GET /saude` | status, modelo carregado, dispositivo (cpu/cuda) |
| `POST /arquivo` | recebe o arquivo (multipart) + `idioma` opcional. Cria uma tarefa e devolve o `id` |
| `POST /youtube` | `{url, idioma}`. Baixa só o áudio com yt-dlp e cria a tarefa |
| `GET /tarefas/{id}` | progresso (%), tempo estimado, status |
| `GET /transcricoes` | lista as transcrições salvas |
| `GET /transcricoes/{id}.txt` / `.srt` / `.json` | downloads |
| `GET /fontes` | microfones e saídas de áudio disponíveis (pro seletor "fonte") |
| `WS /ao-vivo?fonte=microfone\|pc\|os-dois` | modo microfone: o navegador manda pedaços webm/opus. Modos pc e os-dois: o servidor captura. Volta texto parcial a cada janela |

O servidor Node repassa tudo em `/api/transcricao/*`. A tela do HRZZ nunca fala com a porta 7100 direto.

## Ao vivo: como funciona

- **Microfone:** o navegador grava com `MediaRecorder` (webm/opus) e manda pedaços pelo WebSocket. O servidor decodifica com ffmpeg pra PCM 16 kHz mono.
- **Áudio do PC:** `PyAudioWPatch` abre o dispositivo de loopback da saída padrão (o que está tocando na caixa ou no fone). Converte pra 16 kHz mono.
- **Os dois:** captura o loopback e o microfone padrão e soma as amostras com `numpy`, com limitador pra não estourar.
- **Janelas:** 4 s com 0,5 s de sobreposição. Remove a repetição na emenda comparando as últimas palavras da janela anterior com as primeiras da nova.
- **Modelo:** usa o modelo do ao vivo (`small`, configurável). Se a fila de áudio crescer (o PC não está dando conta), avisa na tela e sugere um modelo menor.
- **Gravação:** ao parar, salva a transcrição completa e oferece "refazer com o modelo grande" (roda o turbo no áudio gravado, em segundo plano).

## Integração com o HRZZ

- **Tela "transcrição"** na barra lateral, com abas arquivo / youtube / ao vivo e a lista de transcrições ao lado (layout do protótipo).
- **Fila:** transcrições longas aparecem na fila do topo com a %, e avisam no celular quando terminam.
- **Mandar pro chat:** cria uma conversa nova com a transcrição anexada e sugestões prontas ("resumo", "ata", "tópicos e encaminhamentos").
- **Comando `/ata`:** usa a última transcrição.
- **Arquivos:** ficam em `dados/transcricoes/` e entram na galeria com o filtro "transcrições".

## Configuração (variáveis de ambiente, com padrão)

| Variável | Padrão | Pra quê |
|---|---|---|
| `TRANSCRITOR_MODELO` | `large-v3-turbo` | arquivos e YouTube |
| `TRANSCRITOR_MODELO_VIVO` | `small` | ao vivo |
| `TRANSCRITOR_DISPOSITIVO` | `auto` | `cpu`, `cuda` ou `auto` |
| `TRANSCRITOR_COMPUTE` | `int8` | precisão na CPU (`float16` na GPU) |
| `TRANSCRITOR_HOST` / `TRANSCRITOR_PORTA` | `127.0.0.1` / `7100` | onde escuta |
| `TRANSCRITOR_DADOS` | `../../dados/transcricoes` | onde salva |

## Desempenho esperado (medir na etapa)

- O notebook tem 8 GB de RAM. O turbo em `int8` usa algo perto de 1,5 a 2 GB. Carregue o modelo grande só quando houver tarefa, e descarregue depois de alguns minutos parado.
- Na CPU vai ser bem mais lento que no Mac do repositório original. Na etapa 3, meça com um áudio de 5 min e anote em `08-decisoes.md` quantas vezes mais rápido que o tempo real ficou, nos modelos `small` e `turbo`.

## Se o HRZZ for pra uma VPS

Arquivo e YouTube funcionam na VPS (CPU Linux, sem `PyAudioWPatch`). O áudio do PC precisa do Windows. Por isso, deixe o endereço do transcritor configurável (`TRANSCRITOR_URL`): ele pode continuar rodando no PC e o HRZZ na VPS fala com ele pelo Tailscale.
