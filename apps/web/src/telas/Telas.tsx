import type { ReactNode } from 'react';
import Pinhos from '../componentes/Pinhos';
import type { Saude } from '../lib/saude';
import type { TelaId } from '../tipos';
import './Telas.css';

type Base = { ativa: boolean };

function Tela({ id, ativa, children, pinhos }: { id: TelaId; ativa: boolean; children: ReactNode; pinhos: { l: number; r: number; s: number; estilo: React.CSSProperties } }) {
  return (
    <section className={`vw cx${ativa ? ' on' : ''}`} id={`v-${id}`} aria-hidden={!ativa}>
      <Pinhos largura={pinhos.l} linhas={pinhos.r} semente={pinhos.s} style={pinhos.estilo} />
      {children}
    </section>
  );
}

function Cartao({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="cardg semclique">
      <div className="cardg-titulo">{titulo}</div>
      <div className="vazio">{texto}</div>
    </div>
  );
}

export function TelaDia({ ativa }: Base) {
  return (
    <Tela id="dia" ativa={ativa} pinhos={{ l: 40, r: 8, s: 5, estilo: { bottom: 12, right: 16 } }}>
      <div className="grade-cartoes">
        <Cartao titulo="agenda" texto="liga com o conector do Google (etapa 6)" />
        <Cartao titulo="repositórios" texto="liga com o conector do GitHub (etapa 6)" />
        <Cartao titulo="pendências das conversas" texto="aparecem quando houver conversas (etapa 1)" />
        <Cartao titulo="uso" texto="uso do Claude e do agy (etapa 1)" />
      </div>
    </Tela>
  );
}

export function TelaTranscricao({ ativa }: Base) {
  return (
    <Tela id="tra" ativa={ativa} pinhos={{ l: 30, r: 7, s: 53, estilo: { bottom: 12, right: 16 } }}>
      <div className="topo-tela">
        <span className="mono titulo-tela">transcrição</span>
        <span className="tag">local, nada sai do PC</span>
      </div>
      <div className="vazio corpo-tela">arquivo, YouTube e ao vivo chegam na etapa 3.</div>
    </Tela>
  );
}

export function TelaGaleria({ ativa }: Base) {
  return (
    <Tela id="gal" ativa={ativa} pinhos={{ l: 26, r: 7, s: 41, estilo: { bottom: 12, left: 16 } }}>
      <div className="filtros">
        {['todos', 'sites', 'planilhas', 'documentos', 'artes', 'transcrições'].map((f) => (
          <span key={f} className="tag">{f}</span>
        ))}
      </div>
      <div className="vazio corpo-tela">nada na galeria ainda. Sites, planilhas e documentos criados nas conversas aparecem aqui (etapa 2).</div>
    </Tela>
  );
}

export function TelaMemoria({ ativa }: Base) {
  return (
    <Tela id="mem" ativa={ativa} pinhos={{ l: 16, r: 6, s: 77, estilo: { bottom: 12, left: 16 } }}>
      <div className="topo-tela">
        <span className="mono titulo-tela">memória</span>
      </div>
      <div className="vazio corpo-tela">os arquivos de memória ficam em dados/memoria. A edição chega na etapa 4.</div>
    </Tela>
  );
}

export function TelaSkills({ ativa }: Base) {
  return (
    <Tela id="skl" ativa={ativa} pinhos={{ l: 22, r: 7, s: 91, estilo: { bottom: 12, right: 16 } }}>
      <div className="topo-tela">
        <span className="mono titulo-tela">skills e comandos</span>
      </div>
      <div className="vazio corpo-tela">skills, comandos salvos e modelos de projeto chegam na etapa 4.</div>
    </Tela>
  );
}

export function TelaConectores({ ativa }: Base) {
  return (
    <Tela id="con" ativa={ativa} pinhos={{ l: 36, r: 8, s: 63, estilo: { bottom: 12, left: 16 } }}>
      <div className="topo-tela">
        <span className="mono titulo-tela">conectores</span>
      </div>
      <div className="vazio corpo-tela">GitHub, Google, Vercel, Cloudflare e Supabase chegam na etapa 6.</div>
    </Tela>
  );
}

type PropsAjustes = Base & {
  saude: Saude | null;
  servidorFora: boolean;
  florestaLigada: boolean;
  aoAlternarFloresta: () => void;
};

function duracao(seg: number): string {
  if (seg < 60) return `${seg} s`;
  if (seg < 3600) return `${Math.floor(seg / 60)} min`;
  return `${Math.floor(seg / 3600)} h`;
}

export function TelaAjustes({ ativa, saude, servidorFora, florestaLigada, aoAlternarFloresta }: PropsAjustes) {
  return (
    <Tela id="cfg" ativa={ativa} pinhos={{ l: 20, r: 6, s: 17, estilo: { bottom: 12, right: 16 } }}>
      <div className="grade-cartoes">
        <div>
          <div className="gr" style={{ paddingTop: 0 }}>sistema</div>
          <div className="lin">
            <span>servidor</span>
            <span className={`tag${servidorFora ? ' am' : ''}`}>{servidorFora ? 'não responde' : saude ? `ligado há ${duracao(saude.ligadoHa)}` : 'verificando'}</span>
          </div>
          <div className="lin">
            <span>versão</span>
            <span className="tag">{saude?.versao ?? '–'}</span>
          </div>
          <div className="lin">
            <span>atualizar e voltar versão</span>
            <span className="tag">etapa 1</span>
          </div>
          <div className="lin">
            <span>backup diário</span>
            <span className="tag">etapa 7</span>
          </div>
          <button className="lin clicavel linha-botao ultima" onClick={aoAlternarFloresta} aria-pressed={florestaLigada}>
            <span>floresta andando no fundo do chat</span>
            <span className="tag">{florestaLigada ? 'ligada' : 'desligada'}</span>
          </button>
        </div>
        <div>
          <div className="gr" style={{ paddingTop: 0 }}>acesso</div>
          <div className="lin">
            <span>PIN</span>
            <span className="tag">etapa 1</span>
          </div>
          <div className="lin">
            <span>celular e notebook (Tailscale)</span>
            <span className="tag">etapa 8</span>
          </div>
          <div className="lin ultima">
            <span>link do trabalho (Cloudflare)</span>
            <span className="tag">etapa 8</span>
          </div>
        </div>
      </div>
    </Tela>
  );
}
