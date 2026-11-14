"""Servico de transcricao do HRZZ (FastAPI, porta 7100, so em 127.0.0.1).

Rotas em docs/04-transcricao.md. O servidor Node repassa tudo em /api/transcricao/*; a interface nunca fala
com esta porta direto. Se TRANSCRITOR_TOKEN estiver definido, toda chamada precisa do cabecalho
x-hrzz-token (ou ?token=): assim outro usuario do mesmo servidor nao usa o transcritor sem passar pelo PIN do HRZZ.
"""
from __future__ import annotations

import asyncio
import hmac
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import traceback
import unicodedata
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

import audio_windows
from motor import TAXA, Cancelado, Config, JanelaViva, Motor, gerar_srt, gerar_txt

AQUI = Path(__file__).resolve().parent
HOST = os.environ.get("TRANSCRITOR_HOST", "127.0.0.1")
PORTA = int(os.environ.get("TRANSCRITOR_PORTA", "7100"))
DADOS = Path(os.environ.get("TRANSCRITOR_DADOS", str(AQUI / ".." / ".." / "dados" / "transcricoes"))).resolve()
TMP = Path(os.environ.get("TRANSCRITOR_TMP", str(AQUI / "tmp"))).resolve()
TOKEN = os.environ.get("TRANSCRITOR_TOKEN", "")

MODELOS = [
    {"id": "tiny", "nome": "tiny", "descricao": "o mais rápido, erra mais"},
    {"id": "base", "nome": "base", "descricao": "rápido"},
    {"id": "small", "nome": "small", "descricao": "equilibrado (usado no ao vivo)"},
    {"id": "medium", "nome": "medium", "descricao": "mais preciso, mais lento"},
    {"id": "large-v3-turbo", "nome": "turbo", "descricao": "o melhor para arquivos e YouTube"},
]
IDS_MODELOS = {m["id"] for m in MODELOS}

DADOS.mkdir(parents=True, exist_ok=True)
TMP.mkdir(parents=True, exist_ok=True)

config = Config()
motor = Motor(config)


def limpar_tmp() -> None:
    """Arquivos temporarios com mais de 24 h somem sozinhos."""
    limite = time.time() - 24 * 3600
    for p in TMP.iterdir():
        try:
            if p.stat().st_mtime < limite:
                shutil.rmtree(p, ignore_errors=True) if p.is_dir() else p.unlink(missing_ok=True)
        except OSError:
            pass


limpar_tmp()


# ---------- armazenamento ----------


def slug(texto: str) -> str:
    s = unicodedata.normalize("NFD", texto.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:40] or "transcricao"


def novo_id(titulo: str) -> str:
    return f"{datetime.now().strftime('%Y%m%d-%H%M%S')}-{slug(titulo)}"


def id_valido(i: str) -> bool:
    return bool(re.fullmatch(r"[a-z0-9][a-z0-9\-]{0,80}", i))


def escrever_atomico(caminho: Path, texto: str) -> None:
    tmp = caminho.with_suffix(caminho.suffix + ".tmp")
    tmp.write_text(texto, encoding="utf-8")
    os.replace(tmp, caminho)


def salvar(id_: str, meta: dict, segmentos: list[dict]) -> dict:
    meta = {**meta, "id": id_, "segmentos": segmentos}
    escrever_atomico(DADOS / f"{id_}.json", json.dumps(meta, ensure_ascii=False))
    escrever_atomico(DADOS / f"{id_}.txt", f"{meta['titulo']}\n\n" + gerar_txt(segmentos))
    escrever_atomico(DADOS / f"{id_}.srt", gerar_srt(segmentos))
    return meta


def ler(id_: str) -> Optional[dict]:
    if not id_valido(id_):
        return None
    p = DADOS / f"{id_}.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def resumo(meta: dict) -> dict:
    return {k: v for k, v in meta.items() if k != "segmentos"} | {"palavras": sum(len(s["texto"].split()) for s in meta.get("segmentos", []))}


