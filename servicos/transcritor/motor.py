"""Motor de transcricao: carrega o faster-whisper, transcreve, junta janelas do ao vivo e gera .txt/.srt.

Tudo roda local. O modelo e carregado na primeira vez que alguem pede e descarregado depois de alguns
minutos parado (o notebook tem pouca memoria).
"""
from __future__ import annotations

import os
import re
import threading
import time
import unicodedata
from dataclasses import dataclass
from typing import Callable, Optional

import numpy as np

TAXA = 16000  # Hz, o que o Whisper espera


@dataclass
class Config:
    modelo: str = os.environ.get("TRANSCRITOR_MODELO", "large-v3-turbo")
    modelo_vivo: str = os.environ.get("TRANSCRITOR_MODELO_VIVO", "small")
    dispositivo: str = os.environ.get("TRANSCRITOR_DISPOSITIVO", "auto")  # cpu, cuda ou auto
    compute: str = os.environ.get("TRANSCRITOR_COMPUTE", "int8")
    descarregar_min: float = float(os.environ.get("TRANSCRITOR_DESCARREGAR_MIN", "5"))


class Cancelado(Exception):
    """A tarefa foi cancelada pelo usuario."""


# ---------- texto ----------


def _normaliza(palavra: str) -> str:
    s = unicodedata.normalize("NFD", palavra.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^\w]", "", s)


def limpar_janela(texto: str) -> str:
    """Tira os tiques do Whisper em janelas curtas: reticencias nas pontas e a mesma palavra repetida em loop."""
    t = texto.strip()
    t = re.sub(r"^(\.{2,}|…)\s*", "", t)
    t = re.sub(r"\s*(\.{2,}|…)$", "", t)
    palavras = t.split()
    saida: list[str] = []
    for p in palavras:
        if len(saida) >= 3 and all(_normaliza(x) == _normaliza(p) for x in saida[-3:]):
            continue  # a mesma palavra uma quarta vez seguida: alucinacao
        saida.append(p)
    return " ".join(saida).strip()


def remover_repeticao(anterior: str, novo: str, max_palavras: int = 10) -> str:
    """Tira do comeco de `novo` as palavras que ja estavam no fim de `anterior` (emenda das janelas do ao vivo)."""
    a = anterior.split()
    n = novo.split()
    if not a or not n:
        return novo.strip()
    limite = min(max_palavras, len(a), len(n))
    for tam in range(limite, 0, -1):
        if [_normaliza(x) for x in a[-tam:]] == [_normaliza(x) for x in n[:tam]] and all(_normaliza(x) for x in n[:tam]):
            return " ".join(n[tam:]).strip()
    return novo.strip()


def _tempo_srt(s: float) -> str:
    ms = int(round(max(0.0, s) * 1000))
    h, ms = divmod(ms, 3600_000)
    m, ms = divmod(ms, 60_000)
    seg, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{seg:02d},{ms:03d}"


def gerar_srt(segmentos: list[dict]) -> str:
    blocos = []
    for i, s in enumerate(segmentos, 1):
        blocos.append(f"{i}\n{_tempo_srt(s['inicio'])} --> {_tempo_srt(s['fim'])}\n{s['texto'].strip()}\n")
    return "\n".join(blocos)


def tempo_curto(s: float) -> str:
    s = int(s)
    h, r = divmod(s, 3600)
    m, seg = divmod(r, 60)
    return f"{h:d}:{m:02d}:{seg:02d}" if h else f"{m:02d}:{seg:02d}"


def gerar_txt(segmentos: list[dict], com_tempo: bool = False) -> str:
    if com_tempo:
        return "\n".join(f"[{tempo_curto(s['inicio'])}] {s['texto'].strip()}" for s in segmentos) + "\n"
    return " ".join(s["texto"].strip() for s in segmentos if s["texto"].strip()) + "\n"


# ---------- modelo ----------


