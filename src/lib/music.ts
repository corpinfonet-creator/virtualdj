export type Track = {
  id: string; title: string; artist: string; genre: string; bpm: number; key: string;
  energy: number; duration: number; color: string; locked?: boolean; source?: "local";
};

export const demoTracks: Track[] = [
  { id: "1", title: "Cumbia del Sol", artist: "Orquesta Central", genre: "Cumbia", bpm: 96, key: "8A", energy: .67, duration: 218, color: "#f97316", source: "local" },
  { id: "2", title: "Selva Nocturna", artist: "Ritmo Amazónico", genre: "Cumbia", bpm: 98, key: "8A", energy: .74, duration: 231, color: "#22c55e", source: "local" },
  { id: "3", title: "Corazón Salsero", artist: "Son del Puerto", genre: "Salsa", bpm: 101, key: "9A", energy: .79, duration: 244, color: "#ef4444", source: "local" },
  { id: "4", title: "Luz de Medianoche", artist: "Distrito Urbano", genre: "Urbano", bpm: 94, key: "7A", energy: .82, duration: 202, color: "#8b5cf6", source: "local" },
  { id: "5", title: "Brisa Latina", artist: "Costa Viva", genre: "Latin Pop", bpm: 100, key: "8B", energy: .62, duration: 226, color: "#06b6d4", source: "local" }
];

const camelotDistance = (a: string, b: string) => {
  const na = Number.parseInt(a), nb = Number.parseInt(b);
  const ring = Math.min(Math.abs(na - nb), 12 - Math.abs(na - nb));
  return ring + (a.at(-1) === b.at(-1) ? 0 : 1);
};

export function scoreTrack(current: Track, candidate: Track, recentIds: string[]) {
  const bpm = Math.max(0, 1 - Math.abs(current.bpm - candidate.bpm) / 12);
  const harmonic = Math.max(0, 1 - camelotDistance(current.key, candidate.key) / 3);
  const genre = current.genre === candidate.genre ? 1 : .45;
  const energy = Math.max(0, 1 - Math.abs(current.energy - candidate.energy));
  const repetition = recentIds.includes(candidate.id) ? .75 : 0;
  return Math.max(0, .30 * bpm + .23 * harmonic + .17 * genre + .15 * energy + .08 * .7 + .07 * .5 - repetition);
}

export const fmt = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
