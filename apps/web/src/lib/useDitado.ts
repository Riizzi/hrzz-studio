import { useCallback, useEffect, useRef, useState } from 'react';

export type FaseDitado = 'parado' | 'gravando' | 'transcrevendo';

const LIMITE_S = 300; // um ditado de 5 minutos e o maximo; passou disso, para sozinho

// Ditado por voz do campo de texto: grava o microfone do navegador (webm/opus), manda a gravacao inteira pro
// transcritor (modelo small) e devolve o texto. Nada fica salvo na lista de transcricoes.
export function useDitado(aoTexto: (texto: string) => void) {
  const [fase, setFase] = useState<FaseDitado>('parado');
  const [segundos, setSegundos] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const gravador = useRef<MediaRecorder | null>(null);
  const fluxo = useRef<MediaStream | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const relogio = useRef<number | undefined>(undefined);
  const descartar = useRef(false);
  const aoTextoRef = useRef(aoTexto);
  aoTextoRef.current = aoTexto;

  const soltar = useCallback(() => {
    window.clearInterval(relogio.current);
    fluxo.current?.getTracks().forEach((t) => t.stop());
    fluxo.current = null;
    gravador.current = null;
  }, []);

  const enviar = useCallback(async (audio: Blob) => {
    setFase('transcrevendo');
    try {
      // o ditado e em portugues (o automatico erra em frases curtas)
      const r = await fetch(`/api/transcricao/ditado?idioma=pt`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-hrzz-midia' },
        body: audio,
        cache: 'no-store',
      });
      const corpo = (await r.json().catch(() => null)) as { texto?: string; erro?: string; detail?: unknown } | null;
      if (!r.ok) {
        const motivo = corpo?.erro ?? (typeof corpo?.detail === 'string' ? corpo.detail : `erro ${r.status}`);
        setAviso(`não consegui transcrever: ${motivo}`);
      } else if (!corpo?.texto) {
        setAviso('não ouvi fala nessa gravação.');
      } else {
        aoTextoRef.current(corpo.texto);
      }
    } catch {
      setAviso('não consegui falar com o servidor.');
    } finally {
      setFase('parado');
    }
  }, []);

  const parar = useCallback(() => {
    const rec = gravador.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  }, []);

  const cancelar = useCallback(() => {
    descartar.current = true;
    parar();
  }, [parar]);

  const comecar = useCallback(async () => {
    setAviso(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setAviso('o microfone do navegador só funciona em localhost ou https.');
      return;
    }
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      setAviso('este navegador não grava em webm/opus. Use o Chrome, o Edge ou o Firefox.');
      return;
    }
    try {
      fluxo.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setAviso('não consegui abrir o microfone. Veja se o navegador tem permissão.');
      return;
    }
    pedacos.current = [];
    descartar.current = false;
    const rec = new MediaRecorder(fluxo.current, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000 });
    rec.ondataavailable = (ev) => {
      if (ev.data.size) pedacos.current.push(ev.data);
    };
    rec.onstop = () => {
      const audio = new Blob(pedacos.current, { type: 'audio/webm' });
      pedacos.current = [];
      soltar();
      if (descartar.current || audio.size === 0) {
        setFase('parado');
        return;
      }
      void enviar(audio);
    };
    rec.start(500);
    gravador.current = rec;
    setSegundos(0);
    setFase('gravando');
    const t0 = Date.now();
    relogio.current = window.setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      setSegundos(s);
      if (s >= LIMITE_S) parar();
    }, 250);
  }, [enviar, parar, soltar]);

  // sair da tela no meio da gravacao solta o microfone
  useEffect(
    () => () => {
      descartar.current = true;
      const rec = gravador.current;
      if (rec && rec.state !== 'inactive') rec.stop();
      else soltar();
    },
    [soltar],
  );

  const alternar = useCallback(() => {
    if (fase === 'gravando') parar();
    else if (fase === 'parado') void comecar();
  }, [fase, parar, comecar]);

  return { fase, segundos, aviso, setAviso, alternar, cancelar };
}
