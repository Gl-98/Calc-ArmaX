/**
 * Núcleo criptográfico — conhecimento zero (zero-knowledge).
 *
 * Regras de ouro (blue team):
 *  - O código de desbloqueio NUNCA é salvo em lugar nenhum (nem em hash direto).
 *  - A chave AES é DERIVADA do código com PBKDF2 (lento, resistente a força bruta)
 *    e vive só na memória (RAM) enquanto o cofre está aberto.
 *  - Todo arquivo é cifrado com AES-256-GCM (confidencialidade + integridade)
 *    antes de sair do dispositivo. O servidor só vê bytes embaralhados.
 *  - Cada arquivo usa um IV aleatório único (nunca reutilizado com a mesma chave).
 *
 * Usa apenas Web Crypto API nativa (window.crypto.subtle) — sem dependências,
 * implementação auditada pelo navegador.
 */

// OWASP (2023) recomenda >= 600k iterações para PBKDF2-HMAC-SHA256.
const PBKDF2_ITERATIONS = 600_000;
const KEY_LENGTH_BITS = 256;
const SALT_BYTES = 16;
const IV_BYTES = 12; // 96 bits, padrão recomendado para AES-GCM.

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Gera bytes aleatórios criptograficamente seguros. */
export function randomBytes(length: number): Uint8Array {
  const b = new Uint8Array(length);
  crypto.getRandomValues(b);
  return b;
}

export function newSalt(): Uint8Array {
  return randomBytes(SALT_BYTES);
}

/**
 * Deriva a chave AES-256 a partir do código + salt.
 * O resultado é uma CryptoKey não-extraível (não dá pra ler os bytes dela).
 */
export async function deriveKey(
  passcode: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passcode),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: KEY_LENGTH_BITS },
    false, // não-extraível
    ["encrypt", "decrypt"]
  );
}

/** Cifra bytes arbitrários. Retorna IV + ciphertext concatenados. */
export async function encryptBytes(
  key: CryptoKey,
  data: ArrayBuffer | Uint8Array
): Promise<Uint8Array> {
  const iv = randomBytes(IV_BYTES);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  const out = new Uint8Array(iv.length + cipher.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(cipher), iv.length);
  return out;
}

/** Decifra bytes produzidos por encryptBytes (IV + ciphertext). */
export async function decryptBytes(
  key: CryptoKey,
  payload: ArrayBuffer | Uint8Array
): Promise<Uint8Array> {
  const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  const iv = bytes.slice(0, IV_BYTES);
  const cipher = bytes.slice(IV_BYTES);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipher
  );
  return new Uint8Array(plain);
}

export async function encryptString(key: CryptoKey, text: string): Promise<Uint8Array> {
  return encryptBytes(key, enc.encode(text));
}

export async function decryptString(key: CryptoKey, payload: Uint8Array): Promise<string> {
  return dec.decode(await decryptBytes(key, payload));
}

/**
 * "Canário" de verificação: cifra uma constante conhecida com a chave.
 * Na hora de desbloquear, tentamos decifrar; se der certo, o código está correto.
 * Assim validamos o código SEM guardar hash dele em lugar nenhum.
 */
const CANARY = "COFRE_OK_v1";

export async function makeVerifier(key: CryptoKey): Promise<Uint8Array> {
  return encryptString(key, CANARY);
}

export async function checkVerifier(key: CryptoKey, verifier: Uint8Array): Promise<boolean> {
  try {
    return (await decryptString(key, verifier)) === CANARY;
  } catch {
    return false;
  }
}

// Helpers base64 (para persistir salt/verifier em texto).
export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
