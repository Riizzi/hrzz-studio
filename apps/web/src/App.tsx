import { useCallback, useEffect, useMemo, useState } from 'react';
import Lateral from './componentes/Lateral';
import Topo from './componentes/Topo';
import Chat from './componentes/Chat';
import Painel from './componentes/Painel';
import Paleta, { type AcaoPaleta } from './componentes/Paleta';
import Entrada from './componentes/Entrada';
import { TelaConectores, TelaDia, TelaGaleria, TelaMemoria, TelaSkills, TelaTranscricao } from './telas/Telas';
import { TelaAjustes } from './telas/Ajustes';
import { useHrzz } from './lib/useHrzz';
import { useSaude } from './lib/saude';
import type { AbaPainel, EstadoPainel, TelaId } from './tipos';

const CHAVE_FLORESTA = 'hrzz.floresta';

function lerFloresta(): boolean {
  try {
    return localStorage.getItem(CHAVE_FLORESTA) !== 'desligada';
  } catch {
    return true;
  }
}

export default function App() {
  const [tela, setTela] = useState<TelaId>('chat');
  const [largura, setLargura] = useState(() => window.innerWidth);
  const [lateralAberta, setLateralAberta] = useState(false); // usuario abriu a barra em tela estreita
  const [lateralRecolhida, setLateralRecolhida] = useState(false); // usuario recolheu a barra em tela larga
  const [painel, setPainel] = useState<EstadoPainel>(() => (window.innerWidth <= 640 ? 'min' : 'aberto'));
  const [aba, setAba] = useState<AbaPainel>('preview');
  const [pop, setPop] = useState<string | null>(null);
  const [paleta, setPaleta] = useState(false);
  const [florestaLigada, setFlorestaLigada] = useState(lerFloresta);
  const { saude, fora } = useSaude();
  const h = useHrzz();

  useEffect(() => {
    const aoRedimensionar = () => setLargura(window.innerWidth);
    window.addEventListener('resize', aoRedimensionar);
    return () => window.removeEventListener('resize', aoRedimensionar);
  }, []);

  const estreitaLateral = largura <= 820;
  const estreito = largura <= 640;
  const celular = largura <= 480;
  const rail = estreitaLateral ? !lateralAberta : lateralRecolhida;

  const alternarLateral = () => {
    if (estreitaLateral) setLateralAberta((v) => !v);
    else setLateralRecolhida((v) => !v);
  };

  const alternarPainel = useCallback(() => setPainel((p) => (p === 'min' ? 'aberto' : 'min')), []);
  const maximizarPainel = useCallback(() => setPainel((p) => (p === 'max' ? 'aberto' : 'max')), []);
  const abrirProgresso = useCallback(() => {
    setTela('chat');
    setAba('progresso');
    setPainel((p) => (p === 'min' ? 'aberto' : p));
  }, []);

  const alternarFloresta = () => {
    setFlorestaLigada((v) => {
      try {
        localStorage.setItem(CHAVE_FLORESTA, v ? 'desligada' : 'ligada');
      } catch {
        /* sem armazenamento: vale so nesta sessao */
      }
      return !v;
    });
  };

  const abrirPop = (id: string) => setPop((atual) => (atual === id ? null : id));

  useEffect(() => {
    const fecha = () => setPop(null);
    document.addEventListener('click', fecha);
    return () => document.removeEventListener('click', fecha);
  }, []);

  useEffect(() => {
    const teclas = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPaleta(false);
        setPop(null);
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaleta(true);
      }
      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault();
        setTela('chat');
        alternarPainel();
      }
      if (e.ctrlKey && e.key === '.') {
        e.preventDefault();
        setTela('chat');
        setPainel((p) => (p === 'max' ? 'aberto' : 'max'));
      }
    };
    window.addEventListener('keydown', teclas);
    return () => window.removeEventListener('keydown', teclas);
  }, [alternarPainel]);

  const acoes: AcaoPaleta[] = useMemo(
    () => [
      { id: 'completo', rotulo: 'abrir painel por completo', atalho: 'ctrl+.', executar: () => { setTela('chat'); setPainel('max'); } },
      { id: 'painel', rotulo: 'abrir ou fechar o painel', atalho: 'ctrl+\\', executar: () => { setTela('chat'); alternarPainel(); } },
      { id: 'progresso', rotulo: 'ver progresso', executar: abrirProgresso },
      { id: 'dia', rotulo: 'ir para o painel do dia', executar: () => setTela('dia') },
      { id: 'tra', rotulo: 'ir para a transcrição', executar: () => setTela('tra') },
      { id: 'cfg', rotulo: 'ir para acesso e ajustes', executar: () => setTela('cfg') },
    ],
    [alternarPainel, abrirProgresso],
  );

  const classes = ['hz', rail ? 'rail' : '', estreito ? 'estreito' : '', celular ? 'celular' : ''].filter(Boolean).join(' ');

  if (h.fase === 'carregando') return <div className="hz-carregando" aria-busy="true" />;
  if (h.fase !== 'ok') return <Entrada definir={h.fase === 'definir'} erro={h.erro} aoEnviar={(pin) => void h.entrar(pin, h.fase === 'definir')} />;

  return (
    <div className={classes}>
      <Lateral h={h} tela={tela} aoIr={setTela} rail={rail} aoAlternar={alternarLateral} aoBuscar={() => setPaleta(true)} />

      <main className="principal">
        <Topo aberto={pop} aoAbrir={abrirPop} servidorFora={fora} uso={h.uso} aoUsarHaiku={() => void h.mudarOpcao({ modelo: 'haiku' })} />

        <div className={`vw v-chat${tela === 'chat' ? ' on' : ''} ${painel}`} id="v-chat">
          <Chat
            h={h}
            aberto={pop}
            aoAbrir={abrirPop}
            florestaLigada={florestaLigada}
            painelAberto={painel !== 'min'}
            aoAlternarPainel={alternarPainel}
            aoAbrirProgresso={abrirProgresso}
          />
          <Painel h={h} estado={painel} aba={aba} aoTrocarAba={setAba} aoMaximizar={maximizarPainel} aoMinimizar={() => setPainel('min')} />
        </div>

        <TelaDia ativa={tela === 'dia'} />
        <TelaTranscricao ativa={tela === 'tra'} />
        <TelaGaleria ativa={tela === 'gal'} />
        <TelaMemoria ativa={tela === 'mem'} />
        <TelaSkills ativa={tela === 'skl'} />
        <TelaConectores ativa={tela === 'con'} />
        <TelaAjustes ativa={tela === 'cfg'} saude={saude} servidorFora={fora} florestaLigada={florestaLigada} aoAlternarFloresta={alternarFloresta} aoSair={() => void h.sair()} />
      </main>

      {paleta && <Paleta acoes={acoes} aoAbrirConversa={(id) => { setTela('chat'); void h.abrirConversa(id); }} aoFechar={() => setPaleta(false)} />}
    </div>
  );
}
