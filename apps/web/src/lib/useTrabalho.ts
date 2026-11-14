import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ErroApi, type ResultadoAuditoria, type ResumoTrabalho, type ResultadoEdicao, type VersaoSalva } from './api';
import type { Hrzz } from './useHrzz';

// Estado do preview/versoes do projeto aberto, e as acoes dos botoes da faixa do preview.
export function useTrabalho(h: Hrzz) {
  const q = h.alvoQuery;
  const [dados, setDados] = useState<ResumoTrabalho | null>(null);
  const [recarga, setRecarga] = useState(0); // sobe a cada mudanca: o iframe recarrega
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [auditoria, setAuditoria] = useState<ResultadoAuditoria | null>(null);
  const [auditando, setAuditando] = useState(false);
  const qRef = useRef(q);
  qRef.current = q;

  const carregar = useCallback(async () => {
    const atual = qRef.current;
    if (!atual) return setDados(null);
    try {
      const d = await api<ResumoTrabalho>(`/api/preview/estado?${atual}`);
      if (qRef.current === atual) setDados(d);
    } catch {
      /* servidor fora: a faixa de cima ja avisa */
    }
  }, []);

  useEffect(() => {
    setDados(null);
    setAviso(null);
    setAuditoria(null);
    void carregar();
  }, [q, carregar]);

  // enquanto o servidor do projeto esta subindo, acompanha o log
  const subindo = !!dados?.preview.subindo;
  useEffect(() => {
    if (!subindo) return;
    const t = window.setInterval(() => void carregar(), 1500);
    return () => window.clearInterval(t);
  }, [subindo, carregar]);

  // o projeto mudou (IA, desfazer, texto, versao)
  const aviso0 = h.avisoPreview;
  const tipoServidor = dados?.preview.tipo;
  useEffect(() => {
    if (!aviso0 || aviso0.chave !== h.alvoChave) return;
    void carregar();
    // servidor de dev (npm) recarrega sozinho quando a IA mexe; nos outros casos recarrega aqui
    if (!(tipoServidor === 'npm' && aviso0.motivo === 'ia')) setRecarga((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aviso0?.n]);

  const chamar = useCallback(
    async <T,>(url: string, corpo: Record<string, unknown> = {}): Promise<T | null> => {
      if (!qRef.current) return null;
      const alvo = Object.fromEntries(new URLSearchParams(qRef.current));
      setOcupado(true);
      setAviso(null);
      try {
        return await api<T>(url, { corpo: { ...alvo, ...corpo } });
      } catch (e) {
        setAviso(e instanceof ErroApi ? e.message : 'não consegui falar com o servidor');
        return null;
      } finally {
        setOcupado(false);
      }
    },
    [],
  );

  const iniciar = useCallback(
    async (como?: 'npm' | 'estatico') => {
      const r = await chamar<ResumoTrabalho>('/api/preview/iniciar', como ? { como } : {});
      if (r) {
        setDados(r);
        setRecarga((n) => n + 1);
      }
    },
    [chamar],
  );

  const usarPorta = useCallback(
    async (porta: number) => {
      const r = await chamar<ResumoTrabalho>('/api/preview/porta', { porta });
      if (r) {
        setDados(r);
        setRecarga((n) => n + 1);
      }
    },
    [chamar],
  );

  const parar = useCallback(async () => {
    const r = await chamar<ResumoTrabalho>('/api/preview/parar');
    if (r) setDados(r);
  }, [chamar]);

  const salvarVersao = useCallback(
    async (nome: string) => {
      const r = await chamar<{ versao: VersaoSalva; igual: boolean; captura: boolean }>('/api/versoes', { nome });
      if (r) {
        setAviso(r.igual ? `nada mudou desde a v${r.versao.n}` : `v${r.versao.n} salva${r.captura ? '' : ' (sem captura da tela)'}`);
        await carregar();
      }
      return r;
    },
    [chamar, carregar],
  );

  const desfazer = useCallback(async () => {
    const r = await chamar<{ ok: boolean; mensagem: string }>('/api/desfazer');
    if (r) {
      setAviso(r.mensagem);
      await carregar();
    }
  }, [chamar, carregar]);

  const restaurar = useCallback(
    async (n: number) => {
      const r = await chamar<{ mensagem: string }>('/api/versoes/restaurar', { n });
      if (r) {
        setAviso(r.mensagem + ' (dá pra desfazer)');
        await carregar();
      }
    },
    [chamar, carregar],
  );

  // auditoria com um clique: estouro, alvos de 44 px, axe e contraste (leva alguns segundos)
  const auditar = useCallback(
    async (caminho: string) => {
      setAuditando(true);
      const r = await chamar<ResultadoAuditoria>('/api/auditoria', { caminho });
      setAuditando(false);
      if (r) setAuditoria(r);
    },
    [chamar],
  );

  const editarTexto = useCallback((antes: string, depois: string) => chamar<ResultadoEdicao>('/api/preview/editar-texto', { antes, depois }), [chamar]);

  return { dados, recarga, aviso, setAviso, ocupado, auditoria, setAuditoria, auditando, auditar, carregar, iniciar, usarPorta, parar, salvarVersao, desfazer, restaurar, editarTexto };
}

export type Trabalho = ReturnType<typeof useTrabalho>;