class Motor:
    def __init__(self, config: Optional[Config] = None):
        self.config = config or Config()
        self._modelos: dict[str, object] = {}
        self._uso: dict[str, float] = {}
        self._trava = threading.Lock()  # carregar/descarregar
        self._executando = threading.Lock()  # so uma transcricao por vez no modelo (CTranslate2 aguenta, mas a CPU nao)
        self.dispositivo_atual = "cpu"
        self.compute_atual = self.config.compute
        self._vigia = threading.Thread(target=self._descarregar_parados, daemon=True)
        self._vigia.start()

    # --- carga ---
    def _tentar(self, nome: str, dispositivo: str, compute: str):
        from faster_whisper import WhisperModel

        return WhisperModel(nome, device=dispositivo, compute_type=compute, cpu_threads=0)

    def modelo(self, nome: str):
        with self._trava:
            if nome in self._modelos:
                self._uso[nome] = time.time()
                return self._modelos[nome]
            m = None
            pedido = self.config.dispositivo
            if pedido in ("auto", "cuda"):
                try:
                    import ctranslate2

                    if ctranslate2.get_cuda_device_count() > 0:
                        m = self._tentar(nome, "cuda", "float16")
                        self.dispositivo_atual, self.compute_atual = "cuda", "float16"
                        # confere que a GPU responde de verdade (faltando cuBLAS/cuDNN o erro so aparece no primeiro uso)
                        list(m.transcribe(np.zeros(TAXA, dtype=np.float32), language="pt")[0])
                except Exception:
                    m = None
                    if pedido == "cuda":
                        raise
            if m is None:
                m = self._tentar(nome, "cpu", self.config.compute)
                self.dispositivo_atual, self.compute_atual = "cpu", self.config.compute
            self._modelos[nome] = m
            self._uso[nome] = time.time()
            return m

    def carregados(self) -> list[str]:
        with self._trava:
            return list(self._modelos)

    def descarregar_tudo(self) -> None:
        with self._trava:
            self._modelos.clear()
            self._uso.clear()
        import gc

        gc.collect()

    def _descarregar_parados(self) -> None:
        while True:
            time.sleep(30)
            limite = self.config.descarregar_min * 60
            if limite <= 0:
                continue
            with self._trava:
                parados = [n for n, t in self._uso.items() if time.time() - t > limite]
                for n in parados:
                    self._modelos.pop(n, None)
                    self._uso.pop(n, None)
            if parados and not self._executando.locked():
                import gc

                gc.collect()

    def marcar_uso(self, nome: str) -> None:
        with self._trava:
            if nome in self._uso:
                self._uso[nome] = time.time()

    # --- transcricao de arquivo ---
    def transcrever_arquivo(
        self,
        caminho: str,
        idioma: Optional[str],
        nome_modelo: Optional[str] = None,
        progresso: Optional[Callable[[float, float], None]] = None,
        cancelado: Optional[Callable[[], bool]] = None,
    ) -> dict:
        nome = nome_modelo or self.config.modelo
        m = self.modelo(nome)
        with self._executando:
            segmentos_it, info = m.transcribe(
                caminho,
                language=idioma or None,
                vad_filter=True,
                beam_size=1,
                condition_on_previous_text=False,
            )
            total = float(info.duration or 0.0)
            segs: list[dict] = []
            for seg in segmentos_it:
                if cancelado and cancelado():
                    raise Cancelado()
                texto = seg.text.strip()
                if texto:
                    segs.append({"inicio": round(seg.start, 2), "fim": round(seg.end, 2), "texto": texto})
                if progresso and total > 0:
                    progresso(min(1.0, seg.end / total), seg.end)
                self.marcar_uso(nome)
        return {"segmentos": segs, "idioma": info.language, "duracao": total, "modelo": nome}

    def transcrever_pcm(self, pcm: np.ndarray, idioma: Optional[str], nome_modelo: str) -> tuple[list[dict], Optional[str]]:
        """Janela curta do ao vivo. `pcm` em float32 mono 16 kHz."""
        m = self.modelo(nome_modelo)
        with self._executando:
            segmentos_it, info = m.transcribe(
                pcm,
                language=idioma or None,
                vad_filter=True,
                beam_size=1,
                condition_on_previous_text=False,
                without_timestamps=False,
            )
            segs = [{"inicio": s.start, "fim": s.end, "texto": s.text.strip()} for s in segmentos_it if s.text.strip()]
        return segs, info.language


