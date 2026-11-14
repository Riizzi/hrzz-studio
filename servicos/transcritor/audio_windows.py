"""Captura de audio no Windows: o que toca na caixa de som (WASAPI loopback) e o microfone, misturados se quiser.

So existe no Windows (PyAudioWPatch). Em outro sistema `disponivel()` devolve False e as funcoes avisam.
Tudo sai em float32 mono 16 kHz, o formato que o motor espera.
"""
from __future__ import annotations

import sys
import threading
import time
from typing import Optional

import numpy as np

TAXA = 16000
DISPONIVEL = sys.platform == "win32"

if DISPONIVEL:
    try:
        import pyaudiowpatch as pyaudio
    except Exception:  # biblioteca nao instalada
        pyaudio = None
        DISPONIVEL = False
else:
    pyaudio = None


def disponivel() -> bool:
    return DISPONIVEL


def _para_16k_mono(bruto: bytes, canais: int, taxa: int) -> np.ndarray:
    a = np.frombuffer(bruto, dtype=np.int16).astype(np.float32) / 32768.0
    if canais > 1:
        a = a[: (len(a) // canais) * canais].reshape(-1, canais).mean(axis=1)
    if taxa == TAXA or len(a) == 0:
        return a
    if taxa % TAXA == 0:
        f = taxa // TAXA
        a = a[: (len(a) // f) * f].reshape(-1, f).mean(axis=1)  # media = filtro simples antes de decimar
        return a.astype(np.float32)
    n_novo = int(len(a) * TAXA / taxa)
    x_novo = np.linspace(0, len(a) - 1, n_novo)
    return np.interp(x_novo, np.arange(len(a)), a).astype(np.float32)


def listar_fontes() -> dict:
    """Microfones e saidas (loopback) que o Windows enxerga."""
    if not DISPONIVEL:
        return {"disponivel": False, "microfones": [], "saidas": [], "motivo": "o áudio do PC só funciona no Windows"}
    p = pyaudio.PyAudio()
    try:
        micros, saidas = [], []
        try:
            wasapi = p.get_host_api_info_by_type(pyaudio.paWASAPI)
        except Exception:
            return {"disponivel": False, "microfones": [], "saidas": [], "motivo": "WASAPI não encontrado"}
        for i in range(p.get_device_count()):
            d = p.get_device_info_by_index(i)
            if d.get("hostApi") != wasapi["index"]:
                continue
            if d.get("isLoopbackDevice"):
                saidas.append({"indice": i, "nome": d["name"]})
            elif d.get("maxInputChannels", 0) > 0:
                micros.append({"indice": i, "nome": d["name"]})
        padrao_saida = None
        try:
            padrao_saida = p.get_default_wasapi_loopback()["name"]
        except Exception:
            pass
        return {"disponivel": True, "microfones": micros, "saidas": saidas, "saidaPadrao": padrao_saida}
    finally:
        p.terminate()


class _Entrada:
    """Um dispositivo aberto em modo callback, acumulando 16 kHz mono."""

    def __init__(self, p, info: dict):
        self.nome = info["name"]
        self.canais = max(1, int(info["maxInputChannels"]))
        self.taxa = int(info["defaultSampleRate"])
        self._pedacos: list[np.ndarray] = []
        self._trava = threading.Lock()
        self.fluxo = p.open(
            format=pyaudio.paInt16,
            channels=self.canais,
            rate=self.taxa,
            input=True,
            input_device_index=info["index"],
            frames_per_buffer=int(self.taxa * 0.1),
            stream_callback=self._callback,
        )

    def _callback(self, dados, _frames, _tempo, _estado):
        a = _para_16k_mono(dados, self.canais, self.taxa)
        with self._trava:
            self._pedacos.append(a)
        return (None, pyaudio.paContinue)

    def pegar(self) -> np.ndarray:
        with self._trava:
            if not self._pedacos:
                return np.zeros(0, dtype=np.float32)
            a = np.concatenate(self._pedacos)
            self._pedacos = []
        return a

    def fechar(self):
        try:
            self.fluxo.stop_stream()
            self.fluxo.close()
        except Exception:
            pass


class Captura:
    """fonte: 'pc' (loopback da saida padrao), 'microfone' (microfone padrao do Windows) ou 'os-dois'."""

    def __init__(self, fonte: str):
        if not DISPONIVEL:
            raise RuntimeError("o áudio do PC só funciona no Windows (PyAudioWPatch)")
        self.fonte = fonte
        self._p = pyaudio.PyAudio()
        self._entradas: list[_Entrada] = []
        self._ultimo = time.time()
        try:
            if fonte in ("pc", "os-dois"):
                self._entradas.append(_Entrada(self._p, self._loopback_padrao()))
            if fonte in ("microfone", "os-dois"):
                self._entradas.append(_Entrada(self._p, self._microfone_padrao()))
        except Exception:
            self.fechar()
            raise
        self.nomes = [e.nome for e in self._entradas]

    def _loopback_padrao(self) -> dict:
        try:
            return self._p.get_default_wasapi_loopback()
        except Exception as e:
            raise RuntimeError(f"não achei a saída de áudio padrão: {e}")

    def _microfone_padrao(self) -> dict:
        try:
            wasapi = self._p.get_host_api_info_by_type(pyaudio.paWASAPI)
            return self._p.get_device_info_by_index(wasapi["defaultInputDevice"])
        except Exception as e:
            raise RuntimeError(f"não achei o microfone padrão: {e}")

    def ler(self) -> np.ndarray:
        """Tudo o que chegou desde a ultima chamada, ja misturado."""
        partes = [e.pegar() for e in self._entradas]
        if not partes:
            return np.zeros(0, dtype=np.float32)
        n = max(len(x) for x in partes)
        if n == 0:
            return np.zeros(0, dtype=np.float32)
        soma = np.zeros(n, dtype=np.float32)
        for x in partes:
            soma[: len(x)] += x
        if len(partes) > 1:
            soma *= 0.7
        return np.clip(soma, -1.0, 1.0)  # limitador: nunca estoura

    def fechar(self):
        for e in self._entradas:
            e.fechar()
        self._entradas = []
        try:
            self._p.terminate()
        except Exception:
            pass
