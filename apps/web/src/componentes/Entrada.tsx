import { useState } from 'react';
import Pinhos from './Pinhos';
import './Entrada.css';

type Props = {
  definir: boolean; // true = ainda nao existe PIN: o primeiro acesso cria
  erro: string | null;
  aoEnviar: (pin: string) => void;
};

// Tela do PIN. Aparece antes de qualquer outra coisa (docs/05-acesso-e-seguranca.md).
export default function Entrada({ definir, erro, aoEnviar }: Props) {
  const [pin, setPin] = useState('');
  const [confirma, setConfirma] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[0-9]{4,12}$/.test(pin)) return setAviso('o PIN tem de 4 a 12 números');
    if (definir && pin !== confirma) return setAviso('os dois PINs não são iguais');
    setAviso(null);
    aoEnviar(pin);
  };

  return (
    <div className="entrada">
      <form className="cx entrada-caixa" onSubmit={enviar} aria-label={definir ? 'Criar PIN' : 'Entrar com o PIN'}>
        <div className="entrada-nome">
          HRZZ<span> STUDIO</span>
        </div>
        <p className="entrada-texto">{definir ? 'crie um PIN de 4 a 12 números. Ele é pedido em cada aparelho novo e lembrado por 30 dias.' : 'digite o PIN.'}</p>
        <div className="campo">
          <input
            className="txt mono"
            type="password"
            inputMode="numeric"
            autoComplete={definir ? 'new-password' : 'current-password'}
            autoFocus
            value={pin}
            placeholder="PIN"
            aria-label="PIN"
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
          />
        </div>
        {definir && (
          <div className="campo">
            <input
              className="txt mono"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={confirma}
              placeholder="repita o PIN"
              aria-label="Repita o PIN"
              onChange={(e) => setConfirma(e.target.value.replace(/\D/g, '').slice(0, 12))}
            />
          </div>
        )}
        {(aviso || erro) && (
          <div className="entrada-erro" role="alert">
            {aviso ?? erro}
          </div>
        )}
        <button className="bt prim entrada-botao" type="submit">
          {definir ? 'criar PIN' : 'entrar'}
        </button>
      </form>
      <Pinhos largura={24} linhas={8} semente={31} style={{ bottom: 10, right: 14 }} />
    </div>
  );
}
