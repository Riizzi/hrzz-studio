import type { ReactNode } from 'react';
import Pinhos from '../componentes/Pinhos';
import type { TelaId } from '../tipos';
import './Telas.css';

type Base = { ativa: boolean };

export function Tela({ id, ativa, children, pinhos }: { id: TelaId; ativa: boolean; children: ReactNode; pinhos: { l: number; r: number; s: number; estilo: React.CSSProperties } }) {
  return (
    <section className={`vw cx${ativa ? ' on' : ''}`} id={`v-${id}`} aria-hidden={!ativa}>
      <Pinhos largura={pinhos.l} linhas={pinhos.r} semente={pinhos.s} style={pinhos.estilo} />
      {children}
    </section>
  );
}
