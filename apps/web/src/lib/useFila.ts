import { useCallback, useEffect, useState } from 'react';
import { api, type ListaFila } from './api';

// Fila em segundo plano e agendamentos. O servidor avisa pelo WebSocket quando algo muda (tick sobe).
export function useFila(ativo: boolean, tick: number) {
  const [lista, setLista] = useState<ListaFila>({ tarefas: [], agendamentos: [] });
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setLista(await api<ListaFila>('/api/tarefas'));
    } catch {
      /* servidor fora: a faixa de cima ja avisa */
    }
  }, []);

  useEffect(() => {
    if (ativo) void carregar();
  }, [ativo, tick, carregar]);

  // a "proxima execucao" dos agendamentos anda com o relogio
  useEffect(() => {
    if (!ativo) return;
    const t = window.setInterval(() => void carregar(), 60_000);
    return () => window.clearInterval(t);
  }, [ativo, carregar]);

  const chamar = useCallback(
    async (f: () => Promise<unknown>) => {
      setErro(null);
      try {
        await f();
        await carregar();
        return true;
      } catch (e) {
        setErro((e as Error).message);
        return false;
      }
    },
    [carregar],
  );

  return {
    ...lista,
    erro,
    carregar,
    abertas: lista.tarefas.filter((t) => t.estado === 'fila' || t.estado === 'rodando'),
    cancelar: (id: number) => chamar(() => api(`/api/tarefas/${id}/cancelar`, { corpo: {} })),
    tirar: (id: number) => chamar(() => api(`/api/tarefas/${id}`, { metodo: 'DELETE' })),
    criarAgendamento: (corpo: Record<string, unknown>) => chamar(() => api('/api/agendamentos', { corpo })),
    mudarAgendamento: (id: number, corpo: Record<string, unknown>) => chamar(() => api(`/api/agendamentos/${id}`, { metodo: 'PATCH', corpo })),
    apagarAgendamento: (id: number) => chamar(() => api(`/api/agendamentos/${id}`, { metodo: 'DELETE' })),
    rodarAgora: (id: number) => chamar(() => api(`/api/agendamentos/${id}/rodar-agora`, { corpo: {} })),
  };
}

export type Fila = ReturnType<typeof useFila>;