def listar() -> list[dict]:
    itens = []
    for p in DADOS.glob("*.json"):
        m = ler(p.stem)
        if m:
            itens.append(resumo(m))
    return sorted(itens, key=lambda m: m.get("criada", ""), reverse=True)


# ---------- tarefas ----------


@dataclass
class Tarefa:
    id: str
    tipo: str  # arquivo, youtube, refazer
    titulo: str
    idioma: Optional[str]
    modelo: str
    status: str = "fila"  # fila, baixando, transcrevendo, pronta, erro, cancelada
    pct: float = 0.0
    eta_s: Optional[int] = None
    erro: Optional[str] = None
    transcricao_id: Optional[str] = None
    criada: float = field(default_factory=time.time)
    terminou: Optional[float] = None
    arquivo: Optional[str] = field(default=None, repr=False)
    url: Optional[str] = field(default=None, repr=False)
    refazer_id: Optional[str] = field(default=None, repr=False)
    cancelar: bool = field(default=False, repr=False)

    def publico(self) -> dict:
        d = asdict(self)
        for k in ("arquivo", "url", "refazer_id", "cancelar"):
            d.pop(k, None)
        d["pct"] = round(self.pct * 100, 1)
        return d


class Fila:
    def __init__(self):
        self.tarefas: dict[str, Tarefa] = {}
        self._ordem: list[str] = []
        self._cond = threading.Condition()
        self._thread = threading.Thread(target=self._trabalhar, daemon=True)
        self._thread.start()

    def adicionar(self, t: Tarefa) -> Tarefa:
        with self._cond:
            self.tarefas[t.id] = t
            self._ordem.append(t.id)
            self._cond.notify()
        return t

    def recentes(self) -> list[dict]:
        agora = time.time()
        with self._cond:
            ts = [t for t in self.tarefas.values() if t.terminou is None or agora - t.terminou < 3600]
        return [t.publico() for t in sorted(ts, key=lambda t: t.criada, reverse=True)]

    def _proxima(self) -> Tarefa:
        with self._cond:
            while True:
                for i in self._ordem:
                    t = self.tarefas[i]
                    if t.status == "fila":
                        t.status = "transcrevendo"
                        return t
                self._cond.wait(timeout=5)

    def _trabalhar(self):
        while True:
            t = self._proxima()
            try:
                if t.cancelar:
                    raise Cancelado()
                self._rodar(t)
                t.status, t.pct, t.eta_s = "pronta", 1.0, 0
            except Cancelado:
                t.status = "cancelada"
            except Exception as e:  # noqa: BLE001 - qualquer falha vira mensagem pra tela
                t.status = "erro"
                t.erro = str(e)[:400] or e.__class__.__name__
                traceback.print_exc()
            finally:
                t.terminou = time.time()
                if t.arquivo and t.tipo != "refazer":
                    shutil.rmtree(Path(t.arquivo).parent, ignore_errors=True)

    def _rodar(self, t: Tarefa):
        caminho = t.arquivo
        if t.tipo == "youtube":
            t.status = "baixando"
            caminho, titulo_video = baixar_audio(t, TMP / t.id)
            t.arquivo = caminho
            if titulo_video and t.titulo.startswith("http"):
                t.titulo = titulo_video
            t.status = "transcrevendo"
        inicio = time.time()

        def progresso(frac: float, _s: float):
            t.pct = 0.1 + 0.9 * frac if t.tipo == "youtube" else frac
            gasto = time.time() - inicio
            t.eta_s = int(gasto / frac * (1 - frac)) if frac > 0.02 else None

        r = motor.transcrever_arquivo(caminho, t.idioma, t.modelo, progresso, lambda: t.cancelar)
        if not r["segmentos"]:
            raise RuntimeError("não ouvi fala nesse áudio")
        if t.tipo == "refazer" and t.refazer_id:
            antigo = ler(t.refazer_id) or {}
            meta = {**antigo, "modelo": r["modelo"], "idioma": r["idioma"], "duracao": r["duracao"], "refeita": True}
            salvar(t.refazer_id, meta, r["segmentos"])
            t.transcricao_id = t.refazer_id
            return
        id_ = novo_id(t.titulo)
        meta = {
            "titulo": t.titulo,
            "origem": "youtube" if t.tipo == "youtube" else "arquivo",
            "url": t.url,
            "idioma": r["idioma"],
            "modelo": r["modelo"],
            "duracao": r["duracao"],
            "criada": datetime.now().isoformat(timespec="seconds"),
        }
        salvar(id_, meta, r["segmentos"])
        t.transcricao_id = id_


