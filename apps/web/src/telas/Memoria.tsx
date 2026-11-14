import { useCallback, useEffect, useRef, useState } from 'react';
import Icone from '../componentes/Icone';
import { Tela } from './Telas';
import { api, type ListaMemoria } from '../lib/api';
import './Acervo.css';

const NOME_RE = /^[\p{L}\p{N}_-]+(\/[\p{L}\p{N}_-]+){0,2}$/u;

function kb(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
}

// Memoria: os arquivos .md que a IA le no comeco de toda conversa (dados/memoria).
export function TelaMemoria({ ativa }: { ativa: boolean }) {
  const [lista, setLista] = useState<ListaMemoria | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [original, setOriginal] = useState('');
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [importando, setImportando] = useState(false);
  const [textoImportado, setTextoImportado] = useState('');
  const [dividir, setDividir] = useState(true);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const arquivoInput = useRef<HTMLInputElement>(null);

  const sujo = aberto !== null && texto !== original;
  const falha = (e: unknown) => setAviso({ tipo: 'erro', texto: (e as Error).message });

  const carregar = useCallback(async () => {
    try {
      setLista(await api<ListaMemoria>('/api/memoria'));
    } catch (e) {
      falha(e);
    }
  }, []);

  useEffect(() => {
    if (ativa) void carregar();
  }, [ativa, carregar]);

  const abrir = async (nome: string) => {
    if (sujo && !window.confirm('Descartar as mudanças não salvas?')) return;
    try {
      const r = await api<{ conteudo: string }>(`/api/memoria/arquivo?nome=${encodeURIComponent(nome)}`);
      setAberto(nome);
      setTexto(r.conteudo);
      setOriginal(r.conteudo);
      setCriando(false);
      setImportando(false);
      setAviso(null);
    } catch (e) {
      falha(e);
    }
  };

  const salvar = async () => {
    if (!aberto) return;
    try {
      await api('/api/memoria/arquivo', { metodo: 'PUT', corpo: { nome: aberto, conteudo: texto } });
      setOriginal(texto);
      setAviso({ tipo: 'ok', texto: 'salvo. A IA lê na próxima mensagem.' });
      await carregar();
    } catch (e) {
      falha(e);
    }
  };

  const apagar = async () => {
    if (!aberto || !window.confirm(`Apagar ${aberto}.md? Não dá pra desfazer.`)) return;
    try {
      await api(`/api/memoria/arquivo?nome=${encodeURIComponent(aberto)}`, { metodo: 'DELETE' });
      setAberto(null);
      setTexto('');
      setOriginal('');
      setAviso({ tipo: 'ok', texto: 'arquivo apagado.' });
      await carregar();
    } catch (e) {
      falha(e);
    }
  };

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    const nome = novoNome.trim().replace(/\.md$/i, '');
    if (!NOME_RE.test(nome)) return setAviso({ tipo: 'erro', texto: 'nome inválido: use letras, números, - e _ (e / pra subpasta, ex.: areas/hrzz)' });
    if (lista?.arquivos.some((a) => a.nome === nome)) return setAviso({ tipo: 'erro', texto: 'já existe um arquivo com esse nome' });
    try {
      await api('/api/memoria/arquivo', { metodo: 'PUT', corpo: { nome, conteudo: `# ${nome.split('/').pop()}\n\n` } });
      setNovoNome('');
      setCriando(false);
      await carregar();
      await abrir(nome);
    } catch (e2) {
      falha(e2);
    }
  };

  const importar = async () => {
    try {
      const r = await api<{ criados: string[] }>('/api/memoria/importar', { corpo: { texto: textoImportado, dividir } });
      setTextoImportado('');
      setImportando(false);
      setAviso({ tipo: 'ok', texto: `importado: ${r.criados.join(', ')}` });
      await carregar();
      if (r.criados[0]) await abrir(r.criados[0]);
    } catch (e) {
      falha(e);
    }
  };

  const lerArquivoLocal = async (f: File) => {
    if (f.size > 1024 * 1024) return setAviso({ tipo: 'erro', texto: `${f.name} passa de 1 MB` });
    setTextoImportado(await f.text());
  };

  const acima = !!lista && lista.total > lista.limite;

  return (
    <Tela id="mem" ativa={ativa} pinhos={{ l: 16, r: 6, s: 77, estilo: { bottom: 12, left: 16 } }}>
      <div className="grade-acervo">
        <div className="coluna">
          <div className="gr" style={{ paddingTop: 0 }}>arquivos</div>
          {lista && lista.arquivos.length === 0 && <div className="vazio">nenhum arquivo de memória ainda.</div>}
          {lista?.arquivos.map((a, i) => (
            <button key={a.nome} className={`lin clicavel linha-botao${aberto === a.nome ? ' sel' : ''}${i === lista.arquivos.length - 1 ? ' ultima' : ''}`} onClick={() => void abrir(a.nome)} aria-pressed={aberto === a.nome}>
              <span title={`${a.nome}.md`}>{a.nome}</span>
              <span className="tag">{kb(a.tamanho)}</span>
            </button>
          ))}
          <div className="acoes-coluna">
            <button className="bt" onClick={() => { setCriando((v) => !v); setImportando(false); setAviso(null); }}>
              <Icone n="plus" /> novo arquivo
            </button>
            <button className="bt" onClick={() => { setImportando((v) => !v); setCriando(false); setAviso(null); }}>
              <Icone n="download" /> importar do claude.ai
            </button>
          </div>
          {criando && (
            <form className="form-acervo" onSubmit={criar}>
              <input aria-label="Nome do arquivo" placeholder="nome (ex.: perfil ou areas/hrzz)" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} autoFocus />
              <button className="bt prim" type="submit" disabled={!novoNome.trim()}>
                criar
              </button>
            </form>
          )}
          {lista && (
            <div className={`nota-acervo${acima ? ' alerta' : ''}`}>
              {acima
                ? `a memória tem ${lista.total.toLocaleString('pt-BR')} caracteres e a IA lê só os primeiros ${lista.limite.toLocaleString('pt-BR')}. Enxugue os arquivos.`
                : `${lista.total.toLocaleString('pt-BR')} de ${lista.limite.toLocaleString('pt-BR')} caracteres que a IA lê em toda conversa.`}
            </div>
          )}
        </div>

        <div className="coluna larga">
          {aviso && (
            <div className={`aviso-acervo ${aviso.tipo}`} role={aviso.tipo === 'erro' ? 'alert' : 'status'}>
              {aviso.texto}
            </div>
          )}
          {importando && (
            <div className="cardg editor">
              <div className="mono rotulo-editor">importar do claude.ai</div>
              <div className="dica-acervo">No claude.ai, abra configurações, memória, copie o texto e cole aqui (ou escolha um arquivo .txt ou .md). Nada sai do PC.</div>
              <textarea aria-label="Texto da memória do claude.ai" rows={9} value={textoImportado} onChange={(e) => setTextoImportado(e.target.value)} placeholder="cole aqui a memória do claude.ai" />
              <label className="marca-acervo">
                <input type="checkbox" checked={dividir} onChange={(e) => setDividir(e.target.checked)} /> dividir em um arquivo por título
              </label>
              <div className="acoes-editor">
                <input ref={arquivoInput} type="file" hidden accept=".txt,.md,.markdown,text/plain" onChange={(e) => { const f = e.target.files?.[0]; if (f) void lerArquivoLocal(f); e.target.value = ''; }} />
                <button className="bt" onClick={() => arquivoInput.current?.click()}>
                  <Icone n="file" /> escolher arquivo
                </button>
                <button className="bt prim" disabled={!textoImportado.trim()} onClick={() => void importar()}>
                  importar
                </button>
              </div>
            </div>
          )}
          {aberto ? (
            <div className="cardg editor">
              <div className="topo-editor">
                <span className="mono rotulo-editor" title={`${aberto}.md`}>
                  {aberto}.md{sujo ? ' •' : ''}
                </span>
                <span className="acoes-editor">
                  <button className="bt prim" disabled={!sujo} onClick={() => void salvar()}>
                    salvar
                  </button>
                  <button className="bt" onClick={() => void apagar()}>
                    apagar
                  </button>
                </span>
              </div>
              <textarea aria-label={`Conteúdo de ${aberto}`} rows={14} value={texto} onChange={(e) => setTexto(e.target.value)} spellCheck={false} />
              <div className="dica-acervo">editável aqui; a IA lê no começo de toda conversa</div>
            </div>
          ) : (
            !importando && <div className="vazio">escolha um arquivo pra editar, ou crie um novo. Tudo fica em dados/memoria, só neste PC.</div>
          )}
        </div>
      </div>
    </Tela>
  );
}
