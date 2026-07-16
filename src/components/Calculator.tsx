import { useState } from "react";
import { evaluate, formatResult } from "../lib/calc";

/**
 * Calculadora científica funcional + porta secreta.
 *
 * Disfarce: para qualquer pessoa é só uma calculadora comum.
 * Desbloqueio: digite o código de 4 dígitos (só números, sem operações)
 * e toque em "=". Se bater com o código, o cofre abre. Se não, comporta-se
 * como uma conta normal (mostra o número). Nada revela que há um cofre.
 */
export default function Calculator({
  onTryUnlock,
}: {
  onTryUnlock: (code: string) => Promise<boolean>;
}) {
  const [expr, setExpr] = useState("");
  const [display, setDisplay] = useState("0");
  const [deg, setDeg] = useState(true);
  const [second, setSecond] = useState(false); // funções inversas

  function input(token: string) {
    setExpr((e) => e + token);
    setDisplay((d) => (d === "0" || d === "Erro" ? token : d + token));
  }

  function clearAll() {
    setExpr("");
    setDisplay("0");
  }

  function backspace() {
    setExpr((e) => e.slice(0, -1));
    setDisplay((d) => {
      const n = d.slice(0, -1);
      return n === "" ? "0" : n;
    });
  }

  async function equals() {
    // Tentativa de desbloqueio: só dígitos, tamanho de código.
    if (/^\d{4,10}$/.test(expr)) {
      const ok = await onTryUnlock(expr);
      if (ok) return; // o App troca de tela
    }
    try {
      const result = evaluate(expr || display, deg);
      const text = formatResult(result);
      setDisplay(text);
      setExpr(text === "Erro" ? "" : text);
    } catch {
      setDisplay("Erro");
      setExpr("");
    }
  }

  const sci: [string, () => void][] = [
    [deg ? "DEG" : "RAD", () => setDeg((v) => !v)],
    ["2nd", () => setSecond((v) => !v)],
    ["π", () => input("π")],
    ["e", () => input("e")],
    ["^", () => input("^")],
    [second ? "sin⁻¹" : "sin", () => input(second ? "asin(" : "sin(")],
    [second ? "cos⁻¹" : "cos", () => input(second ? "acos(" : "cos(")],
    [second ? "tan⁻¹" : "tan", () => input(second ? "atan(" : "tan(")],
    ["ln", () => input("ln(")],
    ["log", () => input("log(")],
    ["√", () => input("√(")],
    ["x!", () => input("!")],
    ["(", () => input("(")],
    [")", () => input(")")],
    ["%", () => input("%")],
  ];

  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      {/* Visor */}
      <div className="flex flex-1 flex-col items-end justify-end px-6 pb-3 pt-12">
        <div className="mb-2 h-7 w-full truncate text-right text-xl text-slate-500">
          {expr || " "}
        </div>
        <div className="w-full truncate text-right text-7xl font-extralight leading-none tabular-nums">
          {display}
        </div>
      </div>

      {/* Painel científico */}
      <div className="grid grid-cols-5 gap-1 px-3 pb-1">
        {sci.map(([label, fn], i) => (
          <button
            key={i}
            onClick={fn}
            className={`h-10 rounded-lg text-[13px] font-medium transition active:scale-95 active:bg-slate-700/70 ${
              (label === "2nd" && second) || label === "RAD"
                ? "text-amber-300"
                : "text-violet-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Teclado principal */}
      <div className="grid grid-cols-4 gap-2.5 p-3 pb-7">
        <Key onClick={clearAll} kind="fn">AC</Key>
        <Key onClick={backspace} kind="fn">⌫</Key>
        <Key onClick={() => input("%")} kind="fn">%</Key>
        <Key onClick={() => input("/")} kind="op">÷</Key>

        <Key onClick={() => input("7")}>7</Key>
        <Key onClick={() => input("8")}>8</Key>
        <Key onClick={() => input("9")}>9</Key>
        <Key onClick={() => input("*")} kind="op">×</Key>

        <Key onClick={() => input("4")}>4</Key>
        <Key onClick={() => input("5")}>5</Key>
        <Key onClick={() => input("6")}>6</Key>
        <Key onClick={() => input("-")} kind="op">−</Key>

        <Key onClick={() => input("1")}>1</Key>
        <Key onClick={() => input("2")}>2</Key>
        <Key onClick={() => input("3")}>3</Key>
        <Key onClick={() => input("+")} kind="op">+</Key>

        <Key onClick={() => input("0")} wide>0</Key>
        <Key onClick={() => input(".")}>,</Key>
        <Key onClick={equals} kind="eq">=</Key>
      </div>
    </div>
  );
}

function Key({
  children,
  onClick,
  kind = "num",
  wide = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  kind?: "num" | "op" | "fn" | "eq";
  wide?: boolean;
}) {
  const styles = {
    num: "bg-slate-800 text-slate-50 hover:bg-slate-700",
    op: "bg-slate-700 text-violet-200 hover:bg-slate-600",
    fn: "bg-slate-700/50 text-amber-300 hover:bg-slate-700",
    eq: "bg-violet-600 text-white hover:bg-violet-500",
  }[kind];
  // Teclas normais são quadradas; a tecla "0" ocupa 2 colunas (pílula larga)
  // e preenche a altura da linha (h-full) para casar com as vizinhas.
  const shape = wide ? "col-span-2 h-full" : "aspect-square";
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center rounded-2xl text-3xl font-light shadow-sm transition active:scale-90 ${shape} ${styles}`}
    >
      {children}
    </button>
  );
}