def baixar_audio(t: Tarefa, pasta: Path) -> tuple[str, Optional[str]]:
    import yt_dlp

    pasta.mkdir(parents=True, exist_ok=True)

    def gancho(d: dict):
        if t.cancelar:
            raise Cancelado()
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            if total:
                t.pct = 0.1 * (d.get("downloaded_bytes", 0) / total)

    opcoes = {
        "format": "bestaudio/best",
        "outtmpl": str(pasta / "audio.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "progress_hooks": [gancho],
        "socket_timeout": 30,
        "retries": 3,
    }
    try:
        with yt_dlp.YoutubeDL(opcoes) as y:
            info = y.extract_info(t.url, download=True)
    except Cancelado:
        raise
    except Exception as e:
        msg = re.sub(r"\x1b\[[0-9;]*m", "", str(e))
        raise RuntimeError(f"o yt-dlp não conseguiu baixar: {msg[-300:]}")
    arquivos = [p for p in pasta.iterdir() if p.is_file() and not p.name.endswith((".part", ".ytdl"))]
    if not arquivos:
        raise RuntimeError("o yt-dlp não baixou nenhum áudio")
    return str(max(arquivos, key=lambda p: p.stat().st_size)), (info or {}).get("title")


fila = Fila()


# ---------- app ----------

app = FastAPI(title="hrzz-transcritor", docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def conferir_token(request: Request, call_next):
    if TOKEN and request.url.path != "/saude":
        dado = request.headers.get("x-hrzz-token") or request.query_params.get("token") or ""
        if not hmac.compare_digest(dado, TOKEN):
            return JSONResponse({"erro": "sem permissão"}, status_code=401)
    return await call_next(request)


def idioma_ok(v: Optional[str]) -> Optional[str]:
    if not v or v in ("auto", "automatico"):
        return None
    if not re.fullmatch(r"[a-z]{2,3}", v):
        raise HTTPException(400, "idioma inválido (use o código, como pt, en, es)")
    return v


def modelo_ok(v: Optional[str], padrao: str) -> str:
    v = v or padrao
    if v == "turbo":
        v = "large-v3-turbo"
    if v not in IDS_MODELOS:
        raise HTTPException(400, f"modelo desconhecido: {v}")
    return v


@app.get("/saude")
async def saude():
    return {
        "ok": True,
        "modelo": config.modelo,
        "modeloVivo": config.modelo_vivo,
        "carregados": motor.carregados(),
        "dispositivo": motor.dispositivo_atual,
        "compute": motor.compute_atual,
        "dispositivoPedido": config.dispositivo,
        "audioDoPc": audio_windows.disponivel(),
        "ffmpeg": shutil.which("ffmpeg") is not None,
        "tarefasAtivas": len([t for t in fila.tarefas.values() if t.terminou is None]),
    }


@app.get("/modelos")
async def modelos():
    return {"modelos": MODELOS, "padrao": "large-v3-turbo" if config.modelo == "turbo" else config.modelo, "vivo": config.modelo_vivo}


@app.get("/fontes")
async def fontes():
    f = await asyncio.to_thread(audio_windows.listar_fontes)
    return {**f, "navegador": True}


async def guardar_corpo(request: Request, destino: Path) -> int:
    total = 0
    destino.parent.mkdir(parents=True, exist_ok=True)
    with open(destino, "wb") as f:
        async for pedaco in request.stream():
            total += len(pedaco)
            f.write(pedaco)
    return total


@app.post("/arquivo")
async def enviar_arquivo(request: Request, nome: str = "audio", idioma: Optional[str] = None, modelo: Optional[str] = None, titulo: Optional[str] = None):
    """Corpo = os bytes do arquivo (sem multipart: assim um video grande passa em fluxo, sem ficar na memoria)."""
    idioma, modelo = idioma_ok(idioma), modelo_ok(modelo, config.modelo)
    limpo = re.sub(r"[^\w.\- ()]", "_", Path(nome).name)[:100] or "audio"
    tid = uuid.uuid4().hex[:10]
    destino = TMP / tid / limpo
    total = await guardar_corpo(request, destino)
    if total == 0:
        shutil.rmtree(destino.parent, ignore_errors=True)
        raise HTTPException(400, "arquivo vazio")
    nome_titulo = (titulo or Path(limpo).stem).strip()[:120] or "transcrição"
    t = fila.adicionar(Tarefa(id=tid, tipo="arquivo", titulo=nome_titulo, idioma=idioma, modelo=modelo, arquivo=str(destino)))
    return t.publico()


@app.post("/youtube")
async def youtube(request: Request):
    corpo = await request.json()
    url = str(corpo.get("url", "")).strip()
    if not re.match(r"^https?://", url):
        raise HTTPException(400, "cole o link completo, começando com https://")
    idioma, modelo = idioma_ok(corpo.get("idioma")), modelo_ok(corpo.get("modelo"), config.modelo)
    t = fila.adicionar(Tarefa(id=uuid.uuid4().hex[:10], tipo="youtube", titulo=url, idioma=idioma, modelo=modelo, url=url))
    return t.publico()


@app.get("/tarefas")
async def tarefas():
    return fila.recentes()


@app.get("/tarefas/{tid}")
async def tarefa(tid: str):
    t = fila.tarefas.get(tid)
    if not t:
        raise HTTPException(404, "tarefa não encontrada")
    return t.publico()


@app.post("/tarefas/{tid}/cancelar")
async def cancelar(tid: str):
    t = fila.tarefas.get(tid)
    if not t:
        raise HTTPException(404, "tarefa não encontrada")
    t.cancelar = True
    if t.status == "fila":
        t.status, t.terminou = "cancelada", time.time()
    return t.publico()


@app.get("/transcricoes")
async def transcricoes():
    return await asyncio.to_thread(listar)


@app.get("/transcricoes/{nome}")
async def baixar(nome: str):
    m = re.fullmatch(r"([a-z0-9\-]+)\.(txt|srt|json)", nome)
    if not m or not id_valido(m.group(1)):
        raise HTTPException(404, "não achei")
    meta = ler(m.group(1))
    if not meta:
        raise HTTPException(404, "transcrição não encontrada")
    caminho = DADOS / nome
    if not caminho.exists():
        raise HTTPException(404, "arquivo não encontrado")
    tipo = {"txt": "text/plain; charset=utf-8", "srt": "application/x-subrip; charset=utf-8", "json": "application/json"}[m.group(2)]
    return FileResponse(caminho, media_type=tipo, filename=f"{slug(meta['titulo'])}.{m.group(2)}")


@app.patch("/transcricoes/{id_}")
async def renomear(id_: str, request: Request):
    meta = ler(id_)
    if not meta:
        raise HTTPException(404, "transcrição não encontrada")
    titulo = str((await request.json()).get("titulo", "")).strip()[:120]
    if not titulo:
        raise HTTPException(400, "dê um título")
    meta["titulo"] = titulo
    segs = meta.pop("segmentos")
    return resumo(salvar(id_, meta, segs))


@app.delete("/transcricoes/{id_}")
async def apagar(id_: str):
    if not ler(id_):
        raise HTTPException(404, "transcrição não encontrada")
    for ext in ("json", "txt", "srt"):
        (DADOS / f"{id_}.{ext}").unlink(missing_ok=True)
    (TMP / f"vivo-{id_}.wav").unlink(missing_ok=True)
    return {"ok": True}


@app.post("/transcricoes/{id_}/refazer")
async def refazer(id_: str, request: Request):
    meta = ler(id_)
    wav = TMP / f"vivo-{id_}.wav"
    if not meta or not wav.exists():
        raise HTTPException(404, "o áudio gravado dessa transcrição não existe mais (fica por 24 h)")
    try:
        corpo = await request.json()
    except ValueError:
        corpo = {}
    modelo = modelo_ok(corpo.get("modelo"), config.modelo)
    t = fila.adicionar(Tarefa(id=uuid.uuid4().hex[:10], tipo="refazer", titulo=meta["titulo"], idioma=meta.get("idioma"), modelo=modelo, arquivo=str(wav), refazer_id=id_))
    return t.publico()


# ---------- ao vivo ----------


class DecodificadorWebm:
    """ffmpeg lendo o fluxo contínuo do MediaRecorder (webm/opus) e devolvendo PCM 16 kHz mono."""

    def __init__(self, janela: JanelaViva):
        ff = shutil.which("ffmpeg")
        if not ff:
            raise RuntimeError("o ffmpeg não está no PATH (winget install Gyan.FFmpeg)")
        self.janela = janela
        self.proc = subprocess.Popen(
            [ff, "-hide_banner", "-loglevel", "error", "-fflags", "+nobuffer", "-i", "pipe:0", "-f", "s16le", "-ac", "1", "-ar", str(TAXA), "pipe:1"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        self._t = threading.Thread(target=self._ler, daemon=True)
        self._t.start()

    def _ler(self):
        resto = b""
        while True:
            dado = self.proc.stdout.read(3200)
            if not dado:
                break
            dado = resto + dado
            n = len(dado) // 2 * 2
            resto = dado[n:]
            self.janela.entrada(np.frombuffer(dado[:n], dtype="<i2").astype(np.float32) / 32768.0)

    def escrever(self, bruto: bytes):
        try:
            self.proc.stdin.write(bruto)
            self.proc.stdin.flush()
        except (BrokenPipeError, OSError):
            pass

    def encerrar(self):
        try:
            self.proc.stdin.close()
        except OSError:
            pass
        self._t.join(timeout=10)
        try:
            self.proc.kill()
        except OSError:
            pass


@app.websocket("/ao-vivo")
async def ao_vivo(ws: WebSocket):
    if TOKEN and not hmac.compare_digest(ws.headers.get("x-hrzz-token") or ws.query_params.get("token") or "", TOKEN):
        await ws.close(code=1008)
        return
    await ws.accept()
    q = ws.query_params
    fonte = q.get("fonte", "microfone")
    if fonte not in ("microfone", "pc", "os-dois", "navegador"):
        await ws.send_json({"tipo": "erro", "texto": "fonte desconhecida"})
        return await ws.close()
    try:
        idioma = idioma_ok(q.get("idioma"))
        modelo = modelo_ok(q.get("modelo"), config.modelo_vivo)
    except HTTPException as e:
        await ws.send_json({"tipo": "erro", "texto": e.detail})
        return await ws.close()

    loop = asyncio.get_running_loop()
    saida: asyncio.Queue = asyncio.Queue()
    sessao = datetime.now()
    id_ = novo_id(f"ao vivo {sessao.strftime('%d-%m %H-%M')}")
    wav = TMP / f"vivo-{id_}.wav"
    janela = JanelaViva(motor, idioma, modelo, arquivo_wav=str(wav))
    parar = threading.Event()  # pediram pra parar de gravar
    terminou = threading.Event()  # o trabalhador acabou de processar tudo

    # de onde vem o audio
    decod: Optional[DecodificadorWebm] = None
    captura = None
    try:
        if fonte in ("microfone", "navegador"):
            decod = await asyncio.to_thread(DecodificadorWebm, janela)
        else:
            captura = await asyncio.to_thread(audio_windows.Captura, fonte)
    except Exception as e:  # noqa: BLE001
        await ws.send_json({"tipo": "erro", "texto": str(e)})
        janela.fechar()
        wav.unlink(missing_ok=True)
        return await ws.close()

    def captar():
        while not parar.is_set():
            time.sleep(0.2)
            janela.entrada(captura.ler())

    def trabalhar():
        ultimo_aviso = 0.0
        try:
            # carrega o modelo antes de comecar, avisando a tela
            loop.call_soon_threadsafe(saida.put_nowait, {"tipo": "carregando", "modelo": modelo})
            motor.modelo(modelo)
            loop.call_soon_threadsafe(saida.put_nowait, {"tipo": "pronto", "dispositivo": motor.dispositivo_atual})
            if captura:  # o audio do PC so comeca a ser lido com o modelo pronto
                threading.Thread(target=captar, daemon=True).start()
            while True:
                if janela.pronta():
                    atraso = janela.atrasado_s()
                    if atraso > 12 and time.time() - ultimo_aviso > 30:
                        ultimo_aviso = time.time()
                        loop.call_soon_threadsafe(
                            saida.put_nowait,
                            {"tipo": "aviso", "texto": "o PC não está acompanhando a fala. Troque pra um modelo menor (tiny ou base) ou grave de novo."},
                        )
                    item = janela.processar()
                    if item:
                        loop.call_soon_threadsafe(saida.put_nowait, {"tipo": "texto", **item})
                elif parar.is_set():
                    break
                else:
                    time.sleep(0.1)
            item = janela.processar(final=True)
            if item:
                loop.call_soon_threadsafe(saida.put_nowait, {"tipo": "texto", **item})
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            loop.call_soon_threadsafe(saida.put_nowait, {"tipo": "erro", "texto": f"falha na transcrição: {e}"[:300]})
        finally:
            terminou.set()
            loop.call_soon_threadsafe(saida.put_nowait, None)

    threading.Thread(target=trabalhar, daemon=True).start()

    async def enviar_saida():
        while True:
            m = await saida.get()
            if m is None:
                return
            try:
                await ws.send_json(m)
            except Exception:  # noqa: BLE001 - cliente saiu
                return

    enviador = asyncio.create_task(enviar_saida())
    try:
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            if msg.get("bytes") is not None and decod:
                await asyncio.to_thread(decod.escrever, msg["bytes"])
            elif msg.get("text") is not None:
                if msg["text"].strip() in ("parar", "stop"):
                    break
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        pass
    finally:
        # para a captura, deixa o decodificador esvaziar e o trabalhador terminar a ultima janela
        parar.set()
        if decod:
            await asyncio.to_thread(decod.encerrar)
        if captura:
            await asyncio.sleep(0.3)
            janela.entrada(captura.ler())
            await asyncio.to_thread(captura.fechar)
        await asyncio.to_thread(terminou.wait, 180)
        janela.fechar()
        titulo = f"ao vivo, {sessao.strftime('%d/%m %H:%M')}"
        id_final = None
        if janela.segmentos:
            meta = {
                "titulo": titulo,
                "origem": "ao-vivo",
                "fonte": fonte,
                "idioma": janela.idioma_detectado or idioma,
                "modelo": modelo,
                "duracao": round(janela.duracao_s(), 1),
                "criada": sessao.isoformat(timespec="seconds"),
                "audioGravado": True,
            }
            salvar(id_, meta, janela.segmentos)
            id_final = id_
        else:
            wav.unlink(missing_ok=True)
        try:
            await enviador
        except Exception:  # noqa: BLE001
            pass
        try:
            await ws.send_json({"tipo": "fim", "id": id_final, "titulo": titulo if id_final else None})
            await ws.close()
        except Exception:  # noqa: BLE001
            pass


# ---------- pagina avulsa ----------


@app.get("/", response_class=HTMLResponse)
async def pagina():
    arq = AQUI / "static" / "index.html"
    if not arq.exists():
        raise HTTPException(404, "página avulsa não encontrada")
    return HTMLResponse(arq.read_text(encoding="utf-8"))


if __name__ == "__main__":
    import uvicorn

    print(f"transcritor em http://{HOST}:{PORTA}", flush=True)
    uvicorn.run(app, host=HOST, port=PORTA, log_level="warning")
