import { useCallback, useEffect, useState } from 'react';
import { api, type ComandoItem } from './api';

// lista de comandos salvos (/nome) pro menu do campo do chat
export function useComandos(ativo: boolean) {
  const [comandos, setComandos] = useState<ComandoItem[]>([]);
  const recarregar = useCallback(() => {
    api<ComandoItem[]>('/api/comandos')
      .then(setComandos)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (ativo) recarregar();
  }, [ativo, recarregar]);
  return { comandos, recarregar };
}
