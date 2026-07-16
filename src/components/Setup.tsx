import { useState } from "react";
import { RESERVED_CODE, setupPasscode } from "../lib/passcode";

/**
 * Primeira execução: define o código secreto de desbloqueio.
 * Aparece só uma vez; depois o app abre direto como calculadora.
 */
export default function Setup({ onDone }: { onDone: (key: CryptoKey) => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const current = step === 1 ? first : second;
  const setCurrent = step === 1 ? setFirst : setSecond;

  function press(d: string) {
    setError("");
    if (d === "del") {
      setCurrent(current.slice(0, -1));
      return;
    }
    if (current.length >= 4) return;
    const val = current + d;
    setCurrent(val);
    if (val.length === 4) {
      if (step === 1) {
        if (val === RESERVED_CODE) {
          setError("O código 0000 é reservado. Escolha outro.");
          setTimeout(() => setFirst(""), 150);
          return;
        }
        setTimeout(() => setStep(2), 150);
      } else {
        confirm(val);
      }
    }
  }

  async function confirm(val: string) {
    if (val !== first) {
      setError("Os códigos não coincidem. Tente de novo.");
      setSecond("");
      setStep(1);
      setFirst("");
      return;
    }
    setBusy(true);
    const key = await setupPasscode(val);
    onDone(key);
  }

  const dots = Array.from({ length: 4 }, (_, i) => i < current.length);

  return (
    <div className="flex h-full flex-col items-center justify-center bg-slate-900 px-8 text-slate-100">
      <div className="mb-2 text-2xl font-semibold">Bem-vindo</div>
      <p className="mb-8 max-w-xs text-center text-sm text-slate-400">
        {step === 1
          ? "Crie um código de 4 dígitos. Ele abre o cofre secreto quando digitado na calculadora e você toca em “=”."
          : "Digite o código novamente para confirmar."}
      </p>

      <div className="mb-8 flex gap-4">
        {dots.map((filled, i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border-2 border-slate-500 ${
              filled ? "bg-violet-400" : "bg-transparent"
            }`}
          />
        ))}
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-3 gap-4">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
          <PadButton key={n} onClick={() => press(n)} disabled={busy}>
            {n}
          </PadButton>
        ))}
        <div />
        <PadButton onClick={() => press("0")} disabled={busy}>
          0
        </PadButton>
        <PadButton onClick={() => press("del")} disabled={busy}>
          ⌫
        </PadButton>
      </div>

      <p className="mt-8 max-w-xs text-center text-xs text-slate-500">
        Guarde bem esse código. Sem ele ninguém — nem você — consegue abrir os
        arquivos: eles ficam criptografados de ponta a ponta.
      </p>
    </div>
  );
}

function PadButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-16 w-16 rounded-full bg-slate-800 text-2xl text-slate-100 transition active:scale-95 active:bg-slate-700 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
