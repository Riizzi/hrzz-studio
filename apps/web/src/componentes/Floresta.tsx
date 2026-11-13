import { useMemo } from 'react';
import { CAMADAS_FLORESTA, cena, faixaDuplicada } from '../lib/floresta';
import './Floresta.css';

// Floresta ASCII andando no fundo do chat: tres camadas, so CSS (sem JS por quadro).
export default function Floresta() {
  const camadas = useMemo(
    () =>
      CAMADAS_FLORESTA.map((c) => ({
        ...c,
        texto: faixaDuplicada(cena(c.largura, c.linhas, [...c.nomes], c.gmin, c.gmax, c.semente, c.extras)),
      })),
    [],
  );
  return (
    <div className="floresta" aria-hidden="true">
      {camadas.map((c) => (
        <pre
          key={c.id}
          className="fl"
          style={{ bottom: c.bottom, opacity: c.opacidade, animationDuration: `${c.segundos}s` }}
        >
          {c.texto}
        </pre>
      ))}
    </div>
  );
}
