import { useEffect, useState } from 'react';

export type Saude = {
  ok: boolean;
  nome: string;
  versao: string;
  sistema: string;
  node: string;
  ligadoHa: number;
};

// Pergunta ao servidor se ele esta de pe (/api/saude) a cada 10 s.
export function useSaude(): { saude: Saude | null; fora: boolean } {
  const [saude, setSaude] = useState<Saude | null>(null);
  const [fora, setFora] = useState(false);

  useEffect(() => {
    let vivo = true;
    const checar = async () => {
      try {
        const r = await fetch('/api/saude', { cache: 'no-store' });
        if (!r.ok) throw new Error(String(r.status));
        const dados = (await r.json()) as Saude;
        if (vivo) {
          setSaude(dados);
          setFora(false);
        }
      } catch {
        if (vivo) setFora(true);
      }
    };
    void checar();
    const t = setInterval(checar, 10000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);

  return { saude, fora };
}
