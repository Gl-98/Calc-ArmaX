/**
 * Cofre local (IndexedDB) — camada de armazenamento que funciona 100% offline.
 *
 * Stores:
 *  - "items":  cada arquivo -> { id, metaEnc, dataEnc } (meta e conteúdo cifrados).
 *  - "albums": cada álbum/pasta -> { id, nameEnc } (nome cifrado).
 *
 * Nada aqui é legível sem a CryptoKey derivada do código. Até o NOME do álbum é
 * criptografado (conhecimento zero).
 */
import { decryptBytes, decryptString, encryptBytes, encryptString } from "./crypto";

const DB_NAME = "app_store";
const ITEMS = "items";
const ALBUMS = "albums";
const CONFIG = "config";
const DB_VERSION = 3;

// Configuração da senha (salt + verifier + tentativas), guardada AQUI no
// IndexedDB (não no localStorage, que o celular apaga com facilidade).
export interface StoredConfig {
  k: string; // sempre "cfg"
  saltB64: string;
  verifierB64: string;
  fails: number;
}

export interface FileMeta {
  name: string;
  type: string;
  size: number;
  createdAt: number;
  albumId: string; // "" = sem álbum (fica em "Todos")
}

export interface VaultItem {
  id: string;
  meta: FileMeta; // já decifrada, para exibir na UI
}

export interface Album {
  id: string;
  name: string; // já decifrado
}

interface StoredRecord {
  id: string;
  metaEnc: ArrayBuffer;
  dataEnc: ArrayBuffer;
}

