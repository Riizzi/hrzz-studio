import type { CSSProperties } from 'react';

// Tabler Icons (webfont). Uso: <Icone n="plus" />
export default function Icone({ n, style, className }: { n: string; style?: CSSProperties; className?: string }) {
  return <i className={`ti ti-${n}${className ? ' ' + className : ''}`} style={style} aria-hidden="true" />;
}

// Bracinho do esforco (leve, medio, maximo). SVG proprio do prototipo.
const BRACOS = [
  ['M7 5.5v8.5c0 2.2 1.3 4 3.5 4H19', 'M9.5 5.5v7.5c0 1 .6 1.5 1.5 1.5H19', 'M6.5 3.5h3.5v2H6.5z', 'M15 6.5c0 1-.6 1.6-1 2c-.4-.4-1-1-1-2a1 1 0 0 1 2 0z'],
  ['M5 4h4v3', 'M5 4v10c0 2.8 2 5 5 5h10', 'M9 7l.5 5c1.5-2.2 5.5-2.2 7 .5L20 15'],
  ['M4 3.5h4.5v3.5', 'M4 3.5v10.5c0 3 2.2 5.5 5.5 5.5H21', 'M8.5 7l.5 4c1.8-4 8.5-4.5 10.5.5L21 14', 'M15.5 3.5l1-1.5', 'M19 5l1.5-1', 'M20.5 8l1.5-.2'],
];

export function Braco({ nivel }: { nivel: 0 | 1 | 2 }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      {BRACOS[nivel].map((d) => (
        <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
