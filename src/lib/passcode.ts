/**
 * Gerência do código de desbloqueio.
 *
 * A configuração (salt + verifier + tentativas) fica no IndexedDB (durável),
 * NÃO no localStorage — que celulares/Safari apagam com facilidade, fazendo o
 * app "esquecer" a senha. Há migração automática do formato antigo (localStorage).
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
import { rekeyAll, readConfig, writeConfig, type StoredConfig } from "./vault";

// Após esse número de tentativas erradas seguidas, o cofre é apagado (anti-força-bruta).
export const MAX_FAILS = 10;

// Código reservado: digitá-lo na calculadora abre a tela de troca de senha.
// Por isso NÃO pode ser usado como senha do cofre.
export const RESERVED_CODE = "0000";

// Chaves do formato antigo (localStorage) — só para migrar 1x.
const OLD_SALT = "app.cfg.s";
const OLD_VER = "app.cfg.v";
const OLD_FAILS = "app.cfg.f";

/**
 * Lê a config do IndexedDB. Se não existir, tenta migrar do localStorage antigo.
 */
async function loadConfig(): Promise<StoredConfig | null> {
  const cfg = await readConfig();
  if (cfg) return cfg;

  const s = localStorage.getItem(OLD_SALT);
  const v = localStorage.getItem(OLD_VER);
  if (s && v) {
    const migrated = { saltB64: s, verifierB64: v, fails: Number(localStorage.getItem(OLD_FAILS) ?? "0") };
    await writeConfig(migrated);
    localStorage.removeItem(OLD_SALT);
    localStorage.removeItem(OLD_VER);
    localStorage.removeItem(OLD_FAILS);
    return { k: "cfg", ...migrated };
  }
  return null;
}

/** Pede armazenamento persistente (o navegador não descarta o cofre). */
async function ensurePersisted(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* alguns navegadores não suportam; ignora */
  }
}

export async function isConfigured(): Promise<boolean> {
  return !!(await loadConfig());
}

/** Primeira execução: define o código e cria salt + verifier. */
export async function setupPasscode(passcode: string): Promise<CryptoKey> {
  const salt = newSalt();
  const key = await deriveKey(passcode, salt);
  const verifier = await makeVerifier(key);
  await writeConfig({ saltB64: toBase64(salt), verifierB64: toBase64(verifier), fails: 0 });
  await ensurePersisted();
  return key;
}

/**
 * Tenta desbloquear. Retorna a CryptoKey se o código bater, ou null.
 * Conta tentativas erradas e sinaliza quando o limite estoura.
 */
export async function tryUnlock(
  passcode: string
): Promise<{ key: CryptoKey | null; wiped: boolean }> {
  const cfg = await loadConfig();
  if (!cfg) return { key: null, wiped: false };

  const key = await deriveKey(passcode, fromBase64(cfg.saltB64));
  const ok = await checkVerifier(key, fromBase64(cfg.verifierB64));

  if (ok) {
    if (cfg.fails !== 0) {
      await writeConfig({ saltB64: cfg.saltB64, verifierB64: cfg.verifierB64, fails: 0 });
    }
    await ensurePersisted();
    return { key, wiped: false };
  }

  const fails = cfg.fails + 1;
  await writeConfig({ saltB64: cfg.saltB64, verifierB64: cfg.verifierB64, fails });
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

  const cfg = await loadConfig();
  if (!cfg) return { ok: false, reason: "not-configured" };

  // 1) Confere a senha atual.
  const oldKey = await deriveKey(currentCode, fromBase64(cfg.saltB64));
  const valid = await checkVerifier(oldKey, fromBase64(cfg.verifierB64));
  if (!valid) return { ok: false, reason: "wrong-current" };

  // 2) Deriva a nova chave (novo salt) e re-criptografa todos os arquivos.
  const salt = newSalt();
  const newKey = await deriveKey(newCode, salt);
  const count = await rekeyAll(oldKey, newKey);

  // 3) Grava a nova configuração.
  const verifier = await makeVerifier(newKey);
  await writeConfig({ saltB64: toBase64(salt), verifierB64: toBase64(verifier), fails: 0 });
  await ensurePersisted();
  return { ok: true, key: newKey, count };
}
