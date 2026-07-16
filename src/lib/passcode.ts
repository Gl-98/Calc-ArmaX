/**
 * Gerência do código de desbloqueio.
 *
 * O que fica salvo no dispositivo (localStorage):
 *  - salt (não é segredo, serve pra derivar a chave)
 *  - verifier (canário cifrado — permite validar o código sem armazená-lo)
 *  - contador de tentativas erradas (para wipe automático opcional)
 *
 * O código em si e a chave derivada NUNCA são persistidos.
 */
import {
  checkVerifier,
  deriveKey,
  fromBase64,
  makeVerifier,
  newSalt,
  toBase64,
} from "./crypto";
import { rekeyAll } from "./vault";

const SALT_KEY = "app.cfg.s";
const VERIFIER_KEY = "app.cfg.v";
const FAILS_KEY = "app.cfg.f";

// Após esse número de tentativas erradas seguidas, o cofre é apagado (anti-força-bruta).
export const MAX_FAILS = 10;

// Código reservado: digitá-lo na calculadora abre a tela de troca de senha.
// Por isso NÃO pode ser usado como senha do cofre.
export const RESERVED_CODE = "0000";

export function isConfigured(): boolean {
  return !!localStorage.getItem(SALT_KEY) && !!localStorage.getItem(VERIFIER_KEY);
}

/** Primeira execução: define o código e cria salt + verifier. */
export async function setupPasscode(passcode: string): Promise<CryptoKey> {
  const salt = newSalt();
  const key = await deriveKey(passcode, salt);
  const verifier = await makeVerifier(key);
  localStorage.setItem(SALT_KEY, toBase64(salt));
  localStorage.setItem(VERIFIER_KEY, toBase64(verifier));
  localStorage.setItem(FAILS_KEY, "0");
  return key;
}

/**
 * Tenta desbloquear. Retorna a CryptoKey se o código bater, ou null.
 * Conta tentativas erradas e sinaliza quando o limite estoura.
 */
export async function tryUnlock(
  passcode: string
): Promise<{ key: CryptoKey | null; wiped: boolean }> {
  const saltB64 = localStorage.getItem(SALT_KEY);
  const verB64 = localStorage.getItem(VERIFIER_KEY);
  if (!saltB64 || !verB64) return { key: null, wiped: false };

  const key = await deriveKey(passcode, fromBase64(saltB64));
  const ok = await checkVerifier(key, fromBase64(verB64));

  if (ok) {
    localStorage.setItem(FAILS_KEY, "0");
    return { key, wiped: false };
  }

  const fails = Number(localStorage.getItem(FAILS_KEY) ?? "0") + 1;
  localStorage.setItem(FAILS_KEY, String(fails));
  return { key: null, wiped: fails >= MAX_FAILS };
}

/**
 * Troca a senha SEM perder os arquivos.
 * Exige a senha ATUAL correta (para decifrar e re-cifrar tudo com a nova).
 * Retorna a nova chave em memória se der certo.
 */
export async function changePasscode(
  currentCode: string,
  newCode: string
): Promise<{ ok: boolean; reason?: "wrong-current" | "reserved" | "not-configured"; key?: CryptoKey; count?: number }> {
  if (newCode === RESERVED_CODE) return { ok: false, reason: "reserved" };

  const saltB64 = localStorage.getItem(SALT_KEY);
  const verB64 = localStorage.getItem(VERIFIER_KEY);
  if (!saltB64 || !verB64) return { ok: false, reason: "not-configured" };

  // 1) Confere a senha atual.
  const oldKey = await deriveKey(currentCode, fromBase64(saltB64));
  const valid = await checkVerifier(oldKey, fromBase64(verB64));
  if (!valid) return { ok: false, reason: "wrong-current" };

  // 2) Deriva a nova chave (novo salt) e re-criptografa todos os arquivos.
  const salt = newSalt();
  const newKey = await deriveKey(newCode, salt);
  const count = await rekeyAll(oldKey, newKey);

  // 3) Grava a nova configuração.
  const verifier = await makeVerifier(newKey);
  localStorage.setItem(SALT_KEY, toBase64(salt));
  localStorage.setItem(VERIFIER_KEY, toBase64(verifier));
  localStorage.setItem(FAILS_KEY, "0");
  return { ok: true, key: newKey, count };
}

export function getFails(): number {
  return Number(localStorage.getItem(FAILS_KEY) ?? "0");
}

export function resetFails(): void {
  localStorage.setItem(FAILS_KEY, "0");
}
