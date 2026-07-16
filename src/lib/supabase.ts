/**
 * Sincronização opcional com Supabase (nuvem grátis) — ZERO-KNOWLEDGE.
 *
 * IMPORTANTE: só sobem para a nuvem BYTES JÁ CIFRADOS. O Supabase nunca recebe
 * o código, a chave, o nome real dos arquivos nem o conteúdo em claro.
 *
 * Fica INATIVO até você preencher VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
 * no arquivo .env. Sem isso, o app funciona 100% local (IndexedDB).
 *
 * Cada dispositivo tem um "vaultId" aleatório (guardado localmente). Ele é o
 * identificador da sua pasta na nuvem. Guarde-o se quiser acessar de outro
 * aparelho (veja o README, seção "Sincronizar entre aparelhos").
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { toBase64, fromBase64 } from "./crypto";

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
const BUCKET = "vault";
const VAULT_ID_KEY = "app.cloud.vid";

let client: SupabaseClient | null = null;

export function cloudEnabled(): boolean {
  return !!URL && !!ANON;
}

function db(): SupabaseClient {
  if (!client) {
    if (!cloudEnabled()) throw new Error("Nuvem não configurada");
    client = createClient(URL!, ANON!);
  }
  return client;
}

export function getVaultId(): string {
  let id = localStorage.getItem(VAULT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VAULT_ID_KEY, id);
  }
  return id;
}

export function setVaultId(id: string): void {
  localStorage.setItem(VAULT_ID_KEY, id);
}

export interface CloudRecord {
  id: string;
  metaEnc: Uint8Array;
  dataEnc: Uint8Array;
}

/** Sobe um item cifrado: conteúdo no Storage, meta cifrada na tabela. */
export async function pushItem(rec: CloudRecord): Promise<void> {
  const s = db();
  const vid = getVaultId();
  const path = `${vid}/${rec.id}.bin`;

  const up = await s.storage
    .from(BUCKET)
    .upload(path, new Blob([rec.dataEnc]), { upsert: true, contentType: "application/octet-stream" });
  if (up.error) throw up.error;

  const ins = await s.from("vault_items").upsert({
    id: rec.id,
    vault_id: vid,
    meta_enc: toBase64(rec.metaEnc),
    data_path: path,
  });
  if (ins.error) throw ins.error;
}

/** Baixa a lista de metas cifradas da nuvem. */
export async function pullMetas(): Promise<{ id: string; metaEnc: Uint8Array }[]> {
  const s = db();
  const vid = getVaultId();
  const { data, error } = await s
    .from("vault_items")
    .select("id, meta_enc")
    .eq("vault_id", vid);
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, metaEnc: fromBase64(r.meta_enc as string) }));
}

/** Baixa o conteúdo cifrado de um item da nuvem. */
export async function pullData(id: string): Promise<Uint8Array> {
  const s = db();
  const vid = getVaultId();
  const { data, error } = await s.storage.from(BUCKET).download(`${vid}/${id}.bin`);
  if (error) throw error;
  return new Uint8Array(await data.arrayBuffer());
}

export async function removeFromCloud(id: string): Promise<void> {
  const s = db();
  const vid = getVaultId();
  await s.storage.from(BUCKET).remove([`${vid}/${id}.bin`]);
  await s.from("vault_items").delete().eq("id", id).eq("vault_id", vid);
}
