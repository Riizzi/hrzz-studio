import { useCallback, useEffect, useMemo, useState } from 'react';
import Icone from '../componentes/Icone';
import VisorArquivo from '../componentes/VisorArquivo';
import { Tela } from './Telas';
import './Galeria.css';
import { api, urlArquivo, type ItemGaleria, type TipoArquivo } from '../lib/api';

const FILTROS: { id: string; rotulo: string; tipos: TipoArquivo[] | null }[] = [
  { id: 'todos', rotulo: 'todos', tipos: null },
  { id: 'sites', rotulo: 'sites', tipos: ['site'] },
  { id: 'planilhas', rotulo: 'planilhas', tipos: ['planilha'] },
  { id: 'documentos', rotulo: 'documentos', tipos: ['documento', 'apresentacao'] },
  { id: 'pdf', rotulo: 'pdf', tipos: ['pdf'] },
  { id: 'artes', rotulo: 'artes', tipos: ['imagem'] },
];

const ICONES: Partial<Record<TipoArquivo, string>> = { site: 'browser', planilha: 'file-spreadsheet', documento: 'file-text', apresentacao: 'presentation', pdf: 'file-type-pdf', imagem: 'photo' };
const NOME_TIPO: Partial<Record<TipoArquivo, string>> = { site: 'site', planilha: 'planilha', documento: 'documento', apresentacao: 'slides', pdf: 'pdf', imagem: 'arte' };

function quando(ms: number): string {
  const d = new Date(ms);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return 'hoje';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
}

// Galeria: tudo que os projetos e os anexos tem de site, planilha, documento, pdf e imagem, com filtros.
export function TelaGaleria({ ativa }: { ativa: boolean }) {
  const [itens, setItens] = useState<ItemGaleria[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('todos');
  const [origem, setOrigem] = useState('todas');
  const [aberto, setAberto] = useState<ItemGaleria | null>(null);

  const carregar = useCallback(async () => {
    try {
      setItens(await api<ItemGaleria[]>('/api/galeria?atualizar=1'));
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (ativa) void carregar();
  }, [ativa, carregar]);

  const origens = useMemo(() => [...new Set((itens ?? []).map((i) => i.origem))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [itens]);
  const visiveis = useMemo(() => {
    const tipos = FILTROS.find((f) => f.id === filtro)?.tipos;
    return (itens ?? []).filter((i) => (!tipos || tipos.includes(i.tipo)) && (origem === 'todas' || i.origem === origem));
  }, [itens, filtro, origem]);

  return (
    <Tela id="gal" ativa={ativa} pinhos={{ l: 26, r: 7, s: 41, estilo: { bottom: 12, left: 16 } }}>
      <div className="filtros">
        {FILTROS.map((f) => (
          <button key={f.id} className={`tag filtro${filtro === f.id ? ' am' : ''}`} aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
            {f.rotulo}
          </button>
        ))}
        {origens.length > 1 && (
          <select className="filtro-origem" value={origem} onChange={(e) => setOrigem(e.target.value)} aria-label="Filtrar por projeto">
            <option value="todas">todos os projetos</option>
            {origens.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}
      </div>
      {erro && <div className="erro-linha">{erro}</div>}
      {itens && visiveis.length === 0 && <div className="vazio corpo-tela">nada por aqui ainda. Sites, planilhas, documentos, pdfs e imagens dos seus projetos e anexos aparecem na galeria.</div>}
      <div className="grade-galeria">
        {visiveis.map((i) => (
          <button key={i.raiz + i.caminho} className="cardg card-arquivo" onClick={() => setAberto(i)}>
            <span className="thumb">
              {i.tipo === 'imagem' ? <img src={urlArquivo(i.raiz, i.caminho)} alt="" loading="lazy" /> : <Icone n={ICONES[i.tipo] ?? 'file'} />}
            </span>
            <span className="card-nome" title={i.caminho}>
              {i.nome}
            </span>
            <span className="card-meta">
              {NOME_TIPO[i.tipo] ?? i.tipo}, {i.origem}, {quando(i.mtime)}
            </span>
          </button>
        ))}
      </div>
      {aberto && (
        <div className="visor-fundo" onClick={() => setAberto(null)}>
          <div className="cx visor-janela" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={aberto.nome}>
            <div className="visor-topo">
              <span className="mono visor-nome" title={aberto.caminho}>
                {aberto.nome}
              </span>
              <button className="ib" aria-label="Fechar" onClick={() => setAberto(null)}>
                <Icone n="x" />
              </button>
            </div>
            <VisorArquivo raiz={aberto.raiz} caminho={aberto.caminho} nome={aberto.nome} />
          </div>
        </div>
      )}
    </Tela>
  );
}
