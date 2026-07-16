import { useState } from "react";
import { changePasscode, RESERVED_CODE } from "../lib/passcode";

/**
 * Troca de senha SEM perder os arquivos. Acionada digitando "0000" e "=".
 *
 * Fluxo: senha atual → nova senha → confirmar. Ao final, todos os arquivos são
 * re-criptografados com a nova chave. Exige acertar a senha atual (necessário
 * para decifrar os arquivos).
 */
type Phase = "current" | "new" | "confirm" | "working";

export default function ChangePassword({
  onDone,
  onCancel,
}: {
  onDone: (key: CryptoKey) => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("current");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [entry, setEntry] = useState("");
  const [error, setError] = useState("");

  const titles: Record<Phase, string> = {
    current: "Digite a senha atual",
    new: "Crie a nova senha",
    confirm: "Confirme a nova senha",
    working: "Aplicando…",
  };

  function press(d: string) {
    if (phase === "working") return;
    setError("");
    if (d === "del") {
      setEntry((e) => e.slice(0, -1));
      return;
    }
    if (entry.length >= 4) return;
    const val = entry + d;
    setEntry(val);
    if (val.length === 4) setTimeout(() => advance(val), 150);
  }

  async function advance(val: string) {
    if (phase === "current") {
      setCurrent(val);
      setEntry("");
      setPhase("new");
      return;
    }
    if (phase === "new") {
      if (val === RESERVED_CODE) {
        setError("0000 é reservado. Escolha outra.");
        setEntry("");
        return;
      }
      setNext(val);
      setEntry("");
      setPhase("confirm");
      return;
    }
    if (phase === "confirm") {
      if (val !== next) {
        setError("As senhas novas não coincidem.");
        setEntry("");
        setPhase("new");
        setNext("");
        return;
      }
      setPhase("working");
      const res = await changePasscode(current, next);
      if (res.ok && res.key) {
        onDone(res.key);
      } else if (res.reason === "wrong-current") {
        setError("Senha atual incorreta. Recomece.");
        setCurrent("");
        setNext("");
        setEntry("");
        setPhase("current");
      } else {
        setError("Não foi possível trocar a senha.");
        setPhase("current");
      }
    }
  }

  const dots = Array.from({ length: 4 }, (_, i) => i < entry.length);

  return (
    <div className="flex h-full flex-col items-center justify-center bg-slate-900 px-8 text-slate-100">
      <div className="mb-1 text-xl font-semibold">Trocar senha</div>
      <p className="mb-6 text-sm text-slate-400">{titles[phase]}</p>

      <div className="mb-6 flex gap-4">
        {dots.map((filled, i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border-2 border-slate-500 ${
              filled ? "bg-violet-400" : "bg-transparent"
            }`}
          />
        ))}
      </div>

      {error && <p className="mb-3 text-center text-sm text-red-400">{error}</p>}

      {phase === "working" ? (
        <p className="text-slate-400">Re-criptografando seus arquivos…</p>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
            <PadButton key={n} onClick={() => press(n)}>
              {n}
            </PadButton>
          ))}
          <div />
          <PadButton onClick={() => press("0")}>0</PadButton>
          <PadButton onClick={() => press("del")}>⌫</PadButton>
        </div>
      )}

      {phase !== "working" && (
        <button
          onClick={onCancel}
          className="mt-8 text-sm text-slate-500 underline underline-offset-4"
        >
          Cancelar
        </button>
      )}
    </div>
  );
}

function PadButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="h-16 w-16 rounded-full bg-slate-800 text-2xl text-slate-100 transition active:scale-95 active:bg-slate-700"
    >
      {children}
    </button>
  );
}
