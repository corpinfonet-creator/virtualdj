"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Disc3,
  HardDrive,
  LoaderCircle,
  Music2,
  UploadCloud,
} from "lucide-react";

type ApiTrack = {
  id: string;
  title: string;
  artist: string;
  genre?: string;
  durationMs: number;
  analysis?: { bpm?: number; musicalKey?: string };
  assets?: Array<{ id: string; storageKey: string; mimeType: string }>;
};
type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  genre?: string;
};

function LibraryPagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <nav
      aria-label="Paginación de pistas"
      className="mt-5 flex items-center justify-center gap-3"
    >
      <button
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className="rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-30"
      >
        Anterior
      </button>
      <span className="text-sm text-slate-400">
        Página <b className="text-white">{page}</b> de {totalPages} · {total}{" "}
        pistas
      </span>
      <button
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
        className="rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-30"
      >
        Siguiente
      </button>
    </nav>
  );
}

export default function LibraryPage() {
  const [tracks, setTracks] = useState<ApiTrack[]>([]);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [trackPage, setTrackPage] = useState(1);
  const [trackMeta, setTrackMeta] = useState({ total: 0, totalPages: 1 });
  const [activeDrive, setActiveDrive] = useState<"01" | "02" | "03">("01");
  const [folderIds, setFolderIds] = useState<
    Record<"01" | "02" | "03", string>
  >({ "01": "", "02": "", "03": "" });
  useEffect(() => {
    setFolderIds({
      "01": localStorage.getItem("autodj-folder-01") ?? "",
      "02": localStorage.getItem("autodj-folder-02") ?? "",
      "03": localStorage.getItem("autodj-folder-03") ?? "",
    });
  }, []);
  const load = useCallback(
    async (page = trackPage) => {
      setLoading(true);
      const response = await fetch(`/api/tracks?page=${page}&pageSize=9`, {
        cache: "no-store",
      });
      if (response.status === 401) {
        location.href = "/login";
        return;
      }
      const body = await response.json();
      setTracks(body.data ?? []);
      setTrackMeta({
        total: body.meta?.total ?? 0,
        totalPages: body.meta?.totalPages ?? 1,
      });
      setLoading(false);
    },
    [trackPage],
  );
  useEffect(() => {
    load().catch(() => {
      setMessage("No se pudo consultar la biblioteca.");
      setLoading(false);
    });
  }, [load]);
  useEffect(() => {
    const folderId = folderIds[activeDrive];
    fetch(
      `/api/providers/google-drive/files?drive=${activeDrive}${folderId ? `&folderId=${encodeURIComponent(folderId)}` : ""}`,
      {
        cache: "no-store",
      },
    )
      .then(async (response) => {
        const body = await response.json();
        if (response.status === 401) return;
        if (!response.ok)
          throw new Error(body.error ?? "No se pudo leer Drive.");
        const files = body.data ?? [];
        setDriveFiles(files);
        setMessage(
          files.length === 0
            ? "Google Drive conectado, pero no se encontraron audios compatibles."
            : `Drive ${activeDrive}: ${files.length} audios encontrados.`,
        );
      })
      .catch((error) =>
        setMessage(
          error instanceof Error ? error.message : "No se pudo leer Drive.",
        ),
      );
  }, [activeDrive, folderIds]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("drive") === "connected")
      setMessage(
        `Google Drive conectado: ${params.get("folder") ?? "carpeta autorizada"}.`,
      );
    else if (params.get("drive") === "error")
      setMessage(
        `No se pudo conectar Drive: ${params.get("message") ?? "error de autorización"}.`,
      );
  }, []);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploading(true);
    setMessage("");
    const form = event.currentTarget;
    const response = await fetch("/api/tracks/upload", {
      method: "POST",
      body: new FormData(form),
    });
    const body = await response.json();
    if (response.ok) {
      setMessage(
        "Audio recibido en cuarentena. El análisis musical será la siguiente etapa.",
      );
      form.reset();
      await load();
    } else
      setMessage(
        body.error === "DUPLICATE_AUDIO"
          ? "Ese archivo ya existe en la biblioteca."
          : body.error === "UNSUPPORTED_AUDIO"
            ? "Formato o firma de audio no compatible."
            : (body.message ?? body.error ?? "Error al subir el archivo."),
      );
    setUploading(false);
  }
  async function syncDrive(
    slot = activeDrive,
    suppliedFolderId = folderIds[slot],
    confirmReplace = true,
  ) {
    if (
      confirmReplace &&
      !window.confirm(
        "Se eliminarán solamente las pistas registradas desde Drive y se reconstruirán usando sus carpetas como géneros. ¿Continuar?",
      )
    )
      return;
    setSyncing(true);
    setMessage("Reconstruyendo catálogo por géneros desde Google Drive...");
    try {
      const response = await fetch(
        `/api/providers/google-drive/sync?replace=1&drive=${slot}${suppliedFolderId ? `&folderId=${encodeURIComponent(suppliedFolderId)}` : ""}`,
        { method: "POST" },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "No se pudo sincronizar Drive.");
      setMessage(
        `Sincronización por géneros terminada: ${body.data.created} pistas importadas y ${body.data.removed} registros anteriores limpiados.`,
      );
      setTrackPage(1);
      await load(1);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo sincronizar Drive.",
      );
    } finally {
      setSyncing(false);
    }
  }
  async function configureDrive(slot: "01" | "02" | "03") {
    const input = window.prompt(
      `Pega el ID o enlace de la carpeta para Drive ${slot}:`,
      folderIds[slot],
    );
    if (input === null) return;
    const raw = input.trim();
    const folderId =
      raw.match(/\/folders\/([\w-]+)/)?.[1] ?? raw.split(/[?&#/]/)[0];
    if (!/^[\w-]{10,}$/.test(folderId)) {
      setMessage("El ID o enlace de carpeta no es válido.");
      return;
    }
    localStorage.setItem(`autodj-folder-${slot}`, folderId);
    setFolderIds((current) => ({ ...current, [slot]: folderId }));
    setActiveDrive(slot);
    await syncDrive(slot, folderId, false);
  }
  return (
    <main className="min-h-screen p-4 lg:p-7">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/"
            className="mb-2 flex items-center gap-1 text-xs text-slate-500 hover:text-cyan"
          >
            <ArrowLeft size={14} /> Cabina
          </Link>
          <h1 className="text-2xl font-black">Biblioteca musical</h1>
          <p className="text-sm text-slate-500">
            Assets locales autorizados y aislados por empresa
          </p>
        </div>
        <Music2 className="text-cyan" />
      </header>
      <div className="grid gap-5 xl:grid-cols-[390px_1fr]">
        <div className="space-y-5">
          <section className="panel space-y-3 rounded-2xl p-5">
            <div className="flex items-center gap-2">
              <HardDrive className="text-cyan" />
              <h2 className="font-bold">Google Drive</h2>
            </div>
            <p className="text-sm text-slate-400">
              Drive almacena los audios; la carpeta inmediata de cada canción se
              registra como su género.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(["01", "02", "03"] as const).map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => configureDrive(slot)}
                  className={`rounded-lg border px-2 py-2 text-xs font-bold ${activeDrive === slot ? "border-cyan bg-cyan/15 text-cyan" : "border-slate-700 text-slate-400"}`}
                >
                  DRIVE {slot} {folderIds[slot] ? "✓" : "+"}
                </button>
              ))}
            </div>
            {driveFiles.length > 0 && (
              <div className="max-h-72 space-y-2 overflow-auto rounded-xl bg-white/5 p-2">
                <p className="px-2 text-xs font-bold text-cyan">
                  {driveFiles.length} audios encontrados
                </p>
                {driveFiles.map((file) => (
                  <a
                    key={file.id}
                    href={file.webViewLink ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-xs text-slate-300 hover:bg-white/5"
                  >
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="max-w-28 truncate rounded bg-cyan/10 px-2 py-0.5 text-[10px] text-cyan">
                      {file.genre ?? "General"}
                    </span>
                  </a>
                ))}
              </div>
            )}
            <button
              disabled={syncing || !driveFiles.length}
              onClick={() => syncDrive()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan py-3 font-bold text-ink disabled:opacity-40"
            >
              {syncing ? (
                <LoaderCircle className="animate-spin" size={18} />
              ) : (
                <Music2 size={18} />
              )}{" "}
              Sincronizar Drive {activeDrive}
            </button>
            <a
              href="/api/auth/google-drive/connect"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan/40 py-3 font-bold text-cyan hover:bg-cyan/10"
            >
              <HardDrive size={18} /> Conectar Google Drive
            </a>
          </section>
          <form
            onSubmit={upload}
            className="panel h-fit space-y-4 rounded-2xl p-5"
          >
            <div className="flex items-center gap-2">
              <UploadCloud className="text-cyan" />
              <h2 className="font-bold">Importar audio autorizado</h2>
            </div>
            <input
              name="file"
              type="file"
              accept="audio/mpeg,audio/wav,audio/flac,audio/ogg,audio/mp4,.mp3,.wav,.flac,.ogg,.m4a"
              required
              className="w-full rounded-xl border border-dashed border-slate-600 p-4 text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                name="title"
                required
                placeholder="Canción"
                className="rounded-xl border border-slate-700 bg-ink px-3 py-2"
              />
              <input
                name="artist"
                required
                placeholder="Artista"
                className="rounded-xl border border-slate-700 bg-ink px-3 py-2"
              />
              <input
                name="genre"
                placeholder="Género"
                className="rounded-xl border border-slate-700 bg-ink px-3 py-2"
              />
              <input
                name="durationMs"
                type="number"
                min="1000"
                required
                placeholder="Duración ms"
                className="rounded-xl border border-slate-700 bg-ink px-3 py-2"
              />
            </div>
            <select
              name="licenseType"
              className="w-full rounded-xl border border-slate-700 bg-ink px-3 py-2"
            >
              <option value="OWNED">Archivo propio</option>
              <option value="LICENSED">Licenciado</option>
              <option value="ROYALTY_FREE">Royalty-free</option>
              <option value="PUBLIC_DOMAIN">Dominio público</option>
            </select>
            <textarea
              name="licenseReference"
              required
              minLength={3}
              placeholder="Referencia de licencia, factura o declaración de propiedad"
              className="min-h-24 w-full rounded-xl border border-slate-700 bg-ink p-3"
            />
            <button
              disabled={uploading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan py-3 font-bold text-ink disabled:opacity-60"
            >
              {uploading ? (
                <LoaderCircle className="animate-spin" size={18} />
              ) : (
                <UploadCloud size={18} />
              )}{" "}
              Subir a cuarentena
            </button>
            {message && (
              <p className="rounded-xl bg-white/5 p-3 text-sm text-slate-300">
                {message}
              </p>
            )}
          </form>
        </div>
        <section className="panel rounded-2xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">Pistas registradas</h2>
            <span className="rounded-full bg-cyan/10 px-3 py-1 text-xs text-cyan">
              {tracks.length}
            </span>
          </div>
          {loading ? (
            <LoaderCircle className="animate-spin text-cyan" />
          ) : (
            <div className="space-y-2">
              {tracks.map((track) => (
                <article
                  key={track.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-800 p-3"
                >
                  <span className="rounded-lg bg-white/5 p-2 text-cyan">
                    <Disc3 />
                  </span>
                  <div className="min-w-0 flex-1">
                    <b className="block truncate">{track.title}</b>
                    <small className="text-slate-500">
                      {track.artist} · {track.genre ?? "Sin género"}
                    </small>
                  </div>
                  <span className="text-xs text-slate-400">
                    {track.analysis?.bpm
                      ? `${track.analysis.bpm} BPM`
                      : "Pendiente"}
                  </span>
                </article>
              ))}
              {!tracks.length && (
                <p className="py-12 text-center text-slate-500">
                  La biblioteca aún no contiene pistas.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
      <LibraryPagination
        page={trackPage}
        totalPages={trackMeta.totalPages}
        total={trackMeta.total}
        onPage={setTrackPage}
      />
    </main>
  );
}
