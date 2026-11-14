import { useCallback, useEffect, useRef, useState } from 'react';
import Icone from './Icone';
import Pinhos from './Pinhos';
import VisorArquivo from './VisorArquivo';
import { api, type EntradaArquivo, type TipoArquivo } from '../lib/api';
import type { Hrzz } from '../lib/useHrzz';

const ICONES: Record<TipoArquivo, string> = {
  pasta: 'folder',
  imagem: 'photo',
  pdf: 'file-type-pdf',
  documento: 'file-text',
  planilha: 'file-spreadsheet',
  apresentacao: 'presentation',
  site: 'browser',
  codigo: 'file-code',
  texto: 'file-text',
  outro: 'file',
};

const ROTULO: Partial<Record<TipoArquivo, string>> = { planilha: 'planilha', documento: 'documento', apresentacao: 'slides', pdf: 'pdf', imagem: 'imagem', site: 'site' };

const RECENTE_MS = 10 * 60 * 1000;

// Aba "arquivos": arvore da pasta do projeto. Clicar num arquivo abre a pre-visualizacao.
export default function Arquivos({ h, visivel }: { h: Hrzz; visivel: boolean }) {
  const raiz = h.alvoRaiz;
  const [pastas, setPastas] = useState<Record<string, EntradaArquivo[]>>({});
  const [abertas, setAbertas] = useState<Set<string>>(new Set(['']));
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<EntradaArquivo | null>(null);
  const abertasRef = useRef(abertas);
  abertasRef.current = abertas;

  const carregarPasta = useCallback(
    async (caminho: string) => {
      if (!raiz) return;
      try {
        const lista = await api<EntradaArquivo[]>(`/api/arquivos?raiz=${encodeURIComponent(raiz)}&caminho=${encodeURIComponent(caminho)}`);
        setPastas((p) => ({ ...p, [caminho]: lista }));
        setErro(null);
      } catch (e) {
        setErro((e as Error).message);
      }
    },
    [raiz],
  );

  // trocou de projeto: recomeca
  useEffect(() => {
    setPastas({});
    setAbertas(new Set(['']));
    setAberto(null);
    setErro(null);
  }, [raiz]);

  // ao ver a aba, ou quando algo mudou no projeto, recarrega as pastas abertas
  const aviso = h.avisoPreview?.n;
  useEffect(() => {
    if (!visivel || !raiz) return;
    for (const c of abertasRef.current) void carregarPasta(c);
  }, [visivel, raiz, aviso, carregarPasta]);

  const alternar = (e: EntradaArquivo) => {
    if (e.tipo !== 'pasta') return setAberto(e);
    setAbertas((a) => {
      const n = new Set(a);
      if (n.has(e.caminho)) n.delete(e.caminho);
      else {
        n.add(e.caminho);
        void carregarPasta(e.caminho);
      }
      return n;
    });
  };

  const linhas = (caminho: string, nivel: number): React.ReactNode =>
    (pastas[caminho] ?? []).map((e) => {
      const recente = e.tipo !== 'pasta' && Date.now() - e.mtime < RECENTE_MS;
      const aberta = e.tipo === 'pasta' && abertas.has(e.caminho);
      return (
        <div key={e.caminho}>
          <button className="arq-linha" style={{ paddingLeft: 4 + nivel * 14 }} onClick={() => alternar(e)} aria-expanded={e.tipo === 'pasta' ? aberta : undefined}>
            <span className="arq-nome">
              {e.tipo === 'pasta' ? <Icone n={aberta ? 'chevron-down' : 'chevron-right'} className="seta" /> : <span className="seta-vazia" />}
              <Icone n={e.tipo === 'pasta' ? (aberta ? 'folder-open' : 'folder') : ICONES[e.tipo]} />
              <span className="arq-txt">{e.nome}</span>
            </span>
            {recente ? <span className="tag am">editado</span> : ROTULO[e.tipo] ? <span className="tag">{ROTULO[e.tipo]}</span> : null}
          </button>
          {aberta && linhas(e.caminho, nivel + 1)}
        </div>
      );
    });

  if (!raiz) return <div className="vazio">abra uma conversa pra ver os arquivos da pasta dela.</div>;

  if (aberto) {
    return (
      <div className="arquivos">
        <div className="visor-topo">
          <button className="bt" onClick={() => setAberto(null)}>
            <Icone n="arrow-left" /> arquivos
          </button>
          <span className="mono visor-nome" title={aberto.caminho}>
            {aberto.caminho}
          </span>
        </div>
        <VisorArquivo raiz={raiz} caminho={aberto.caminho} nome={aberto.nome} />
      </div>
    );
  }

  const vazia = pastas[''] && pastas[''].length === 0;
  return (
    <div className="arquivos">
      {erro && <div className="erro-linha">{erro}</div>}
      {vazia && <div className="vazio">a pasta do projeto está vazia. Quando o Claude criar arquivos, eles aparecem aqui.</div>}
      <div className="arvore">{linhas('', 0)}</div>
      {!vazia && <div className="nota-visor">clique num arquivo pra abrir. Planilhas, documentos, pdf e imagens abrem em pré-visualização.</div>}
      <Pinhos largura={18} linhas={6} semente={23} style={{ bottom: 10, right: 12 }} />
    </div>
  );
}
