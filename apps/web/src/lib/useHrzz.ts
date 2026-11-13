import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  quandoPrecisarPin,
  type Anexo,
  type Bloco,
  type Conversa,
  type ItemProgresso,
  type Mensagem,
  type Modo,
  type ModelosApi,
  type Nivel,
  type Projeto,
  type Uso,
} from './api';

export type Fase = 'carregando' | 'definir' | 'pin' | 'ok';

// opcoes da proxima mensagem (valem pra conversa nova; em conversa existente vao pro servidor na hora)
export type Opcoes = { modo: Modo; pensar: Nivel; esforco: Nivel; web: boolean; modelo: string };

const PADRAO: Opcoes = { modo: 'mid', pensar: 1, esforco: 1, web: true, modelo: 'auto' };

type EventoServidor = { t: string; [k: string]: unknown };

// aplica um evento do motor no turno que esta chegando
function aplicar(blocos: Bloco[], ev: EventoServidor): Bloco[] {
  const b = [...blocos];
  const ultimo = b[b.length - 1];
  switch (ev.t) {
    case 'pensando':
      b.push({ tipo: 'pensamento', texto: '', segundos: 0, vivo: true });
      break;
    case 'pensando_delta':
      if (ultimo?.tipo === 'pensamento') b[b.length - 1] = { ...ultimo, texto: ultimo.texto + String(ev.texto) };
      break;
    case 'texto_delta': {
      if (ultimo?.tipo === 'pensamento' && ultimo.vivo) b[b.length - 1] = { ...ultimo, vivo: false };
      const ult = b[b.length - 1];
      if (ult?.tipo === 'texto') b[b.length - 1] = { ...ult, texto: ult.texto + String(ev.texto) };
      else b.push({ tipo: 'texto', texto: String(ev.texto) });
      break;
    }
    case 'ferramenta': {
      const id = String(ev.id);
      const i = b.findIndex((x) => x.tipo === 'ferramenta' && x.id === id);
      const novo: Bloco = { tipo: 'ferramenta', id, nome: String(ev.nome), resumo: String(ev.resumo ?? ''), rodando: true };
      if (i >= 0) {
        const antigo = b[i] as Extract<Bloco, { tipo: 'ferramenta' }>;
        b[i] = { ...antigo, resumo: String(ev.resumo ?? '') || antigo.resumo };
      } else {
        if (ultimo?.tipo === 'pensamento' && ultimo.vivo) b[b.length - 1] = { ...ultimo, vivo: false };
        b.push(novo);
      }
      break;
    }
    case 'ferramenta_fim': {
      const id = String(ev.id);
      const i = b.findIndex((x) => x.tipo === 'ferramenta' && x.id === id);
      if (i >= 0) b[i] = { ...(b[i] as Extract<Bloco, { tipo: 'ferramenta' }>), rodando: false, erro: !!ev.erro };
      break;
    }
    case 'permissao':
      b.push({ tipo: 'permissao', negadas: ev.negadas as never });
      break;
    case 'erro':
      b.push({ tipo: 'erro', texto: String(ev.mensagem) });
      break;
  }
  return b;
}