# ---------- ao vivo ----------


class JanelaViva:
    """Recebe audio aos pedacos e devolve texto a cada ~4 s, com 0,5 s de sobreposicao e emenda sem repeticao."""

    def __init__(self, motor: Motor, idioma: Optional[str], modelo: str, janela_s: float = 4.0, sobreposicao_s: float = 0.5, arquivo_wav: Optional[str] = None):
        self.motor = motor
        self.idioma = idioma
        self.modelo = modelo
        self.janela = int(janela_s * TAXA)
        self.sobre = int(sobreposicao_s * TAXA)
        self.buffer = np.zeros(0, dtype=np.float32)
        self.cortado = 0  # amostras que ja sairam do buffer (pra dar o tempo certo no texto)
        self.texto_anterior = ""
        self.segmentos: list[dict] = []
        self.idioma_detectado: Optional[str] = None
        self.amostras_total = 0
        self._wav = None
        self._trava = threading.Lock()
        if arquivo_wav:
            import wave

            self._wav = wave.open(arquivo_wav, "wb")
            self._wav.setnchannels(1)
            self._wav.setsampwidth(2)
            self._wav.setframerate(TAXA)

    def entrada(self, pcm: np.ndarray) -> None:
        if len(pcm) == 0:
            return
        with self._trava:
            self.amostras_total += len(pcm)
            if self._wav is not None:
                self._wav.writeframes((np.clip(pcm, -1, 1) * 32767).astype("<i2").tobytes())
            self.buffer = np.concatenate([self.buffer, pcm])

    def fechar(self) -> None:
        with self._trava:
            if self._wav is not None:
                self._wav.close()
                self._wav = None

    def atrasado_s(self) -> float:
        return len(self.buffer) / TAXA

    def pronta(self) -> bool:
        return len(self.buffer) >= self.janela + self.sobre

    def duracao_s(self) -> float:
        return self.amostras_total / TAXA

    @staticmethod
    def _silencio(pcm: np.ndarray) -> bool:
        return float(np.sqrt(np.mean(pcm**2))) < 0.003 if len(pcm) else True

    def processar(self, final: bool = False) -> Optional[dict]:
        """Transcreve a proxima janela. Devolve {inicio, fim, texto} ou None."""
        with self._trava:
            if len(self.buffer) == 0 or (not final and not self.pronta()):
                return None
            if final:
                pedaco = self.buffer
                self.buffer = np.zeros(0, dtype=np.float32)
                base = self.cortado
                self.cortado += len(pedaco)
            else:
                pedaco = self.buffer[: self.janela + self.sobre]
                base = self.cortado
                # a proxima janela comeca na sobreposicao
                self.buffer = self.buffer[self.janela :]
                self.cortado += self.janela
        if self._silencio(pedaco) or len(pedaco) < TAXA * 0.4:
            return None
        segs, lang = self.motor.transcrever_pcm(pedaco, self.idioma, self.modelo)
        if lang and not self.idioma_detectado:
            self.idioma_detectado = lang
        texto = limpar_janela(" ".join(s["texto"] for s in segs))
        if not texto:
            return None
        texto = remover_repeticao(self.texto_anterior, texto)
        if not texto:
            return None
        self.texto_anterior = (self.texto_anterior + " " + texto).strip()[-400:]
        inicio = base / TAXA + (segs[0]["inicio"] if segs else 0)
        fim = base / TAXA + (segs[-1]["fim"] if segs else len(pedaco) / TAXA)
        item = {"inicio": round(inicio, 2), "fim": round(fim, 2), "texto": texto}
        self.segmentos.append(item)
        return item
