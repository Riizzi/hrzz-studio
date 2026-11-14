import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type EstadoTranscritor, type TarefaTranscricao, type Transcricao } from './api';

const ATIVA = (t: TarefaTranscricao) => t.status === 'fila' || t.status === 'baixando' || t.status === 'transcrevendo';

// Estado da transcricao: tarefas na fila (viram a "fila" do topo), transcricoes salvas e se o servico esta no ar.
// Consulta de tempos em tempos; mais rapido quando a tela esta aberta ou ha tarefa rodando.
export function useTranscricao(logado: boolean, telaAberta: boolean) {
  const [estado, setEstado] = useState<EstadoTranscritor | null>(null);
  const [tarefas, setTarefas] = useState<TarefaTranscricao[]>([]);
  const [lista, setLista] = useState<Transcricao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const anteriores = useRef<Map<string, string>>(new Map());
  const jaVi = useRef(false);
  const aberta = useRef(telaAberta);
  aberta.current = telaAberta;

  const recarregarLista = useCallback(async () => {
    try {
      setLista(await api<Transcricao[]>('/api/transcricao/transcricoes'));
    } catch {
      /* servico fora do ar: o aviso vem do estado */
    }
  }, []);

  const recarregarEstado = useCallback(async () => {
    try {
      setEstado(await api<EstadoTranscritor>('/api/transcricao/estado'));
    } catch {
      setEstado({ ligado: false, saude: null });
    }
  }, []);

  const recarregarTarefas = useCallback(async () => {
    try {
      const novas = await api<TarefaTranscricao[]>('/api/transcricao/tarefas');
      setTarefas(novas);
      setErro(null);
      // alguma terminou agora: atualiza a lista de transcricoes
      let terminou = false;
      for (const t of novas) {
        const antes = anteriores.current.get(t.id);
        if (t.status === 'pronta' && (antes ? antes !== 'pronta' : jaVi.current)) terminou = true;
        anteriores.current.set(t.id, t.status);
      }
      jaVi.current = true;
      if (terminou) void recarregarLista();
      return novas;
    } catch (e) {
      setErro((e as Error).message);
      return null;
    }
  }, [recarregarLista]);

  // ao abrir a tela
  useEffect(() => {
    if (!logado || !telaAberta) return;
    void recarregarEstado();
    void recarregarLista();
    void recarregarTarefas();
  }, [logado, telaAberta, recarregarEstado, recarregarLista, recarregarTarefas]);

  // ronda: 1,5 s com a tela aberta ou tarefa rodando; senao 6 s; com o servico fora, 20 s
  useEffect(() => {
    if (!logado) return;
    let parar = false;
    let timer: number | undefined;
    const ciclo = async () => {
      const novas = await recarregarTarefas();
      if (parar) return;
      const atividade = novas?.some(ATIVA) ?? false;
      const espera = novas === null ? 20000 : atividade || aberta.current ? 1500 : 6000;
      timer = window.setTimeout(() => void ciclo(), espera);
    };
    timer = window.setTimeout(() => void ciclo(), 2000);
    return () => {
      parar = true;
      window.clearTimeout(timer);
    };
  }, [logado, recarregarTarefas]);

  const ativas = tarefas.filter(ATIVA);
  return { estado, tarefas, ativas, lista, erro, recarregarLista, recarregarTarefas, recarregarEstado };
}

export type TranscricaoHook = ReturnType<typeof useTranscricao>;
