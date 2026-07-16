import { useEffect, useState } from "react";
import Calculator from "./components/Calculator";
import Setup from "./components/Setup";
import Vault from "./components/Vault";
import ChangePassword from "./components/ChangePassword";
import { isConfigured, RESERVED_CODE, tryUnlock } from "./lib/passcode";
import { wipeVault } from "./lib/vault";
import { installAntiInspect } from "./lib/harden";

type View = "loading" | "setup" | "calc" | "vault" | "changepw";

export default function App() {
  const [view, setView] = useState<View>("loading");
  // A chave viva só em memória (RAM) enquanto o cofre está aberto.
  const [key, setKey] = useState<CryptoKey | null>(null);

  useEffect(() => {
    installAntiInspect();
    setView(isConfigured() ? "calc" : "setup");
  }, []);

  // Trava automática ao esconder o app (troca de aba / minimizar).
  useEffect(() => {
    function onHide() {
      if (document.hidden && view === "vault") lock();
    }
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  async function handleTryUnlock(code: string): Promise<boolean> {
    // Gesto secreto: "0000" abre a troca de senha (sem perder arquivos).
    if (code === RESERVED_CODE && isConfigured()) {
      setView("changepw");
      return true;
    }
    const { key: k, wiped } = await tryUnlock(code);
    if (k) {
      setKey(k);
      setView("vault");
      return true;
    }
    if (wiped) {
      // Excedeu o limite de tentativas: apaga tudo e volta ao "zero".
      await wipeVault();
      setKey(null);
      setView("setup");
      return true; // consumimos o "=" para não vazar que algo aconteceu
    }
    return false;
  }

  function lock() {
    setKey(null);
    setView("calc");
  }

  if (view === "loading") return <div className="h-full bg-slate-900" />;
  if (view === "setup") return <Setup onDone={(k) => { setKey(k); setView("vault"); }} />;
  if (view === "changepw")
    return (
      <ChangePassword
        onDone={(k) => { setKey(k); setView("vault"); }}
        onCancel={() => setView("calc")}
      />
    );
  if (view === "vault" && key) return <Vault cryptoKey={key} onLock={lock} />;
  return <Calculator onTryUnlock={handleTryUnlock} />;
}
