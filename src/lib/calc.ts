/**
 * Avaliador de expressões matemáticas SEM usar eval()/Function().
 * Tokenizer + parser recursivo descendente (blue team: nada de injeção de código).
 *
 * Suporta: + - * / ^, parênteses, menos unário, %, fatorial (!),
 * funções sin cos tan asin acos atan log ln sqrt exp abs,
 * constantes pi e. Ângulos em graus ou radianos.
 */

type Token =
  | { t: "num"; v: number }
  | { t: "op"; v: string }
  | { t: "func"; v: string }
  | { t: "lparen" }
  | { t: "rparen" };

const FUNCS = new Set([
  "sin", "cos", "tan", "asin", "acos", "atan",
  "log", "ln", "sqrt", "exp", "abs",
]);

function tokenize(input: string): Token[] {
  const s = input
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/g, "pi")
    .replace(/√/g, "sqrt")
    .replace(/,/g, ".");
  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " ") {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let num = "";
      while (i < s.length && /[0-9.]/.test(s[i])) num += s[i++];
      tokens.push({ t: "num", v: parseFloat(num) });
      continue;
    }
    if (/[a-z]/i.test(c)) {
      let name = "";
      while (i < s.length && /[a-z]/i.test(s[i])) name += s[i++].toLowerCase();
      if (name === "pi") tokens.push({ t: "num", v: Math.PI });
      else if (name === "e") tokens.push({ t: "num", v: Math.E });
      else if (FUNCS.has(name)) tokens.push({ t: "func", v: name });
      else throw new Error("Nome desconhecido: " + name);
      continue;
    }
    if ("+-*/^%!".includes(c)) {
      tokens.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ t: "lparen" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ t: "rparen" });
      i++;
      continue;
    }
    throw new Error("Caractere inválido: " + c);
  }
  return tokens;
}

function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) return NaN;
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}

// Parser recursivo descendente com precedência.
class Parser {
  private pos = 0;
  constructor(private tokens: Token[], private useDegrees: boolean) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private next(): Token | undefined {
    return this.tokens[this.pos++];
  }

  parse(): number {
    const v = this.parseAddSub();
    if (this.pos < this.tokens.length) throw new Error("Expressão inválida");
    return v;
  }

  private parseAddSub(): number {
    let left = this.parseMulDiv();
    while (this.peek()?.t === "op" && ["+", "-"].includes((this.peek() as any).v)) {
      const op = (this.next() as any).v;
      const right = this.parseMulDiv();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  private parseMulDiv(): number {
    let left = this.parsePower();
    while (this.peek()?.t === "op" && ["*", "/", "%"].includes((this.peek() as any).v)) {
      const op = (this.next() as any).v;
      const right = this.parsePower();
      if (op === "*") left = left * right;
      else if (op === "/") left = left / right;
      else left = left % right;
    }
    return left;
  }

  private parsePower(): number {
    const left = this.parseUnary();
    if (this.peek()?.t === "op" && (this.peek() as any).v === "^") {
      this.next();
      // Potência é associativa à direita.
      return Math.pow(left, this.parsePower());
    }
    return left;
  }

  private parseUnary(): number {
    const p = this.peek();
    if (p?.t === "op" && p.v === "-") {
      this.next();
      return -this.parseUnary();
    }
    if (p?.t === "op" && p.v === "+") {
      this.next();
      return this.parseUnary();
    }
    return this.parsePostfix();
  }

  private parsePostfix(): number {
    let v = this.parsePrimary();
    // Fatorial e porcentagem são pós-fixados.
    while (this.peek()?.t === "op" && ["!", "%"].includes((this.peek() as any).v)) {
      const op = (this.next() as any).v;
      v = op === "!" ? factorial(v) : v / 100;
    }
    return v;
  }

  private parsePrimary(): number {
    const tok = this.next();
    if (!tok) throw new Error("Fim inesperado");
    if (tok.t === "num") return tok.v;
    if (tok.t === "lparen") {
      const v = this.parseAddSub();
      if (this.next()?.t !== "rparen") throw new Error("Falta ')'");
      return v;
    }
    if (tok.t === "func") {
      if (this.next()?.t !== "lparen") throw new Error("Falta '(' após função");
      const arg = this.parseAddSub();
      if (this.next()?.t !== "rparen") throw new Error("Falta ')'");
      return this.applyFunc(tok.v, arg);
    }
    throw new Error("Token inesperado");
  }

  private applyFunc(name: string, x: number): number {
    const toRad = (a: number) => (this.useDegrees ? (a * Math.PI) / 180 : a);
    const fromRad = (a: number) => (this.useDegrees ? (a * 180) / Math.PI : a);
    switch (name) {
      case "sin": return Math.sin(toRad(x));
      case "cos": return Math.cos(toRad(x));
      case "tan": return Math.tan(toRad(x));
      case "asin": return fromRad(Math.asin(x));
      case "acos": return fromRad(Math.acos(x));
      case "atan": return fromRad(Math.atan(x));
      case "log": return Math.log10(x);
      case "ln": return Math.log(x);
      case "sqrt": return Math.sqrt(x);
      case "exp": return Math.exp(x);
      case "abs": return Math.abs(x);
      default: throw new Error("Função desconhecida");
    }
  }
}

export function evaluate(expr: string, useDegrees = true): number {
  const tokens = tokenize(expr);
  if (tokens.length === 0) return 0;
  return new Parser(tokens, useDegrees).parse();
}

/** Formata o resultado sem lixo de ponto flutuante. */
export function formatResult(n: number): string {
  if (!isFinite(n)) return "Erro";
  if (Number.isInteger(n)) return String(n);
  return String(parseFloat(n.toPrecision(12)));
}
