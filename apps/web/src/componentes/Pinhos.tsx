import { useMemo, type CSSProperties } from 'react';
import { pinhosDeCanto } from '../lib/floresta';

type Props = {
  largura: number;
  linhas: number;
  semente: number;
  style?: CSSProperties;
  className?: string;
};

// Pinheirinhos transparentes nos cantos das telas. A semente fixa mantem o desenho igual.
export default function Pinhos({ largura, linhas, semente, style, className }: Props) {
  const texto = useMemo(() => pinhosDeCanto(largura, linhas, semente), [largura, linhas, semente]);
  return (
    <pre className={`pinhos ${className ?? ''}`.trim()} style={style} aria-hidden="true">
      {texto}
    </pre>
  );
}