export function useHrzz() {
  const [fase, setFase] = useState<Fase>('carregando');
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [modelos, setModelos] = useState<ModelosApi | null>(null);
  const [uso, setUso] = useState<Uso>({});
  const [atual, setAtual] = useState<number | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [turnos, setTurnos] = useState<Record<number, Bloco[]>>({});
  const [rodando, setRodando] = useState<number[]>([]);
  const [progresso, setProgresso] = useState<ItemProgresso[]>([]);
  const [progressoProjeto, setProgressoProjeto] = useState<ItemProgresso[]>([]);
  const [opcoes, setOpcoes] = useState<Opcoes>(PADRAO);
  const [projetoNovo, setProjetoNovo] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [arquivosAlterados, setArquivosAlterados] = useState(0);

  const ws = useRef<WebSocket | null>(null);
  const atualRef = useRef<number | null>(null);
  atualRef.current = atual;
  const fecharDeProposito = useRef(false);
  const conversasRef = useRef<Conversa[]>([]);
  conversasRef.current = conversas;

  // ---------- carregar ----------
  const carregarListas = useCallback(async () => {
    const [c, p] = await Promise.all([api<Conversa[]>('/api/conversas'), api<Projeto[]>('/api/projetos')]);
    setConversas(c);
    setProjetos(p);
  }, []);

  const carregarUso = useCallback(async () => {
    try {
      setUso(await api<Uso>('/api/uso'));
    } catch {
      /* sem uso ainda */
    }
  }, []);

  const carregarConversa = useCallback(async (id: number) => {
    const d = await api<{ conversa: Conversa; mensagens: Mensagem[]; rodando: boolean }>(`/api/conversas/${id}`);
    if (atualRef.current !== id) return;
    setMensagens(d.mensagens);
    setConversas((lista) => (lista.some((c) => c.id === id) ? lista.map((c) => (c.id === id ? d.conversa : c)) : [d.conversa, ...lista]));
  }, []);

  const carregarProgresso = useCallback(async (id: number | null, projetoId: number | null) => {
    if (id) setProgresso(await api<ItemProgresso[]>(`/api/progresso?conversa=${id}`));
    else setProgresso([]);
    if (projetoId) setProgressoProjeto(await api<ItemProgresso[]>(`/api/progresso?projeto=${projetoId}`));
    else setProgressoProjeto([]);
  }, []);

  const iniciar = useCallback(async () => {
    try {
      const e = await api<{ temPin: boolean; logado: boolean }>('/api/auth/estado');
      if (!e.temPin) return setFase('definir');
      if (!e.logado) return setFase('pin');
      await Promise.all([carregarListas(), carregarUso(), api<ModelosApi>('/api/modelos').then(setModelos).catch(() => {})]);
      setFase('ok');
    } catch {
      setErro('o servidor não responde');
      setFase('pin');
    }
  }, [carregarListas, carregarUso]);

  useEffect(() => {
    quandoPrecisarPin(() => {
      fecharDeProposito.current = true;
      ws.current?.close();
      setFase((f) => (f === 'ok' ? 'pin' : f));
    });
    void iniciar();
  }, [iniciar]);

  // ---------- WebSocket ----------
  useEffect(() => {
    if (fase !== 'ok') return;
    let vivo = true;
    let tentativas = 0;
    let timer: number | undefined;
    fecharDeProposito.current = false;

    const abrir = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const s = new WebSocket(`${proto}://${location.host}/api/ws`);
      ws.current = s;
      s.onopen = () => {
        if (tentativas > 0) {
          void carregarListas();
          if (atualRef.current) void carregarConversa(atualRef.current);
        }
        tentativas = 0;
      };
      s.onmessage = (m) => {
        let d: Record<string, any>;
        try {
          d = JSON.parse(m.data);
        } catch {
          return;
        }
        if (d.tipo === 'evento') {
          const id = Number(d.conversa);
          const ev = d.ev as EventoServidor;
          if (ev.t === 'uso') {
            setUso({ cincoHoras: ev.cincoHoras as number, seteDias: ev.seteDias as number, renovaEm: ev.renovaEm as number, estado: ev.estado as string });
          } else if (ev.t === 'arquivo_alterado') {
            setArquivosAlterados((n) => n + 1);
          } else if (ev.t !== 'sessao' && ev.t !== 'progresso' && ev.t !== 'fim') {
            setTurnos((t) => ({ ...t, [id]: aplicar(t[id] ?? [], ev) }));
          }
          setRodando((r) => (ev.t === 'fim' ? r.filter((x) => x !== id) : r.includes(id) ? r : [...r, id]));
        } else if (d.tipo === 'conversa') {
          const c = d.conversa as Conversa;
          setConversas((lista) => [c, ...lista.filter((x) => x.id !== c.id)].sort((a, b) => b.atualizada.localeCompare(a.atualizada)));
          // conversa recem-criada por esta tela: passa a ser a atual
          if (atualRef.current === null) {
            atualRef.current = c.id;
            setAtual(c.id);
          }
        } else if (d.tipo === 'mensagens') {
          if (atualRef.current === Number(d.conversa)) void carregarConversa(Number(d.conversa));
        } else if (d.tipo === 'progresso') {
          if (atualRef.current === Number(d.conversa)) {
            void carregarProgresso(Number(d.conversa), conversaProjeto(Number(d.conversa)));
          }
        } else if (d.tipo === 'fim') {
          const id = Number(d.conversa);
          setRodando((r) => r.filter((x) => x !== id));
          setTurnos((t) => {
            const { [id]: _fora, ...resto } = t;
            return resto;
          });
          void carregarListas();
          void carregarUso();
        } else if (d.tipo === 'removida') {
          const id = Number(d.conversa);
          setConversas((l) => l.filter((c) => c.id !== id));
          if (atualRef.current === id) {
            setAtual(null);
            setMensagens([]);
          }
        } else if (d.tipo === 'erro') {
          setErro(String(d.mensagem));
        }
      };
      s.onclose = () => {
        if (!vivo || fecharDeProposito.current) return;
        tentativas += 1;
        timer = window.setTimeout(abrir, Math.min(10000, 500 * 2 ** tentativas));
      };
    };
    // a conversa e seu projeto: lido no momento do evento (a lista muda)
    const conversaProjeto = (id: number): number | null => conversasRef.current.find((c) => c.id === id)?.projetoId ?? null;
    abrir();
    return () => {
      vivo = false;
      window.clearTimeout(timer);
      ws.current?.close();
    };
  }, [fase, carregarListas, carregarConversa, carregarProgresso, carregarUso]);

  // ---------- acoes ----------
  const conversaAtual = conversas.find((c) => c.id === atual) ?? null;

  const abrirConversa = useCallback(
    async (id: number) => {
      setAtual(id);
      atualRef.current = id;
      setMensagens([]);
      await carregarConversa(id);
      const c = conversasRef.current.find((x) => x.id === id);
      await carregarProgresso(id, c?.projetoId ?? null);
    },
    [carregarConversa, carregarProgresso],
  );

  const novaConversa = useCallback(
    (projetoId: number | null = null) => {
      setAtual(null);
      atualRef.current = null;
      setMensagens([]);
      setProjetoNovo(projetoId);
      setProgresso([]);
      void carregarProgresso(null, projetoId);
    },
    [carregarProgresso],
  );

  // os botoes do compositor: em conversa existente valem pra ela; em conversa nova ficam como rascunho
  const efetivas: Opcoes = conversaAtual
    ? { modo: conversaAtual.modo, pensar: conversaAtual.pensar, esforco: conversaAtual.esforco, web: conversaAtual.web, modelo: conversaAtual.modelo ?? 'auto' }
    : opcoes;

  const mudarOpcao = useCallback(
    async (patch: Partial<Opcoes>) => {
      if (!conversaAtual) return setOpcoes((o) => ({ ...o, ...patch }));
      const { modelo, ...resto } = patch;
      if (Object.keys(resto).length) {
        const c = await api<Conversa>(`/api/conversas/${conversaAtual.id}`, { metodo: 'PATCH', corpo: resto });
        setConversas((l) => l.map((x) => (x.id === c.id ? { ...x, ...c } : x)));
      }
      if (modelo !== undefined) {
        // o modelo e gravado no servidor junto da proxima mensagem; aqui so mostra
        setConversas((l) => l.map((x) => (x.id === conversaAtual.id ? { ...x, modelo, modeloAuto: modelo === 'auto' } : x)));
        setOpcoes((o) => ({ ...o, modelo }));
      }
    },
    [conversaAtual],
  );

  const enviar = useCallback(
    (texto: string, anexos: Anexo[]) => {
      const idConversa = atualRef.current;
      const o = efetivas;
            ws.current?.send(
        JSON.stringify({ tipo: 'enviar', conversa: idConversa ?? undefined, projeto: idConversa ? undefined : projetoNovo, texto, anexos, modelo: o.modelo, modo: o.modo, pensar: o.pensar, esforco: o.esforco, web: o.web }),
      );
      // mostra a mensagem na hora; o servidor confirma em seguida
      setMensagens((m) => [...m, { id: -Date.now(), papel: 'eu', conteudo: { texto, anexos } }]);
      if (idConversa) setRodando((r) => (r.includes(idConversa) ? r : [...r, idConversa]));
    },
    [efetivas, projetoNovo],
  );

  const parar = useCallback(() => {
    if (atualRef.current) ws.current?.send(JSON.stringify({ tipo: 'parar', conversa: atualRef.current }));
  }, []);

  const responderPermissao = useCallback((mensagem: number, indiceBloco: number, resposta: 'sim' | 'sempre' | 'nao') => {
    if (!atualRef.current) return;
    ws.current?.send(JSON.stringify({ tipo: 'permissao', conversa: atualRef.current, mensagem, indiceBloco, resposta }));
    if (resposta !== 'nao') setRodando((r) => [...r, atualRef.current!]);
  }, []);

  const entrar = useCallback(
    async (pin: string, definir: boolean) => {
      setErro(null);
      try {
        await api(definir ? '/api/auth/pin' : '/api/auth/entrar', { corpo: { pin } });
        await iniciar();
      } catch (e) {
        setErro((e as Error).message);
      }
    },
    [iniciar],
  );

  const sair = useCallback(async () => {
    await api('/api/auth/sair', { corpo: {} });
    fecharDeProposito.current = true;
    ws.current?.close();
    setFase('pin');
  }, []);

  const criarProjeto = useCallback(
    async (nome: string, pasta: string) => {
      const p = await api<Projeto>('/api/projetos', { corpo: { nome, pasta } });
      setProjetos((l) => [...l, p].sort((a, b) => a.nome.localeCompare(b.nome)));
      return p;
    },
    [],
  );

  const apagarConversa = useCallback(async (id: number) => {
    await api(`/api/conversas/${id}`, { metodo: 'DELETE' });
    setConversas((l) => l.filter((c) => c.id !== id));
    if (atualRef.current === id) {
      setAtual(null);
      setMensagens([]);
    }
  }, []);

  const renomearConversa = useCallback(async (id: number, titulo: string) => {
    const c = await api<Conversa>(`/api/conversas/${id}`, { metodo: 'PATCH', corpo: { titulo } });
    setConversas((l) => l.map((x) => (x.id === id ? { ...x, ...c } : x)));
  }, []);

  const adicionarItem = useCallback(
    async (texto: string, escopo: 'conversa' | 'projeto') => {
      const projetoId = conversaAtual?.projetoId ?? projetoNovo;
      const corpo = escopo === 'projeto' && projetoId ? { projeto: projetoId, texto } : atualRef.current ? { conversa: atualRef.current, texto } : null;
      if (!corpo) return;
      await api('/api/progresso', { corpo });
      await carregarProgresso(atualRef.current, projetoId);
    },
    [conversaAtual, projetoNovo, carregarProgresso],
  );

  const alternarItem = useCallback(
    async (item: ItemProgresso) => {
      await api(`/api/progresso/${item.id}`, { metodo: 'PATCH', corpo: { estado: item.estado === 'feito' ? 'afazer' : 'feito' } });
      await carregarProgresso(atualRef.current, conversaAtual?.projetoId ?? projetoNovo);
    },
    [conversaAtual, projetoNovo, carregarProgresso],
  );

  const removerItem = useCallback(
    async (item: ItemProgresso) => {
      await api(`/api/progresso/${item.id}`, { metodo: 'DELETE' });
      await carregarProgresso(atualRef.current, conversaAtual?.projetoId ?? projetoNovo);
    },
    [conversaAtual, projetoNovo, carregarProgresso],
  );

  return {
    fase, erro, setErro, entrar, sair,
    conversas, projetos, modelos, uso,
    atual, conversaAtual, mensagens, turno: atual ? (turnos[atual] ?? null) : null,
    rodandoAtual: atual !== null && rodando.includes(atual),
    rodandoAlgum: rodando.length > 0,
    progresso, progressoProjeto,
    efetivas, mudarOpcao, projetoNovo,
    abrirConversa, novaConversa, enviar, parar, responderPermissao,
    criarProjeto, apagarConversa, renomearConversa,
    adicionarItem, alternarItem, removerItem,
    arquivosAlterados,
  };
}

export type Hrzz = ReturnType<typeof useHrzz>;
