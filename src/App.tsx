import { useEffect, useRef, useState } from "react";
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
  // Enquanto o seletor de arquivo estiver aberto, NÃO travamos o cofre —
  // no celular a galeria/câmera manda o app pro segundo plano e travar aqui
  // faria o upload se perder. Religa a trava assim que o app volta ao foco.
  const pickingRef = useRef(false);

  useEffect(() => {
    installAntiInspect();
    setView(isConfigured() ? "calc" : "setup");
    // Pede armazenamento persistente para o navegador não descartar o cofre.
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  // Trava automática ao esconder o app (troca de aba / minimizar),
  // exceto quando um upload está em andamento.
  useEffect(() => {
    function onVisibility() {
      if (document.hidden) {
        if (view === "vault" && !pickingRef.current) lock();
      } else {
        // Voltou ao foco: encerra a "janela" de upload.
        pickingRef.current = false;
      }
    }
    // Ao voltar o foco (fecha o seletor no desktop também), encerra a janela de upload.
    function onFocus() {
      pickingRef.current = false;
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
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
  if (view === "vault" && key)
    return (
      <Vault
        cryptoKey={key}
        onLock={lock}
        onStartPicking={() => {
          pickingRef.current = true;
        }}
      />
    );
  return <Calculator onTryUnlock={handleTryUnlock} />;
}
