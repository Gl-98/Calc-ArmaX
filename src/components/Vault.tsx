import { useEffect, useRef, useState } from "react";
import {
  addFile,
  createAlbum,
  deleteAlbum,
  deleteItem,
  getFileBlob,
  listAlbums,
  listItems,
  moveItem,
  renameAlbum,
  type Album,
  type VaultItem,
} from "../lib/vault";
import { cloudEnabled, getVaultId } from "../lib/supabase";

/**
 * Cofre aberto: álbuns, lista, adiciona, visualiza, baixa, move e apaga.
 * Tudo é cifrado/decifrado na hora usando a chave que só existe em memória.
 */
export default function Vault({
  cryptoKey,
  onLock,
}: {
  cryptoKey: CryptoKey;
  onLock: () => void;
}) {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selected, setSelected] = useState<string>(""); // "" = Todos
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ url: string; item: VaultItem } | null>(null);
  const [albumForm, setAlbumForm] = useState<
    { mode: "create" | "rename"; id?: string; name: string } | null
  >(null);
  const [moving, setMoving] = useState<VaultItem | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setLoading(true);
    const [its, albs] = await Promise.all([listItems(cryptoKey), listAlbums(cryptoKey)]);
    setItems(its);
    setAlbums(albs);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = items.filter((i) => (selected ? i.meta.albumId === selected : true));
  const selectedAlbum = albums.find((a) => a.id === selected) || null;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setBusy(true);
    for (const file of Array.from(files)) {
      await addFile(cryptoKey, file, selected); // entra no álbum atual
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    refresh();
  }

  async function download(item: VaultItem) {
    const blob = await getFileBlob(cryptoKey, item.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.meta.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function view(item: VaultItem) {
    const blob = await getFileBlob(cryptoKey, item.id);
    const url = URL.createObjectURL(blob);
    setPreview({ url, item });
  }

  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  async function remove(item: VaultItem) {
    await deleteItem(item.id);
    refresh();
  }

  async function confirmAlbumForm() {
    if (!albumForm) return;
    const name = albumForm.name.trim();
    if (!name) return;
    if (albumForm.mode === "create") {
      const alb = await createAlbum(cryptoKey, name);
      setAlbumForm(null);
      await refresh();
      setSelected(alb.id);
    } else if (albumForm.id) {
      await renameAlbum(cryptoKey, albumForm.id, name);
      setAlbumForm(null);
      refresh();
    }
  }

  async function removeAlbum() {
    if (!selectedAlbum) return;
    await deleteAlbum(cryptoKey, selectedAlbum.id);
    setSelected("");
    refresh();
  }

  async function doMove(albumId: string) {
    if (!moving) return;
    await moveItem(cryptoKey, moving.id, albumId);
    setMoving(null);
    refresh();
  }

  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      {/* Barra superior */}
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">Cofre</h1>
          <p className="text-xs text-slate-500">
            {visible.length} item(ns) • criptografado {cloudEnabled() ? "• nuvem" : "• local"}
          </p>
        </div>
        <button
          onClick={onLock}
          className="rounded-full bg-slate-800 px-4 py-2 text-sm text-violet-300 active:scale-95"
        >
          🔒 Bloquear
        </button>
      </header>

      {/* Barra de álbuns */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-800 px-3 py-2">
        <Chip active={selected === ""} onClick={() => setSelected("")}>
          🗂️ Todos
        </Chip>
        {albums.map((a) => (
          <Chip key={a.id} active={selected === a.id} onClick={() => setSelected(a.id)}>
            📁 {a.name}
          </Chip>
        ))}
        <button
          onClick={() => setAlbumForm({ mode: "create", name: "" })}
          className="shrink-0 rounded-full border border-dashed border-slate-600 px-3 py-1 text-sm text-slate-400 active:scale-95"
        >
          ＋ Álbum
        </button>
      </div>

      {/* Ações do álbum selecionado (renomear/apagar) */}
      {selectedAlbum && (
        <div className="flex items-center gap-3 bg-slate-800/40 px-4 py-1.5 text-xs">
          <span className="text-slate-400">Álbum: {selectedAlbum.name}</span>
          <button
            onClick={() =>
              setAlbumForm({ mode: "rename", id: selectedAlbum.id, name: selectedAlbum.name })
            }
            className="text-violet-300"
          >
            ✏️ Renomear
          </button>
          <button onClick={removeAlbum} className="text-red-400">
            🗑️ Apagar álbum
          </button>
        </div>
      )}

      {/* Grade de itens */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <p className="mt-10 text-center text-slate-500">Descriptografando…</p>
        ) : visible.length === 0 ? (
          <div className="mt-16 text-center text-slate-500">
            <p className="text-4xl">🗂️</p>
            <p className="mt-2">{selected ? "Álbum vazio" : "Cofre vazio"}</p>
            <p className="text-sm">Toque em “+” para adicionar arquivos.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {visible.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                cryptoKey={cryptoKey}
                onView={() => view(item)}
                onDownload={() => download(item)}
                onDelete={() => remove(item)}
                onMove={() => setMoving(item)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Ação flutuante: adicionar */}
      <input ref={fileRef} type="file" multiple className="hidden" onChange={onPick} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="absolute bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-violet-600 text-3xl text-white shadow-lg active:scale-95 disabled:opacity-50"
      >
        {busy ? "…" : "+"}
      </button>

      {/* Criar/renomear álbum (input inline) */}
      {albumForm && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 px-8">
          <div className="w-full rounded-2xl bg-slate-800 p-5">
            <h3 className="mb-3 text-base font-semibold">
              {albumForm.mode === "create" ? "Novo álbum" : "Renomear álbum"}
            </h3>
            <input
              autoFocus
              value={albumForm.name}
              onChange={(e) => setAlbumForm({ ...albumForm, name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && confirmAlbumForm()}
              placeholder="Nome do álbum"
              className="w-full rounded-lg bg-slate-900 px-3 py-2 text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-violet-500"
            />
            <div className="mt-4 flex justify-end gap-3 text-sm">
              <button onClick={() => setAlbumForm(null)} className="px-3 py-1.5 text-slate-400">
                Cancelar
              </button>
              <button
                onClick={confirmAlbumForm}
                className="rounded-lg bg-violet-600 px-4 py-1.5 text-white"
              >
                {albumForm.mode === "create" ? "Criar" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mover item para álbum */}
      {moving && (
        <div
          className="absolute inset-0 z-20 flex items-end bg-black/70"
          onClick={() => setMoving(null)}
        >
          <div
            className="w-full rounded-t-3xl bg-slate-800 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-base font-semibold">Mover para…</h3>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => doMove("")}
                className="rounded-lg px-3 py-2 text-left active:bg-slate-700"
              >
                🗂️ Todos (sem álbum)
              </button>
              {albums.map((a) => (
                <button
                  key={a.id}
                  onClick={() => doMove(a.id)}
                  className="rounded-lg px-3 py-2 text-left active:bg-slate-700"
                >
                  📁 {a.name}
                </button>
              ))}
            </div>
            <button
              onClick={() => setMoving(null)}
              className="mt-3 w-full rounded-lg bg-slate-700 py-2 text-sm text-slate-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Pré-visualização */}
      {preview && (
        <div className="absolute inset-0 z-10 flex flex-col bg-black/95" onClick={closePreview}>
          <div className="flex justify-between p-4 text-white" onClick={(e) => e.stopPropagation()}>
            <span className="truncate text-sm">{preview.item.meta.name}</span>
            <div className="flex gap-4">
              <button onClick={() => download(preview.item)}>⬇️</button>
              <button onClick={closePreview}>✕</button>
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center p-2">
            <PreviewContent url={preview.url} type={preview.item.meta.type} />
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-sm transition active:scale-95 ${
        active ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

function PreviewContent({ url, type }: { url: string; type: string }) {
  if (type.startsWith("image/"))
    return <img src={url} className="max-h-full max-w-full object-contain" />;
  if (type.startsWith("video/"))
    return <video src={url} controls autoPlay className="max-h-full max-w-full" />;
  if (type.startsWith("audio/")) return <audio src={url} controls autoPlay />;
  if (type === "application/pdf")
    return <iframe src={url} className="h-full w-full" title="pdf" />;
  return (
    <div className="text-center text-slate-300">
      <p className="text-5xl">📄</p>
      <p className="mt-2 text-sm">Sem pré-visualização. Use ⬇️ para baixar.</p>
    </div>
  );
}

function ItemCard({
  item,
  cryptoKey,
  onView,
  onDownload,
  onDelete,
  onMove,
}: {
  item: VaultItem;
  cryptoKey: CryptoKey;
  onView: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onMove: () => void;
}) {
  const { type, name, size } = item.meta;
  const [thumb, setThumb] = useState<string | null>(null);

  // Gera miniatura real para foto (imagem direta) e vídeo (1º quadro).
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (type.startsWith("image/")) {
          const blob = await getFileBlob(cryptoKey, item.id);
          objectUrl = URL.createObjectURL(blob);
          if (!cancelled) setThumb(objectUrl);
        } else if (type.startsWith("video/")) {
          const blob = await getFileBlob(cryptoKey, item.id);
          const poster = await videoPoster(blob);
          if (!cancelled) setThumb(poster);
        }
      } catch {
        /* sem miniatura: cai no ícone genérico */
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const isVideo = type.startsWith("video/");
  const icon = type.startsWith("image/")
    ? "🖼️"
    : isVideo
    ? "🎬"
    : type.startsWith("audio/")
    ? "🎵"
    : type === "application/pdf"
    ? "📕"
    : "📄";

  return (
    <div className="flex flex-col overflow-hidden rounded-xl bg-slate-800">
      <button
        onClick={onView}
        className="relative flex aspect-square items-center justify-center overflow-hidden text-4xl active:opacity-80"
      >
        {thumb ? (
          <>
            <img src={thumb} alt="" className="h-full w-full object-cover" />
            {isVideo && (
              <span className="absolute flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-lg text-white">
                ▶
              </span>
            )}
          </>
        ) : (
          icon
        )}
      </button>
      <div className="px-2 py-1">
        <p className="truncate text-xs text-slate-300">{name}</p>
        <p className="text-[10px] text-slate-500">{formatSize(size)}</p>
      </div>
      <div className="flex border-t border-slate-700 text-xs">
        <button onClick={onDownload} className="flex-1 py-1 text-violet-300 active:bg-slate-700">
          ⬇️
        </button>
        <button onClick={onMove} className="flex-1 border-l border-slate-700 py-1 text-slate-300 active:bg-slate-700">
          📁
        </button>
        <button onClick={onDelete} className="flex-1 border-l border-slate-700 py-1 text-red-400 active:bg-slate-700">
          🗑️
        </button>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

/** Extrai o primeiro quadro de um vídeo como miniatura (dataURL jpeg). */
function videoPoster(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    const url = URL.createObjectURL(blob);
    const cleanup = () => URL.revokeObjectURL(url);
    v.onloadeddata = () => {
      try {
        v.currentTime = Math.min(0.1, (v.duration || 1) / 2);
      } catch {
        cleanup();
        reject(new Error("seek"));
      }
    };
    v.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth || 320;
      canvas.height = v.videoHeight || 320;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        cleanup();
        reject(new Error("ctx"));
        return;
      }
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      cleanup();
      resolve(canvas.toDataURL("image/jpeg", 0.6));
    };
    v.onerror = () => {
      cleanup();
      reject(new Error("video"));
    };
    v.src = url;
  });
}

// Exportado para eventual tela de configuração de sincronização.
export function currentVaultId(): string {
  return getVaultId();
}
