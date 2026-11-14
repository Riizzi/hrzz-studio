import { useEffect, useState } from 'react';
import Icone from './Icone';
import { api, urlArquivo, type Previa } from '../lib/api';

// Pre-visualizacao de um arquivo (texto, imagem, pdf, docx, planilha, html). Usada na aba "arquivos" e na galeria.
export default function VisorArquivo({ raiz, caminho, nome }: { raiz: string; caminho: string; nome: string }) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState(0);
  const [verPagina, setVerPagina] = useState(false);

  useEffect(() => {
    let vivo = true;
    setPrevia(null);
    setErro(null);
    setAba(0);
    setVerPagina(false);
    api<Previa>(`/api/arquivos/previa?raiz=${encodeURIComponent(raiz)}&caminho=${encodeURIComponent(caminho)}`)
      .then((p) => vivo && setPrevia(p))
      .catch((e: Error) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [raiz, caminho]);

  const baixar = (
    <a className="bt" href={urlArquivo(raiz, caminho, true)} download={nome}>
      <Icone n="download" /> baixar
    </a>
  );

  if (erro) return <div className="visor"><div className="erro-linha">{erro}</div></div>;
  if (!previa) return <div className="visor"><div className="vazio">abrindo…</div></div>;

  return (
    <div className="visor">
      {previa.tipo === 'imagem' && <img className="visor-img" src={urlArquivo(raiz, caminho)} alt={nome} />}
      {previa.tipo === 'pdf' && <iframe className="visor-quadro" title={nome} src={urlArquivo(raiz, caminho)} />}
      {previa.tipo === 'site' && (
        <>
          <div className="abas-planilha">
            <button className={`tag${!verPagina ? ' am' : ''}`} onClick={() => setVerPagina(false)}>código</button>
            <button className={`tag${verPagina ? ' am' : ''}`} onClick={() => setVerPagina(true)}>página</button>
          </div>
          {verPagina ? <iframe className="visor-quadro" title={nome} src={urlArquivo(raiz, caminho)} sandbox="" /> : <pre className="visor-texto mono">{previa.conteudo}</pre>}
          {!verPagina && previa.truncado && <div className="nota-visor">mostrando só o começo do arquivo.</div>}
        </>
      )}
      {previa.tipo === 'texto' && (
        <>
          <pre className="visor-texto mono">{previa.conteudo}</pre>
          {previa.truncado && <div className="nota-visor">mostrando só o começo do arquivo.</div>}
        </>
      )}
      {previa.tipo === 'documento' && (
        <iframe
          className="visor-quadro papel"
          title={nome}
          sandbox=""
          srcDoc={`<!doctype html><meta charset="utf-8"><style>body{font:14px/1.6 system-ui,sans-serif;color:#292524;background:#fff;margin:0;padding:18px 22px}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:3px 7px}h1,h2,h3{line-height:1.25}</style>${previa.html}`}
        />
      )}
      {previa.tipo === 'planilha' && (
        <>
          {previa.abas.length > 1 && (
            <div className="abas-planilha">
              {previa.abas.map((a, i) => (
                <button key={a.nome + i} className={`tag${i === aba ? ' am' : ''}`} onClick={() => setAba(i)}>
                  {a.nome}
                </button>
              ))}
            </div>
          )}
          <div className="tabela-rolagem">
            <table className="tabela-visor">
              <tbody>
                {(previa.abas[aba]?.linhas ?? []).map((l, i) => (
                  <tr key={i}>
                    <th scope="row">{i + 1}</th>
                    {l.map((c, j) => (
                      <td key={j}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {previa.abas[aba]?.truncada && <div className="nota-visor">mostrando só as primeiras linhas.</div>}
        </>
      )}
      {previa.tipo === 'sem-previa' && <div className="vazio">{previa.motivo}</div>}
      <div className="visor-pe">{baixar}</div>
    </div>
  );
}
