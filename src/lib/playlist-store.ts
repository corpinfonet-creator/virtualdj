export type StoredTrack = {
  id: string;
  file: File;
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  key: string;
  energy: number;
  popularity?: number;
  requests?: number;
  favorite?: boolean;
  blocked?: boolean;
  [key: string]: unknown;
};
export type StoredPlaylist = {
  id: string;
  name: string;
  tracks: StoredTrack[];
  createdAt: string;
  updatedAt: string;
};
export type StoredHistory = {
  id: string;
  trackId: string;
  title: string;
  artist: string;
  playedAt: string;
  selection: "AUTODJ" | "MANUAL";
  bpm: number;
  genre: string;
};
export type StoredJingle = {
  id: string;
  name: string;
  file: File;
  intervalMinutes: number;
  duckLevel: number;
  enabled: boolean;
  nextAt: string;
  lastPlayedAt?: string;
};
export type StoredSession = {
  id: "active";
  queue: StoredTrack[];
  savedAt: string;
};
export type StoredPerformanceSample = {
  id: string;
  deck: "A" | "B";
  kind: "base" | "bass" | "voice" | "jingle";
  name: string;
  file: File;
  createdAt: string;
};
export type StoredLocalMusic = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  durationMs: number;
  file: File;
  analysis?: unknown;
  createdAt: string;
};
export type StoredDeckPlay = {
  id: string;
  trackId: string;
  title: string;
  artist: string;
  genre?: string;
  bpm?: number;
  musicalKey?: string;
  playedAt: string;
};

const DB_NAME = "autodj-local",
  VERSION = 4;
function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("playlists"))
        db.createObjectStore("playlists", { keyPath: "id" });
      if (!db.objectStoreNames.contains("history")) {
        const history = db.createObjectStore("history", { keyPath: "id" });
        history.createIndex("playedAt", "playedAt");
      }
      if (!db.objectStoreNames.contains("jingles"))
        db.createObjectStore("jingles", { keyPath: "id" });
      if (!db.objectStoreNames.contains("sessions"))
        db.createObjectStore("sessions", { keyPath: "id" });
      if (!db.objectStoreNames.contains("performancePads"))
        db.createObjectStore("performancePads", { keyPath: "id" });
      if (!db.objectStoreNames.contains("localMusic"))
        db.createObjectStore("localMusic", { keyPath: "id" });
      if (!db.objectStoreNames.contains("deckHistory"))
        db.createObjectStore("deckHistory", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
type StoreName =
  | "playlists"
  | "history"
  | "jingles"
  | "sessions"
  | "performancePads"
  | "localMusic"
  | "deckHistory";
async function transaction<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode),
      request = action(tx.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function listPlaylists() {
  return transaction<StoredPlaylist[]>("playlists", "readonly", (store) =>
    store.getAll(),
  );
}
export async function savePlaylist(
  name: string,
  tracks: StoredTrack[],
  id = crypto.randomUUID(),
) {
  const existing = (await listPlaylists()).find((item) => item.id === id);
  const now = new Date().toISOString();
  const playlist: StoredPlaylist = {
    id,
    name,
    tracks,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await transaction("playlists", "readwrite", (store) => store.put(playlist));
  return playlist;
}
export async function deletePlaylist(id: string) {
  await transaction("playlists", "readwrite", (store) => store.delete(id));
}
export async function addPlayHistory(
  track: StoredTrack,
  selection: StoredHistory["selection"],
) {
  const entry: StoredHistory = {
    id: crypto.randomUUID(),
    trackId: track.id,
    title: track.title,
    artist: track.artist,
    playedAt: new Date().toISOString(),
    selection,
    bpm: track.bpm,
    genre: track.genre,
  };
  await transaction("history", "readwrite", (store) => store.put(entry));
  return entry;
}
export async function listHistory(limit = 30) {
  const all = await transaction<StoredHistory[]>(
    "history",
    "readonly",
    (store) => store.getAll(),
  );
  return all
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
    .slice(0, limit);
}
export async function listJingles() {
  return transaction<StoredJingle[]>("jingles", "readonly", (store) =>
    store.getAll(),
  );
}
export async function saveJingle(jingle: StoredJingle) {
  await transaction("jingles", "readwrite", (store) => store.put(jingle));
  return jingle;
}
export async function deleteJingle(id: string) {
  await transaction("jingles", "readwrite", (store) => store.delete(id));
}
export async function loadActiveSession() {
  return transaction<StoredSession | undefined>(
    "sessions",
    "readonly",
    (store) => store.get("active"),
  );
}
export async function saveActiveSession(queue: StoredTrack[]) {
  const session: StoredSession = {
    id: "active",
    queue,
    savedAt: new Date().toISOString(),
  };
  await transaction("sessions", "readwrite", (store) => store.put(session));
  return session;
}
export async function listPerformanceSamples() {
  return transaction<StoredPerformanceSample[]>(
    "performancePads",
    "readonly",
    (store) => store.getAll(),
  );
}
export async function savePerformanceSample(sample: StoredPerformanceSample) {
  await transaction("performancePads", "readwrite", (store) =>
    store.put(sample),
  );
  return sample;
}
export async function deletePerformanceSample(id: string) {
  await transaction("performancePads", "readwrite", (store) =>
    store.delete(id),
  );
}
export async function listLocalMusic() {
  return transaction<StoredLocalMusic[]>("localMusic", "readonly", (store) =>
    store.getAll(),
  );
}
export async function saveLocalMusic(track: StoredLocalMusic) {
  await transaction("localMusic", "readwrite", (store) => store.put(track));
  return track;
}
export async function deleteLocalMusic(id: string) {
  await transaction("localMusic", "readwrite", (store) => store.delete(id));
}
export async function listDeckHistory(limit = 100) {
  const all = await transaction<StoredDeckPlay[]>(
    "deckHistory",
    "readonly",
    (store) => store.getAll(),
  );
  return all
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
    .slice(0, limit);
}
export async function saveDeckHistory(entry: StoredDeckPlay) {
  await transaction("deckHistory", "readwrite", (store) => store.put(entry));
  return entry;
}
export async function deleteDeckHistory(id: string) {
  await transaction("deckHistory", "readwrite", (store) => store.delete(id));
}
