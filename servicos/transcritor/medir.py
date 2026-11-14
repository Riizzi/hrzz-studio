"""Mede a velocidade do transcritor neste PC: quantas vezes mais rapido que o tempo real, e a memoria usada.

Uso:  uv run python medir.py <audio> [modelo ...]      (padrao: small large-v3-turbo)
Variaveis: TRANSCRITOR_DISPOSITIVO=cpu|cuda (padrao: auto)
"""
from __future__ import annotations

import os
import sys
import time

from motor import Config, Motor


def memoria_pico_mb() -> float:
    """Pico de memoria do processo (Windows via psapi; em outros sistemas, resource)."""
    if sys.platform == "win32":
        import ctypes
        from ctypes import wintypes

        class Contadores(ctypes.Structure):
            _fields_ = [
                ("cb", wintypes.DWORD),
                ("PageFaultCount", wintypes.DWORD),
                ("PeakWorkingSetSize", ctypes.c_size_t),
                ("WorkingSetSize", ctypes.c_size_t),
                ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                ("PagefileUsage", ctypes.c_size_t),
                ("PeakPagefileUsage", ctypes.c_size_t),
            ]

        c = Contadores()
        c.cb = ctypes.sizeof(c)
        ctypes.windll.kernel32.GetCurrentProcess.restype = wintypes.HANDLE
        h = ctypes.windll.kernel32.GetCurrentProcess()
        ctypes.windll.psapi.GetProcessMemoryInfo(h, ctypes.byref(c), c.cb)
        return c.PeakWorkingSetSize / 1024 / 1024
    import resource

    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    arquivo = sys.argv[1]
    modelos = sys.argv[2:] or ["small", "large-v3-turbo"]
    for nome in modelos:
        motor = Motor(Config())
        t0 = time.time()
        motor.modelo(nome)
        carga = time.time() - t0
        t1 = time.time()
        r = motor.transcrever_arquivo(arquivo, "pt", nome)
        gasto = time.time() - t1
        dur = r["duracao"]
        print(
            f"modelo={nome} dispositivo={motor.dispositivo_atual}/{motor.compute_atual} carga={carga:.1f}s "
            f"audio={dur:.0f}s transcricao={gasto:.1f}s velocidade={dur / gasto:.1f}x pico_memoria={memoria_pico_mb():.0f}MB trechos={len(r['segmentos'])}",
            flush=True,
        )
        motor.descarregar_tudo()


if __name__ == "__main__":
    main()