interface StoredAlbum {
  id: string;
  nameEnc: ArrayBuffer;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ITEMS)) db.createObjectStore(ITEMS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(ALBUMS)) db.createObjectStore(ALBUMS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(CONFIG)) db.createObjectStore(CONFIG, { keyPath: "k" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

function uuid(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------- ARQUIVOS

/** Cifra e adiciona um arquivo ao cofre (opcionalmente dentro de um álbum). */
export async function addFile(key: CryptoKey, file: File, albumId = ""): Promise<VaultItem> {
  const meta: FileMeta = {
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    createdAt: Date.now(),
    albumId,
  };
  const buf = await file.arrayBuffer();
  const metaEnc = await encryptString(key, JSON.stringify(meta));
  const dataEnc = await encryptBytes(key, buf);

  const id = uuid();
  await tx(ITEMS, "readwrite", (s) =>
    s.put({ id, metaEnc: metaEnc.buffer, dataEnc: dataEnc.buffer } as StoredRecord)
  );
  return { id, meta };
}

/** Lista os itens (decifra só a meta, não o conteúdo — mais rápido). */
export async function listItems(key: CryptoKey): Promise<VaultItem[]> {
  const records = await tx<StoredRecord[]>(ITEMS, "readonly", (s) => s.getAll() as IDBRequest<StoredRecord[]>);
  const items: VaultItem[] = [];
  for (const r of records) {
    try {
      const metaJson = await decryptString(key, new Uint8Array(r.metaEnc));
      const meta = JSON.parse(metaJson) as FileMeta;
      if (meta.albumId === undefined) meta.albumId = ""; // compat. registros antigos
      items.push({ id: r.id, meta });
    } catch {
      // Meta que não decifra = chave errada ou registro corrompido; ignora.
    }
  }
  return items.sort((a, b) => b.meta.createdAt - a.meta.createdAt);
}

/** Decifra o conteúdo completo de um item e devolve um Blob pronto pra baixar/visualizar. */
export async function getFileBlob(key: CryptoKey, id: string): Promise<Blob> {
  const r = await tx<StoredRecord | undefined>(ITEMS, "readonly", (s) => s.get(id) as IDBRequest<StoredRecord | undefined>);
  if (!r) throw new Error("Item não encontrado");
  const metaJson = await decryptString(key, new Uint8Array(r.metaEnc));
  const meta = JSON.parse(metaJson) as FileMeta;
  const data = await decryptBytes(key, new Uint8Array(r.dataEnc));
  return new Blob([data], { type: meta.type });
}

export async function deleteItem(id: string): Promise<void> {
  await tx(ITEMS, "readwrite", (s) => s.delete(id));
}

/** Move um item para outro álbum (re-cifra só a meta; o conteúdo fica igual). */
export async function moveItem(key: CryptoKey, id: string, albumId: string): Promise<void> {
  const r = await tx<StoredRecord | undefined>(ITEMS, "readonly", (s) => s.get(id) as IDBRequest<StoredRecord | undefined>);
  if (!r) return;
  const meta = JSON.parse(await decryptString(key, new Uint8Array(r.metaEnc))) as FileMeta;
  meta.albumId = albumId;
  const metaEnc = await encryptString(key, JSON.stringify(meta));
  await tx(ITEMS, "readwrite", (s) =>
    s.put({ id: r.id, metaEnc: metaEnc.buffer, dataEnc: r.dataEnc } as StoredRecord)
  );
}

// ---------------------------------------------------------------- ÁLBUNS

export async function listAlbums(key: CryptoKey): Promise<Album[]> {
  const records = await tx<StoredAlbum[]>(ALBUMS, "readonly", (s) => s.getAll() as IDBRequest<StoredAlbum[]>);
  const albums: Album[] = [];
  for (const r of records) {
    try {
      albums.push({ id: r.id, name: await decryptString(key, new Uint8Array(r.nameEnc)) });
    } catch {
      /* ignora álbum que não decifra */
    }
  }
  return albums.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createAlbum(key: CryptoKey, name: string): Promise<Album> {
  const id = uuid();
  const nameEnc = await encryptString(key, name);
  await tx(ALBUMS, "readwrite", (s) => s.put({ id, nameEnc: nameEnc.buffer } as StoredAlbum));
  return { id, name };
}

export async function renameAlbum(key: CryptoKey, id: string, name: string): Promise<void> {
  const nameEnc = await encryptString(key, name);
  await tx(ALBUMS, "readwrite", (s) => s.put({ id, nameEnc: nameEnc.buffer } as StoredAlbum));
}

/** Apaga o álbum. Os itens dele NÃO são apagados: voltam para "Todos". */
export async function deleteAlbum(key: CryptoKey, id: string): Promise<void> {
  const items = await listItems(key);
  for (const it of items) {
    if (it.meta.albumId === id) await moveItem(key, it.id, "");
  }
  await tx(ALBUMS, "readwrite", (s) => s.delete(id));
}

// ---------------------------------------------------------------- CONFIG (senha)

export async function readConfig(): Promise<StoredConfig | null> {
  const r = await tx<StoredConfig | undefined>(CONFIG, "readonly", (s) => s.get("cfg") as IDBRequest<StoredConfig | undefined>);
  return r ?? null;
}

export async function writeConfig(cfg: Omit<StoredConfig, "k">): Promise<void> {
  await tx(CONFIG, "readwrite", (s) => s.put({ k: "cfg", ...cfg }));
}

export async function clearConfig(): Promise<void> {
  await tx(CONFIG, "readwrite", (s) => s.delete("cfg"));
}

// ---------------------------------------------------------------- MANUTENÇÃO

/**
 * Re-criptografa TUDO (itens + nomes de álbum): decifra com a chave antiga e
 * cifra de novo com a nova. Usado ao trocar a senha SEM perder os arquivos.
 */
export async function rekeyAll(oldKey: CryptoKey, newKey: CryptoKey): Promise<number> {
  const records = await tx<StoredRecord[]>(ITEMS, "readonly", (s) => s.getAll() as IDBRequest<StoredRecord[]>);
  let count = 0;
  for (const r of records) {
    const meta = await decryptBytes(oldKey, new Uint8Array(r.metaEnc));
    const data = await decryptBytes(oldKey, new Uint8Array(r.dataEnc));
    const metaEnc = await encryptBytes(newKey, meta);
    const dataEnc = await encryptBytes(newKey, data);
    await tx(ITEMS, "readwrite", (s) =>
      s.put({ id: r.id, metaEnc: metaEnc.buffer, dataEnc: dataEnc.buffer } as StoredRecord)
    );
    count++;
  }
  const albums = await tx<StoredAlbum[]>(ALBUMS, "readonly", (s) => s.getAll() as IDBRequest<StoredAlbum[]>);
  for (const a of albums) {
    const name = await decryptBytes(oldKey, new Uint8Array(a.nameEnc));
    const nameEnc = await encryptBytes(newKey, name);
    await tx(ALBUMS, "readwrite", (s) => s.put({ id: a.id, nameEnc: nameEnc.buffer } as StoredAlbum));
  }
  return count;
}

/** Apaga TODO o cofre (usado no wipe automático por tentativas erradas). */
export async function wipeVault(): Promise<void> {
  await tx(ITEMS, "readwrite", (s) => s.clear());
  await tx(ALBUMS, "readwrite", (s) => s.clear());
  await tx(CONFIG, "readwrite", (s) => s.clear());
  // Limpa também resíduos da versão antiga (localStorage).
  localStorage.removeItem("app.cfg.s");
  localStorage.removeItem("app.cfg.v");
  localStorage.removeItem("app.cfg.f");
}
