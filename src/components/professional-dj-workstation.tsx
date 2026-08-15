"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Disc3,
  GripVertical,
  History,
  Library,
  ListMusic,
  Megaphone,
  Mic,
  Pause,
  Play,
  Search,
  Settings,
  SkipBack,
  SkipForward,
  Star,
  Trash2,
  Upload,
  Video,
  Wifi,
  Zap,
} from "lucide-react";
import {
  BrowserAudioEngine,
  type DeckId,
  type DeckSnapshot,
  type DeckWaveform,
  type HotCueSlot,
} from "@/lib/audio-engine";
import { fmt } from "@/lib/music";
import { analyzeAudioFile, type AudioAnalysis } from "@/lib/audio-analysis";
import {
  deleteJingle,
  deleteLocalMusic,
  deletePerformanceSample,
  listDeckHistory,
  listJingles,
  listLocalMusic,
  listPerformanceSamples,
  saveDeckHistory,
  saveJingle,
  saveLocalMusic,
  savePerformanceSample,
  type StoredJingle,
  type StoredPerformanceSample,
} from "@/lib/playlist-store";
import type {
  TransitionDebug,
  TransitionTrackAnalysis,
} from "@/services/audio/TransitionEngine";

type Track = {
  id: string;
  title: string;
  artist: string;
  genre?: string;
  subgenre?: string;
  durationMs: number;
  analysis?: {
    bpm?: number;
    bpmConfidence?: number;
    musicalKey?: string;
    keyConfidence?: number;
    energy?: number;
    loudnessLufs?: number;
    truePeakDb?: number;
    analyzerVersion?: string;
    cuePoints?: unknown;
    beatgrid?: TransitionTrackAnalysis["beatGrid"];
    waveform?: unknown;
  };
  assets?: Array<{ storageKey: string }>;
  localFile?: File;
};
type DeckPlayHistory = {
  id: string;
  deck: DeckId;
  track: Track;
  playedAt: Date;
};
type PersistedPlaybackSession = {
  savedAt: number;
  active: DeckId;
  crossfade: number;
  manualPitch: Record<DeckId, number>;
  decks: Partial<
    Record<
      DeckId,
      {
        track: Omit<Track, "localFile">;
        local: boolean;
        currentTime: number;
        playing: boolean;
      }
    >
  >;
};
const playbackSessionKey = "autodj-playback-session-v1";
type PerformancePadKind = "base" | "bass" | "voice" | "jingle";
const performancePads: Array<{
  kind: PerformancePadKind;
  label: string;
  short: string;
}> = [
  { kind: "base", label: "BASE", short: "RITMO" },
  { kind: "bass", label: "BASS", short: "SUB" },
  { kind: "voice", label: "CUÑA", short: "VOICE" },
  { kind: "jingle", label: "JINGLE", short: "ID" },
];
const hotCueColors = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#22d3ee",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
];
const empty: DeckSnapshot = {
  ready: false,
  playing: false,
  currentTime: 0,
  duration: 0,
  buffered: 0,
  playbackRate: 1,
  peak: 0,
};
const nav = [
  "Mi música",
  "Música local",
  "Favoritos",
  "Historial",
  "Playlists",
  "AutoDJ",
  "Recientes",
  "Más reproducidas",
  "Géneros",
  "Videos",
  "Karaoke",
  "Cuñas",
  "Samplers",
];
const libraryNav = ["Drive 01", "Drive 02", "Drive 03", ...nav.slice(1)];
type DriveSlotId = "01" | "02" | "03";
type DriveSlotState = {
  slot: DriveSlotId;
  status: "empty" | "connected" | "syncing" | "error";
  folderId?: string;
  folderName?: string;
  trackCount: number;
  syncProcessed?: number;
  syncTotal?: number;
  syncPercent?: number;
  lastSyncAt?: string;
  updatedAt?: string;
  error?: string;
};

function Waveform({
  color,
  flip = false,
}: {
  color: "blue" | "red";
  flip?: boolean;
}) {
  return (
    <div
      className={`relative h-14 overflow-hidden ${flip ? "scale-y-[-1]" : ""}`}
    >
      <div
        className={`absolute inset-0 opacity-90 ${color === "blue" ? "wave-blue" : "wave-red"}`}
      />
      <div className="absolute inset-y-0 left-1/2 w-px bg-white shadow-[0_0_8px_white]" />
      <div className="absolute inset-x-0 bottom-0 flex justify-around text-[7px] text-slate-600">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((x) => (
          <span key={x}>{x}.1</span>
        ))}
      </div>
    </div>
  );
}
type WaveMode = "bars" | "mirror" | "spectrum";
function LiveWaveform({
  id,
  data,
  onSeek,
  mode = "bars",
}: {
  id: DeckId;
  data: DeckWaveform;
  onSeek: (seconds: number) => void;
  mode?: WaveMode;
}) {
  const blue = id === "A";
  const progress = data.duration ? data.currentTime / data.duration : 0;
  return (
    <button
      aria-label={`Waveform Deck ${id}`}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        onSeek(
          ((event.clientX - rect.left) / rect.width) * (data.duration || 0),
        );
      }}
      className={`neon-spectrum relative h-14 w-full overflow-hidden text-left waveform-${mode} ${blue ? "neon-spectrum-a" : "neon-spectrum-b"}`}
    >
      <div
        className={`absolute inset-0 flex gap-px ${mode === "spectrum" ? "items-end" : "items-center"}`}
      >
        {data.samples.map((sample, index) => (
          <i
            key={index}
            className={`neon-spectrum-bar min-w-[2px] flex-1 ${mode === "spectrum" ? "rounded-t" : "rounded-sm"}`}
            style={{
              height: `${Math.max(mode === "mirror" ? 8 : 5, sample * (mode === "mirror" ? 72 : 100))}%`,
              opacity: index / data.samples.length <= progress ? 1 : 0.3,
              boxShadow:
                mode === "mirror"
                  ? `0 ${Math.max(2, sample * 22)}px 0 ${blue ? "rgba(34,211,238,.42)" : "rgba(239,68,68,.42)"}`
                  : undefined,
              animationDelay: `${-(index % 16) * 0.11}s`,
            }}
          />
        ))}
      </div>
      <div
        className="absolute inset-y-0 bg-white/5"
        style={{ width: `${data.buffered * 100}%` }}
      />
      <div
        className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_8px_white]"
        style={{ left: `${progress * 100}%` }}
      />
      <div className="absolute inset-y-0 left-1/2 w-px bg-amber-300/70" />
      <span
        className={`absolute left-1 top-1 rounded px-1 text-[7px] font-black ${blue ? "bg-cyan text-black" : "bg-red-500 text-white"}`}
      >
        DISCO {id}
      </span>
      <div className="absolute inset-x-0 bottom-0 flex justify-around text-[7px] text-slate-500">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((x) => (
          <span key={x}>{x}.1</span>
        ))}
      </div>
      {!data.duration && (
        <span className="absolute inset-0 grid place-items-center text-[8px] text-slate-600">
          Carga una pista para activar la onda
        </span>
      )}
    </button>
  );
}
function Knob({
  label,
  value = 62,
  color = "cyan",
}: {
  label: string;
  value?: number;
  color?: "cyan" | "red";
}) {
  return (
    <label className="grid place-items-center gap-1 text-[8px] font-bold text-slate-500">
      <span
        className={`relative h-8 w-8 rounded-full border-2 border-slate-600 bg-gradient-to-br from-slate-700 to-black shadow-inner before:absolute before:left-1/2 before:top-1 before:h-2.5 before:w-0.5 before:-translate-x-1/2 before:rounded ${color === "cyan" ? "before:bg-cyan" : "before:bg-red-400"}`}
        style={{ transform: `rotate(${(value - 50) * 2.3}deg)` }}
      />
      <span>{label}</span>
    </label>
  );
}

function JogWheel({
  id,
  playing,
  ready,
  trackName,
  bpm,
  progress,
  onScratch,
}: {
  id: DeckId;
  playing: boolean;
  ready: boolean;
  trackName?: string;
  bpm?: number;
  progress: number;
  onScratch: (deltaTurns: number) => void;
}) {
  const blue = id === "A";
  const drag = useRef<{ angle: number; pointerId: number } | null>(null);
  const [scratching, setScratching] = useState(false);
  const angleAt = (element: HTMLElement, x: number, y: number) => {
    const rect = element.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
  };
  return (
    <div
      role="slider"
      aria-label={`Plato Disco ${id}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      tabIndex={0}
      className={`jog ${blue ? "jog-a" : "jog-b"} ${playing ? "jog-playing" : ""} ${scratching ? "jog-scratching" : ""}`}
      onPointerDown={(event) => {
        event.preventDefault();
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Ignora punteros sintéticos o ya liberados; el arrastre sigue funcionando.
        }
        drag.current = {
          angle: angleAt(event.currentTarget, event.clientX, event.clientY),
          pointerId: event.pointerId,
        };
        setScratching(true);
      }}
      onPointerMove={(event) => {
        if (!drag.current || drag.current.pointerId !== event.pointerId) return;
        const nextAngle = angleAt(
          event.currentTarget,
          event.clientX,
          event.clientY,
        );
        let delta = nextAngle - drag.current.angle;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        drag.current.angle = nextAngle;
        onScratch(delta / 360);
      }}
      onPointerUp={(event) => {
        drag.current = null;
        setScratching(false);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setScratching(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") onScratch(1 / 90);
        if (event.key === "ArrowLeft") onScratch(-1 / 90);
      }}
    >
      <span className="jog-bolt" />
      <span className="jog-bolt" />
      <span className="jog-bolt" />
      <span className="jog-bolt" />
      <svg className="jog-progress" viewBox="0 0 100 100" aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r="48"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeOpacity="0.18"
        />
        {ready && (
          <circle
            cx="50"
            cy="50"
            r="48"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray={`${progress * 301.6} 301.6`}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
          />
        )}
      </svg>
      <div className="jog-platter">
        <span className="jog-grooves" />
        <span className="jog-sheen" />
      </div>
      <span className="jog-marker" />
      <div className="jog-label">
        {ready ? (
          <>
            <b>{bpm ? bpm.toFixed(0) : id}</b>
            <small>{trackName ?? "—"}</small>
          </>
        ) : (
          <b>{id}</b>
        )}
      </div>
      <span className="jog-spindle" />
    </div>
  );
}

function Deck({
  id,
  state,
  wave,
  waveMode,
  dragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onToggle,
  onSeek,
  onTempo,
  onCue,
  onSync,
  onBeatBack,
  onBeatForward,
  onLoopIn,
  onLoopOut,
  onKeyLock,
  loopReady,
  loopActive,
  loopBeats,
  onLoopBeats,
  keyLock,
  pitchValue,
  bpm,
  musicalKey,
  padCounts,
  activePads,
  onPadOpen,
  onScratch,
  trackName,
  hotCues,
  onHotCue,
  onHotCueClear,
  onHotCueRelease,
  slipOn,
  onSlipToggle,
}: {
  id: DeckId;
  state: DeckSnapshot;
  wave: DeckWaveform;
  waveMode: WaveMode;
  dragOver: boolean;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent<HTMLElement>) => void;
  onToggle: () => void;
  onSeek: (n: number) => void;
  onTempo: (n: number) => void;
  onCue: () => void;
  onSync: () => void;
  onBeatBack: () => void;
  onBeatForward: () => void;
  onLoopIn: () => void;
  onLoopOut: () => void;
  onKeyLock: () => void;
  loopReady: boolean;
  loopActive: boolean;
  loopBeats: 2 | 4 | 6 | 8;
  onLoopBeats: (beats: 2 | 4 | 6 | 8) => void;
  keyLock: boolean;
  pitchValue: number;
  bpm?: number;
  musicalKey?: string;
  padCounts: Record<PerformancePadKind, number>;
  activePads: Set<PerformancePadKind>;
  onPadOpen: (kind: PerformancePadKind) => void;
  onScratch: (deltaTurns: number) => void;
  trackName?: string;
  hotCues: Partial<Record<HotCueSlot, number>>;
  onHotCue: (slot: HotCueSlot) => void;
  onHotCueClear: (slot: HotCueSlot) => void;
  onHotCueRelease: () => void;
  slipOn: boolean;
  onSlipToggle: () => void;
}) {
  const blue = id === "A",
    accent = blue ? "text-cyan" : "text-red-400",
    border = blue ? "border-cyan/40" : "border-red-500/40";
  return (
    <section
      onDragOver={(event) => event.preventDefault()}
      onDragEnter={(event) => {
        event.preventDefault();
        onDragEnter();
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          onDragLeave();
      }}
      onDrop={onDrop}
      className={`dj-metal relative min-w-0 rounded-xl border ${dragOver ? (blue ? "border-cyan bg-cyan/15 shadow-[inset_0_0_50px_rgba(34,211,238,.16)]" : "border-red-400 bg-red-500/15 shadow-[inset_0_0_50px_rgba(239,68,68,.16)]") : border} p-3 transition`}
    >
      {dragOver && (
        <div
          className={`pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-lg border-2 border-dashed bg-black/80 ${blue ? "border-cyan text-cyan" : "border-red-400 text-red-400"}`}
        >
          <div className="text-center">
            <Disc3 size={30} className="mx-auto mb-2 animate-spin" />
            <b className="text-xs tracking-widest">SOLTAR EN DISCO {id}</b>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <b className={`tracking-[.25em] ${accent}`}>DISCO {id}</b>
        <span
          className={`led ${state.playing ? (blue ? "bg-cyan" : "bg-red-500") : "bg-slate-700"}`}
        />
        <span className="text-[9px] text-slate-500">
          {state.playing ? "ON AIR" : state.ready ? "READY" : "EMPTY"}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">
            {state.name ?? "Selecciona una pista"}
          </p>
          <p className={`truncate font-mono text-[11px] font-black ${accent}`}>
            KEY {musicalKey ?? "—"} · BPM {bpm?.toFixed(2) ?? "—"}
          </p>
        </div>
        <div className="shrink-0 text-right font-mono">
          <b className={`text-lg ${accent}`}>{fmt(state.currentTime)}</b>
          <small className="block text-[9px] text-slate-500">
            -{fmt(Math.max(0, state.duration - state.currentTime))}
          </small>
        </div>
      </div>
      <div className="my-2 overflow-hidden rounded border border-slate-800 bg-black">
        <LiveWaveform id={id} data={wave} mode={waveMode} onSeek={onSeek} />
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={onCue}
            disabled={!state.ready}
            className="dj-button w-14 py-2 text-[9px] font-black text-slate-300 disabled:opacity-30"
          >
            CUE
          </button>
          <button
            onClick={onSync}
            disabled={!state.ready}
            className="dj-button w-14 py-2 text-[9px] font-black text-slate-300 disabled:opacity-30"
          >
            SYNC
          </button>
          <button
            onClick={onToggle}
            className={`dj-button col-span-2 py-2 text-[9px] font-black ${blue ? "text-cyan" : "text-red-400"}`}
          >
            {state.playing ? (
              <Pause size={14} className="mx-auto" />
            ) : (
              <Play size={14} className="mx-auto" />
            )}
          </button>
          <button
            onClick={onBeatBack}
            disabled={!state.ready}
            title="Salto de 4 beats atrás"
            className="dj-button w-14 py-1.5 disabled:opacity-30"
          >
            <SkipBack size={12} className="mx-auto" />
          </button>
          <button
            onClick={onBeatForward}
            disabled={!state.ready}
            title="Salto de 4 beats adelante"
            className="dj-button w-14 py-1.5 disabled:opacity-30"
          >
            <SkipForward size={12} className="mx-auto" />
          </button>
        </div>
        <div className="jog-bay">
          <JogWheel
            id={id}
            playing={state.playing}
            ready={state.ready}
            trackName={trackName}
            bpm={bpm}
            progress={state.duration ? state.currentTime / state.duration : 0}
            onScratch={onScratch}
          />
        </div>
        <div className={`pro-pitch ${blue ? "pro-pitch-a" : "pro-pitch-b"}`}>
          <div className="pro-pitch-display">
            <span>PITCH</span>
            <b>
              {pitchValue >= 100 ? "+" : ""}
              {(pitchValue - 100).toFixed(1)}%
            </b>
          </div>
          <div className="pro-pitch-control">
            <div className="pro-pitch-scale" aria-hidden="true">
              <span>+8</span>
              <i />
              <i />
              <strong>0</strong>
              <i />
              <i />
              <span>−8</span>
            </div>
            <input
              aria-label={`Pitch ${id}`}
              type="range"
              min="92"
              max="108"
              step="0.1"
              value={pitchValue}
              onChange={(event) => onTempo(Number(event.target.value) / 100)}
              onDoubleClick={() => onTempo(1)}
              aria-valuetext={`${pitchValue >= 100 ? "+" : ""}${(pitchValue - 100).toFixed(1)} por ciento`}
              title={`Pitch Disco ${id}: ${(pitchValue - 100).toFixed(1)}%`}
              className="pro-pitch-fader"
            />
          </div>
          <button
            type="button"
            onClick={() => onTempo(1)}
            className={`pro-pitch-reset ${Math.abs(pitchValue - 100) < 0.05 ? "is-zero" : ""}`}
          >
            <span /> ZERO
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <b className="text-[8px] font-black tracking-[.14em] text-slate-400">
          HOT CUES
        </b>
        <button
          type="button"
          onClick={onSlipToggle}
          title="Slip: los loops y hot cues no interrumpen el groove real; al soltar retoma donde iría la pista"
          className={`rounded border px-2 py-0.5 text-[8px] font-black tracking-wide ${slipOn ? `border-lime bg-lime/20 text-lime` : "border-slate-700 text-slate-500"}`}
        >
          SLIP {slipOn ? "ON" : "OFF"}
        </button>
      </div>
      <div className="hot-cue-bank mt-1 grid grid-cols-4 gap-1.5">
        {hotCueColors.map((color, index) => {
          const slot = (index + 1) as HotCueSlot;
          const active = hotCues[slot] !== undefined;
          return (
            <button
              key={slot}
              type="button"
              disabled={!state.ready}
              onPointerDown={() => onHotCue(slot)}
              onPointerUp={onHotCueRelease}
              onPointerLeave={onHotCueRelease}
              onContextMenu={(event) => {
                event.preventDefault();
                if (active) onHotCueClear(slot);
              }}
              title={
                active
                  ? `Hot Cue ${slot}: saltar (mantén presionado con SLIP activo) · clic derecho para borrar`
                  : `Guardar Hot Cue ${slot} en la posición actual`
              }
              className={`hot-cue-pad ${active ? "is-set" : ""} disabled:opacity-30`}
              style={{ "--cue-color": color } as React.CSSProperties}
            >
              <b>{slot}</b>
            </button>
          );
        })}
      </div>
      <div className="performance-pad-bank mt-2 grid grid-cols-4 gap-1.5">
        {performancePads.map((pad) => {
          const count = padCounts[pad.kind];
          const playing = activePads.has(pad.kind);
          return (
            <div key={pad.kind} className="min-w-0">
              <button
                type="button"
                onClick={() => onPadOpen(pad.kind)}
                title={`Abrir biblioteca ${pad.label}`}
                className={`performance-pad performance-pad-${pad.kind} ${count ? "is-loaded" : ""} ${playing ? "is-playing" : ""}`}
              >
                <span className="performance-pad-led" />
                <b>{pad.label}</b>
                <small>
                  {count ? `${count} AUDIO${count === 1 ? "" : "S"}` : "+ LOAD"}
                </small>
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[8px]">
        <button
          onClick={onLoopIn}
          disabled={!state.ready}
          className={`dj-button px-2 py-1 disabled:opacity-30 ${loopReady && !loopActive ? accent : ""}`}
        >
          LOOP IN
        </button>
        <button
          onClick={onLoopOut}
          disabled={!state.ready || !loopReady}
          className={`dj-button px-2 py-1 disabled:opacity-30 ${loopActive ? "text-lime" : ""}`}
        >
          {loopActive ? "LOOP OFF" : "LOOP OUT"}
        </button>
        <select
          aria-label={`Longitud de loop Disco ${id}`}
          value={loopBeats}
          onChange={(event) =>
            onLoopBeats(Number(event.target.value) as 2 | 4 | 6 | 8)
          }
          className={`rounded border bg-black p-1 font-mono ${blue ? "border-cyan/30 text-cyan" : "border-red-500/30 text-red-400"}`}
        >
          {[2, 4, 6, 8].map((beats) => (
            <option key={beats} value={beats}>
              {beats} BEATS
            </option>
          ))}
        </select>
        <button
          onClick={onKeyLock}
          className={`dj-button px-2 py-1 ${keyLock ? accent : "text-slate-600"}`}
        >
          KEY LOCK
        </button>
      </div>
    </section>
  );
}

function EqKnob({
  id,
  band,
  color,
  value,
  onChange,
}: {
  id: DeckId;
  band: "high" | "mid" | "low";
  color: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const drag = useRef<{ y: number; value: number } | null>(null);
  const angle = -135 + ((value + 24) / 36) * 270;
  const update = (next: number) =>
    onChange(Math.max(-24, Math.min(12, Math.round(next))));
  return (
    <div className="grid select-none place-items-center gap-0.5 text-[6px]">
      <button
        type="button"
        role="slider"
        aria-label={`${band} ${id}`}
        aria-valuemin={-24}
        aria-valuemax={12}
        aria-valuenow={value}
        title="Arrastra verticalmente, usa la rueda o doble clic para reiniciar"
        onDoubleClick={() => update(0)}
        onWheel={(event) => {
          event.preventDefault();
          update(value + (event.deltaY < 0 ? 1 : -1));
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowRight")
            update(value + 1);
          if (event.key === "ArrowDown" || event.key === "ArrowLeft")
            update(value - 1);
        }}
        onPointerDown={(event) => {
          drag.current = { y: event.clientY, value };
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Ignora punteros sintéticos o ya liberados; el arrastre sigue funcionando.
          }
        }}
        onPointerMove={(event) => {
          if (drag.current)
            update(drag.current.value + (drag.current.y - event.clientY) / 3);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        className="relative h-9 w-9 cursor-ns-resize touch-none rounded-full border border-slate-600 bg-[repeating-conic-gradient(from_-135deg,#64748b_0deg_1deg,transparent_1deg_13.5deg),radial-gradient(circle,#05070a_0_54%,#252d39_55%_66%,#080b10_67%)] shadow-[0_3px_7px_#000] outline-none focus:ring-1 focus:ring-white/60"
        style={{
          boxShadow: `inset 0 0 0 2px #111827, inset 0 0 8px #000, 0 0 6px ${color}33, 0 3px 7px #000`,
        }}
      >
        <span className="absolute inset-[5px] rounded-full border border-white/10 bg-[radial-gradient(circle_at_35%_28%,#697586_0,#252d38_28%,#0a0d12_72%)] shadow-[inset_0_1px_2px_#ffffff22]" />
        <i
          className="absolute left-1/2 top-1/2 z-10 h-[11px] w-px origin-[50%_100%] rounded-full"
          style={{
            backgroundColor: color,
            boxShadow: `0 0 5px ${color}`,
            transform: `translate(-50%, -100%) rotate(${angle}deg)`,
          }}
        />
        <i className="absolute left-1/2 top-1/2 z-20 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-slate-950 shadow-inner" />
      </button>
      <b className="tracking-[.12em] text-slate-300">{band.toUpperCase()}</b>
      <span className="font-mono text-[6px]" style={{ color }}>
        {value > 0 ? "+" : ""}
        {value} dB
      </span>
    </div>
  );
}

function FilterKnob({
  id,
  color,
  value,
  onChange,
}: {
  id: DeckId;
  color: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const drag = useRef<{ y: number; value: number } | null>(null);
  const angle = -135 + ((value + 100) / 200) * 270;
  const update = (next: number) =>
    onChange(Math.max(-100, Math.min(100, Math.round(next))));
  return (
    <div className="grid select-none place-items-center gap-0.5 text-[6px]">
      <button
        type="button"
        role="slider"
        aria-label={`Filter Disco ${id}`}
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-valuenow={value}
        title="Filter: izquierda cierra graves (lowpass), derecha abre agudos (highpass)"
        onDoubleClick={() => update(0)}
        onWheel={(event) => {
          event.preventDefault();
          update(value + (event.deltaY < 0 ? 3 : -3));
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowRight")
            update(value + 3);
          if (event.key === "ArrowDown" || event.key === "ArrowLeft")
            update(value - 3);
        }}
        onPointerDown={(event) => {
          drag.current = { y: event.clientY, value };
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Ignora punteros sintéticos o ya liberados; el arrastre sigue funcionando.
          }
        }}
        onPointerMove={(event) => {
          if (drag.current)
            update(drag.current.value + (drag.current.y - event.clientY));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        className="relative h-10 w-10 cursor-ns-resize touch-none rounded-full border border-slate-600 bg-[repeating-conic-gradient(from_-135deg,#64748b_0deg_1deg,transparent_1deg_13.5deg),radial-gradient(circle,#05070a_0_54%,#252d39_55%_66%,#080b10_67%)] shadow-[0_3px_7px_#000] outline-none focus:ring-1 focus:ring-white/60"
        style={{
          boxShadow: `inset 0 0 0 2px #111827, inset 0 0 8px #000, 0 0 6px ${color}33, 0 3px 7px #000`,
        }}
      >
        <span className="absolute inset-[5px] rounded-full border border-white/10 bg-[radial-gradient(circle_at_35%_28%,#697586_0,#252d38_28%,#0a0d12_72%)] shadow-[inset_0_1px_2px_#ffffff22]" />
        <i
          className="absolute left-1/2 top-1/2 z-10 h-[12px] w-px origin-[50%_100%] rounded-full"
          style={{
            backgroundColor: color,
            boxShadow: `0 0 5px ${color}`,
            transform: `translate(-50%, -100%) rotate(${angle}deg)`,
          }}
        />
        <i className="absolute left-1/2 top-1/2 z-20 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-slate-950 shadow-inner" />
      </button>
      <b className="tracking-[.12em] text-slate-300">FILTER</b>
      <span className="font-mono text-[6px]" style={{ color }}>
        {value === 0 ? "OFF" : value > 0 ? `HP ${value}` : `LP ${value}`}
      </span>
    </div>
  );
}

function ProVuMeter({ peak, deck }: { peak: number; deck: DeckId }) {
  const segments = 14;
  const [level, setLevel] = useState(0);
  const [peakHold, setPeakHold] = useState(0);
  useEffect(() => {
    const db = peak > 0 ? 20 * Math.log10(peak) : -60;
    const next = Math.max(0, Math.min(1, (db + 48) / 48));
    setLevel((current) =>
      next > current ? next : current * 0.78 + next * 0.22,
    );
    setPeakHold((current) =>
      next >= current ? next : Math.max(next, current - 0.018),
    );
  }, [peak]);
  const active = Math.round(level * segments);
  const held = Math.max(
    0,
    Math.min(segments - 1, Math.round(peakHold * segments) - 1),
  );
  return (
    <div className="pro-vu" aria-label={`Nivel de audio Deck ${deck}`}>
      <span className="pro-vu-label">{deck}</span>
      <div className="pro-vu-scale" aria-hidden="true">
        <span>0</span>
        <span>-6</span>
        <span>-12</span>
        <span>-24</span>
        <span>-∞</span>
      </div>
      <div className="pro-vu-leds">
        {Array.from({ length: segments }, (_, index) => {
          const hot = index >= 12;
          const warm = index >= 9 && !hot;
          const lit = index < active;
          return (
            <i
              key={index}
              className={`${lit ? "is-lit" : ""} ${index === held ? "is-peak" : ""} ${hot ? "is-red" : warm ? "is-amber" : "is-green"}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function Mixer({
  crossfade,
  setCrossfade,
  onMix,
  peaks,
  onVolume,
  onEq,
  onFilter,
  onKaraoke,
  karaokeOn,
  onDelayMix,
  onReverbMix,
  onDelayTime,
  liveFx,
}: {
  crossfade: number;
  setCrossfade: (n: number) => void;
  onMix: () => void;
  peaks: Record<DeckId, number>;
  onVolume: (id: DeckId, value: number) => void;
  onEq: (id: DeckId, band: "high" | "mid" | "low", db: number) => void;
  onFilter: (id: DeckId, position: number) => void;
  onKaraoke: (id: DeckId, enabled: boolean) => void;
  karaokeOn: Record<DeckId, boolean>;
  onDelayMix: (value: number) => void;
  onReverbMix: (value: number) => void;
  onDelayTime: (seconds: number) => void;
  liveFx: {
    active: boolean;
    filter: Record<DeckId, number>;
    delayMix: number;
    reverbMix: number;
  };
}) {
  const [volumes, setVolumes] = useState<Record<DeckId, number>>({
    A: 90,
    B: 90,
  });
  const [eq, setEq] = useState<
    Record<DeckId, Record<"high" | "mid" | "low", number>>
  >({
    A: { high: 0, mid: 0, low: 0 },
    B: { high: 0, mid: 0, low: 0 },
  });
  const [filter, setFilter] = useState<Record<DeckId, number>>({ A: 0, B: 0 });
  const [delayBeat, setDelayBeat] = useState<"1/4" | "1/2" | "1/1">("1/4");
  const [delayMix, setDelayMixValue] = useState(0);
  const [reverbMix, setReverbMixValue] = useState(0);
  const beatToSeconds: Record<"1/4" | "1/2" | "1/1", number> = {
    "1/4": 0.125,
    "1/2": 0.25,
    "1/1": 0.5,
  };
  useEffect(() => {
    if (!liveFx.active) return;
    setFilter(liveFx.filter);
    setDelayMixValue(liveFx.delayMix);
    setReverbMixValue(liveFx.reverbMix);
  }, [liveFx]);
  function changeVolume(id: DeckId, value: number) {
    setVolumes((current) => ({ ...current, [id]: value }));
    onVolume(id, value / 100);
  }
  function changeEq(id: DeckId, band: "high" | "mid" | "low", value: number) {
    setEq((current) => ({
      ...current,
      [id]: { ...current[id], [band]: value },
    }));
    onEq(id, band, value);
  }
  function changeFilter(id: DeckId, value: number) {
    setFilter((current) => ({ ...current, [id]: value }));
    onFilter(id, value);
  }
  function resetEq() {
    setEq({
      A: { high: 0, mid: 0, low: 0 },
      B: { high: 0, mid: 0, low: 0 },
    });
    setFilter({ A: 0, B: 0 });
    for (const id of ["A", "B"] as const) {
      for (const band of ["high", "mid", "low"] as const) onEq(id, band, 0);
      onFilter(id, 0);
    }
  }
  return (
    <section className="dj-metal rounded-xl border border-slate-700 p-3">
      <div className="flex items-center justify-between">
        <b className="text-[10px] tracking-[.18em]">MIXER</b>
        <button
          type="button"
          onClick={resetEq}
          className="rounded border border-slate-600 px-2 py-1 text-[7px] text-slate-300 hover:border-white"
        >
          RESET EQ
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="grid grid-cols-3 gap-1">
          {(["high", "mid", "low"] as const).map((band) => (
            <EqKnob
              key={band}
              id="A"
              band={band}
              color="#22d3ee"
              value={eq.A[band]}
              onChange={(value) => changeEq("A", band, value)}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1">
          {(["high", "mid", "low"] as const).map((band) => (
            <EqKnob
              key={band}
              id="B"
              band={band}
              color="#ef4444"
              value={eq.B[band]}
              onChange={(value) => changeEq("B", band, value)}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 items-start gap-3">
        <div className="grid grid-cols-[auto_1fr] items-center gap-2">
          <FilterKnob
            id="A"
            color="#22d3ee"
            value={filter.A}
            onChange={(value) => changeFilter("A", value)}
          />
          <button
            type="button"
            onClick={() => onKaraoke("A", !karaokeOn.A)}
            title="Karaoke: cancela el centro estéreo (voz) por diferencia de fase"
            className={`rounded border py-1.5 text-[7px] font-black tracking-wide ${karaokeOn.A ? "border-cyan bg-cyan/20 text-cyan" : "border-slate-700 text-slate-500"}`}
          >
            <Mic size={10} className="mx-auto mb-0.5" />
            KARAOKE
          </button>
        </div>
        <div className="grid grid-cols-[auto_1fr] items-center gap-2">
          <FilterKnob
            id="B"
            color="#ef4444"
            value={filter.B}
            onChange={(value) => changeFilter("B", value)}
          />
          <button
            type="button"
            onClick={() => onKaraoke("B", !karaokeOn.B)}
            title="Karaoke: cancela el centro estéreo (voz) por diferencia de fase"
            className={`rounded border py-1.5 text-[7px] font-black tracking-wide ${karaokeOn.B ? "border-red-400 bg-red-500/20 text-red-400" : "border-slate-700 text-slate-500"}`}
          >
            <Mic size={10} className="mx-auto mb-0.5" />
            KARAOKE
          </button>
        </div>
      </div>
      <div className="mt-2 rounded-lg border border-fuchsia-500/25 bg-fuchsia-500/[.04] p-2">
        <div className="flex items-center justify-between">
          <b className="text-[8px] tracking-[.14em] text-fuchsia-300">
            BEAT FX
          </b>
          <div className="flex gap-0.5">
            {(["1/4", "1/2", "1/1"] as const).map((beat) => (
              <button
                key={beat}
                type="button"
                onClick={() => {
                  setDelayBeat(beat);
                  onDelayTime(beatToSeconds[beat]);
                }}
                className={`rounded px-1.5 py-0.5 text-[7px] font-black ${delayBeat === beat ? "bg-fuchsia-500/30 text-fuchsia-200" : "text-slate-500"}`}
              >
                {beat}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-2 text-[7px] text-slate-400">
          <label>
            ECHO {Math.round(delayMix * 100)}%
            <input
              aria-label="Mezcla de echo"
              type="range"
              min={0}
              max={100}
              value={delayMix * 100}
              onChange={(event) => {
                const value = Number(event.target.value) / 100;
                setDelayMixValue(value);
                onDelayMix(value);
              }}
              className="mt-1 w-full accent-fuchsia-400"
            />
          </label>
          <label>
            REVERB {Math.round(reverbMix * 100)}%
            <input
              aria-label="Mezcla de reverb"
              type="range"
              min={0}
              max={100}
              value={reverbMix * 100}
              onChange={(event) => {
                const value = Number(event.target.value) / 100;
                setReverbMixValue(value);
                onReverbMix(value);
              }}
              className="mt-1 w-full accent-fuchsia-400"
            />
          </label>
        </div>
      </div>
      <div className="my-2 grid grid-cols-[1fr_32px_32px_1fr] items-center gap-1.5">
        <input
          aria-label="Volumen A"
          type="range"
          min="0"
          max="100"
          value={volumes.A}
          onChange={(e) => changeVolume("A", Number(e.target.value))}
          className="vertical-fader accent-cyan"
        />
        <ProVuMeter peak={peaks.A} deck="A" />
        <ProVuMeter peak={peaks.B} deck="B" />
        <input
          aria-label="Volumen B"
          type="range"
          min="0"
          max="100"
          value={volumes.B}
          onChange={(e) => changeVolume("B", Number(e.target.value))}
          className="vertical-fader accent-red-500"
        />
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2 text-[8px] font-bold">
        <button
          type="button"
          onClick={() => changeVolume("A", volumes.A === 0 ? 90 : 0)}
          className={`rounded border py-1 ${volumes.A === 0 ? "border-cyan bg-cyan/20 text-cyan" : "border-slate-700 text-slate-400"}`}
        >
          {volumes.A === 0 ? "UNMUTE A" : `MUTE A · ${volumes.A}%`}
        </button>
        <button
          type="button"
          onClick={() => changeVolume("B", volumes.B === 0 ? 90 : 0)}
          className={`rounded border py-1 ${volumes.B === 0 ? "border-red-500 bg-red-500/20 text-red-400" : "border-slate-700 text-slate-400"}`}
        >
          {volumes.B === 0 ? "UNMUTE B" : `MUTE B · ${volumes.B}%`}
        </button>
      </div>
      <div className="pro-crossfader-panel">
        <div className="flex items-center justify-between text-[7px] font-black tracking-[.16em]">
          <span className="text-cyan">DISCO A</span>
          <span className="text-slate-500">CROSSFADER</span>
          <span className="text-red-400">DISCO B</span>
        </div>
        <div className="pro-crossfader-scale" aria-hidden="true">
          {Array.from({ length: 11 }, (_, index) => (
            <i key={index} className={index === 5 ? "is-center" : ""} />
          ))}
        </div>
        <input
          aria-label="Crossfader Disco A y Disco B"
          type="range"
          min="0"
          max="100"
          value={crossfade}
          onChange={(e) => setCrossfade(Number(e.target.value))}
          className="pro-crossfader"
          style={{ "--cross-position": `${crossfade}%` } as React.CSSProperties}
        />
        <div className="flex justify-between font-mono text-[6px] text-slate-600">
          <span>100 / 0</span>
          <span className="text-slate-400">MIX {crossfade}%</span>
          <span>0 / 100</span>
        </div>
      </div>
      <button
        onClick={onMix}
        title="Iniciar mezcla DJ inteligente"
        className="mt-3 w-full rounded-lg border border-lime/40 bg-lime/10 py-2.5 text-[9px] font-black tracking-widest text-lime transition hover:border-lime hover:bg-lime/20 hover:shadow-[0_0_14px_rgba(132,204,22,.18)]"
      >
        <Zap size={12} className="mr-1 inline" />
        AUTO MIX INTELIGENTE
      </button>
    </section>
  );
}

export function ProfessionalDjWorkstation() {
  const engine = useRef<BrowserAudioEngine | null>(null);
  const playbackRestored = useRef(false);
  const lastPlaybackPersist = useRef(0);
  const [engineReady, setEngineReady] = useState(false);
  const [libraryReady, setLibraryReady] = useState(false);
  const [decks, setDecks] = useState<Record<DeckId, DeckSnapshot>>({
    A: empty,
    B: empty,
  });
  const [waves, setWaves] = useState<Record<DeckId, DeckWaveform>>({
    A: {
      samples: Array(64).fill(0),
      currentTime: 0,
      duration: 0,
      buffered: 0,
      playing: false,
    },
    B: {
      samples: Array(64).fill(0),
      currentTime: 0,
      duration: 0,
      buffered: 0,
      playing: false,
    },
  });
  const [crossfade, setCrossfade] = useState(0);
  const [active, setActive] = useState<DeckId>("A");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [meta, setMeta] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
    genres: [] as string[],
    folders: [] as string[],
  });
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("");
  const [libraryView, setLibraryView] = useState("Drive 01");
  const [driveFolderPath, setDriveFolderPath] = useState("");
  const [catalogRevision, setCatalogRevision] = useState(0);
  const localInput = useRef<HTMLInputElement | null>(null);
  const driveResumeHandled = useRef(false);
  const driveMigrationHandled = useRef(false);
  const syncProgressWatch = useRef<
    Map<DriveSlotId, { processed: number; changedAt: number }>
  >(new Map());
  const syncResumeInFlight = useRef<Set<DriveSlotId>>(new Set());
  const driveStatusCache = useRef<Partial<Record<DriveSlotId, string>>>({});
  const [driveConnected, setDriveConnected] = useState(false);
  const [completedSyncSlot, setCompletedSyncSlot] =
    useState<DriveSlotId | null>(null);
  const [driveSlots, setDriveSlots] = useState<DriveSlotState[]>(
    (["01", "02", "03"] as const).map((slot) => ({
      slot,
      status: "empty",
      trackCount: 0,
    })),
  );
  const [driveFolderInput, setDriveFolderInput] = useState("");
  const [driveFolderPreview, setDriveFolderPreview] = useState<{
    slot: DriveSlotId;
    folderId: string;
    folderName: string;
  } | null>(null);
  const hasConnectedDriveAccount =
    driveConnected || driveSlots.some((slot) => Boolean(slot.folderId));
  const localTracks = useRef<Track[]>([]);
  const catalogTracks = useRef<Track[]>([]);
  const driveFolderPathCache = useRef<Record<string, string[]>>({});
  const driveFacetCache = useRef<Record<string, string[]>>({});
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [historyTracks, setHistoryTracks] = useState<Track[]>([]);
  const [deckPlayHistory, setDeckPlayHistory] = useState<DeckPlayHistory[]>([]);
  const playCounts = useRef<Map<string, number>>(new Map());
  const [queue, setQueue] = useState<Track[]>([]);
  const [clock, setClock] = useState("");
  const [audioContextState, setAudioContextState] =
    useState<AudioContextState>("suspended");
  const [notice, setNotice] = useState("Sistema listo");
  const [analysisStatus, setAnalysisStatus] = useState<
    "idle" | "analyzing" | "ready" | "error"
  >("idle");
  const [transitionDebug, setTransitionDebug] =
    useState<TransitionDebug | null>(null);
  const [manualPitch, setManualPitch] = useState<Record<DeckId, number>>({
    A: 100,
    B: 100,
  });
  const [padSamples, setPadSamples] = useState<StoredPerformanceSample[]>([]);
  const [jingles, setJingles] = useState<StoredJingle[]>([]);
  const [jingleName, setJingleName] = useState("Identificación del local");
  const [jingleInterval, setJingleInterval] = useState(30);
  const [jingleDuck, setJingleDuck] = useState(0.35);
  const [jinglePlaying, setJinglePlaying] = useState(false);
  const jinglesRef = useRef<StoredJingle[]>([]);
  const jinglePlayingRef = useRef(false);
  const [padModal, setPadModal] = useState<{
    deck: DeckId;
    kind: PerformancePadKind;
  } | null>(null);
  const [activePads, setActivePads] = useState<
    Record<DeckId, Set<PerformancePadKind>>
  >({ A: new Set(), B: new Set() });
  const [dragDeck, setDragDeck] = useState<DeckId | null>(null);
  const [queueDragIndex, setQueueDragIndex] = useState<number | null>(null);
  const [waveMode, setWaveMode] = useState<WaveMode>("spectrum");
  const [cues, setCues] = useState<Record<DeckId, number>>({ A: 0, B: 0 });
  const [loopStarts, setLoopStarts] = useState<Partial<Record<DeckId, number>>>(
    {},
  );
  const [loops, setLoops] = useState<Record<DeckId, boolean>>({
    A: false,
    B: false,
  });
  const [loopBeats, setLoopBeats] = useState<Record<DeckId, 2 | 4 | 6 | 8>>({
    A: 4,
    B: 4,
  });
  const [keyLocks, setKeyLocks] = useState<Record<DeckId, boolean>>({
    A: true,
    B: true,
  });
  const [karaokeOn, setKaraokeOn] = useState<Record<DeckId, boolean>>({
    A: false,
    B: false,
  });
  const [hotCues, setHotCues] = useState<
    Record<DeckId, Partial<Record<HotCueSlot, number>>>
  >({ A: {}, B: {} });
  const [slipOn, setSlipOn] = useState<Record<DeckId, boolean>>({
    A: false,
    B: false,
  });
  const queueRef = useRef<Track[]>([]);
  const transitioning = useRef(false);
  const crossfaderAnimation = useRef(0);
  const stableDuration = useRef<Partial<Record<DeckId, number>>>({});
  const liveFxDeadline = useRef(0);
  const liveFxWasActive = useRef(false);
  const [liveFx, setLiveFx] = useState<{
    active: boolean;
    filter: Record<DeckId, number>;
    delayMix: number;
    reverbMix: number;
  }>({ active: false, filter: { A: 0, B: 0 }, delayMix: 0, reverbMix: 0 });
  const loadedTrackIds = useRef<Partial<Record<DeckId, string>>>({});
  const loadedTracks = useRef<Partial<Record<DeckId, Track>>>({});
  const loadedBpms = useRef<Partial<Record<DeckId, number>>>({});
  const loadedGenres = useRef<Partial<Record<DeckId, string>>>({});
  const loadingDecks = useRef<Set<DeckId>>(new Set());
  const pendingDeckLoads = useRef<Partial<Record<DeckId, Promise<void>>>>({});
  const recentIds = useRef<string[]>([]);
  const playedTrackIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  useEffect(() => {
    jinglesRef.current = jingles;
  }, [jingles]);
  useEffect(() => {
    jinglePlayingRef.current = jinglePlaying;
  }, [jinglePlaying]);
  useEffect(() => {
    try {
      setFavoriteIds(
        new Set(JSON.parse(localStorage.getItem("autodj-favorites") || "[]")),
      );
    } catch {
      setFavoriteIds(new Set());
    }
  }, []);
  async function refreshDriveSlots() {
    const response = await fetch("/api/providers/google-drive/slots", {
      cache: "no-store",
    });
    if (!response.ok) {
      const status = await fetch("/api/providers/google-drive/status", {
        cache: "no-store",
      }).catch(() => null);
      setDriveConnected(Boolean(status?.ok));
      return;
    }
    const body = await response.json();
    setDriveConnected(Boolean(body.data?.connected));
    const nextSlots = (body.data?.slots ?? []) as DriveSlotState[];
    setDriveSlots(nextSlots);
    for (const item of nextSlots) {
      const previousStatus = driveStatusCache.current[item.slot];
      driveStatusCache.current[item.slot] = item.status;
      if (previousStatus === "syncing" && item.status === "connected") {
        delete driveFolderPathCache.current[`drive${item.slot}`];
        delete driveFacetCache.current[`drive${item.slot}`];
        setCatalogRevision((revision) => revision + 1);
      }
      if (item.status !== "syncing") {
        syncProgressWatch.current.delete(item.slot);
        continue;
      }
      const processed = item.syncProcessed ?? 0;
      const watched = syncProgressWatch.current.get(item.slot);
      if (!watched || watched.processed !== processed) {
        syncProgressWatch.current.set(item.slot, {
          processed,
          changedAt: Date.now(),
        });
      } else if (
        item.folderId &&
        Date.now() - watched.changedAt > 60_000 &&
        !syncResumeInFlight.current.has(item.slot)
      ) {
        void configureDriveInBackground(item.slot, item.folderId, false);
      }
    }
    if (body.data?.connected && !driveMigrationHandled.current) {
      driveMigrationHandled.current = true;
      for (const slot of ["01", "02", "03"] as const) {
        const legacy = localStorage.getItem(`autodj-folder-${slot}`);
        const configured = body.data?.slots?.some(
          (item: DriveSlotState) => item.slot === slot && item.folderId,
        );
        if (legacy && !configured) {
          void configureDriveInBackground(slot, legacy);
          break;
        }
      }
    }
  }
  useEffect(() => {
    void refreshDriveSlots();
  }, []);
  useEffect(() => {
    if (completedSyncSlot) return;
    if (!driveSlots.some((item) => item.status === "syncing")) return;
    const poll = window.setInterval(() => void refreshDriveSlots(), 1000);
    return () => window.clearInterval(poll);
  }, [driveSlots, completedSyncSlot]);
  useEffect(() => {
    void Promise.all([
      listPerformanceSamples(),
      listLocalMusic(),
      listDeckHistory(),
      listJingles(),
    ])
      .then(([samples, music, history, savedJingles]) => {
        setPadSamples(samples);
        setJingles(savedJingles);
        localTracks.current = music.map((item) => ({
          id: item.id,
          title: item.title,
          artist: item.artist,
          genre: item.genre,
          durationMs: item.durationMs,
          localFile: item.file,
          analysis: item.analysis as Track["analysis"],
        }));
        setDeckPlayHistory(
          history.map((entry) => ({
            id: entry.id,
            deck: "A",
            playedAt: new Date(entry.playedAt),
            track: {
              id: entry.trackId,
              title: entry.title,
              artist: entry.artist,
              genre: entry.genre,
              durationMs: 0,
              analysis: {
                bpm: entry.bpm,
                musicalKey: entry.musicalKey,
              },
            },
          })),
        );
        playedTrackIds.current = new Set(history.map((entry) => entry.trackId));
        setLibraryReady(true);
      })
      .catch(() => {
        setLibraryReady(true);
        setNotice("No se pudo recuperar la biblioteca local.");
      });
  }, []);
  const refresh = () => {
    if (!engine.current) return;
    setDecks({
      A: engine.current.snapshot("A"),
      B: engine.current.snapshot("B"),
    });
    setWaves({
      A: engine.current.waveform("A"),
      B: engine.current.waveform("B"),
    });
    setAudioContextState(engine.current.contextState);
    if (transitioning.current)
      liveFxDeadline.current = Math.max(liveFxDeadline.current, Date.now() + 1000);
    const stillLive = Date.now() < liveFxDeadline.current;
    if (stillLive || liveFxWasActive.current) {
      setLiveFx({
        active: stillLive,
        filter: {
          A: engine.current.filterPosition("A"),
          B: engine.current.filterPosition("B"),
        },
        delayMix: engine.current.delayMixLevel(),
        reverbMix: engine.current.reverbMixLevel(),
      });
    }
    liveFxWasActive.current = stillLive;
  };
  useEffect(() => {
    engine.current = new BrowserAudioEngine(
      refresh,
      (_, message) => setNotice(message),
      (debug) => {
        setTransitionDebug(debug);
        if (debug.state === "BASS_SWAP") setNotice("⚡ BASS SWAP");
        if (debug.state === "COMPLETE")
          liveFxDeadline.current =
            Date.now() + Math.max(1500, debug.beatDuration * 3000);
      },
    );
    setEngineReady(true);
    const tick = setInterval(refresh, 250),
      time = setInterval(
        () =>
          setClock(
            new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
          ),
        1000,
      );
    return () => {
      clearInterval(tick);
      clearInterval(time);
      setEngineReady(false);
      engine.current?.dispose();
    };
  }, []);
  useEffect(() => {
    if (!engineReady || !libraryReady || playbackRestored.current) return;
    playbackRestored.current = true;
    let session: PersistedPlaybackSession | undefined;
    try {
      session = JSON.parse(
        localStorage.getItem(playbackSessionKey) || "null",
      ) as PersistedPlaybackSession | undefined;
    } catch {
      localStorage.removeItem(playbackSessionKey);
    }
    if (!session?.decks) return;
    let cancelled = false;
    void (async () => {
      const resumeDecks: DeckId[] = [];
      for (const id of ["A", "B"] as const) {
        const saved = session.decks[id];
        if (!saved) continue;
        const track = saved.local
          ? localTracks.current.find((item) => item.id === saved.track.id)
          : (saved.track as Track);
        if (!track || cancelled) continue;
        await load(track, id, false);
        const elapsed = saved.playing
          ? Math.min(10, Math.max(0, (Date.now() - session.savedAt) / 1000))
          : 0;
        engine.current?.seek(id, saved.currentTime + elapsed);
        if (saved.playing) resumeDecks.push(id);
      }
      if (cancelled) return;
      const restoredCrossfade = Math.max(
        0,
        Math.min(100, session.crossfade ?? 0),
      );
      cross(restoredCrossfade);
      setActive(session.active === "B" ? "B" : "A");
      if (session.manualPitch) {
        setManualPitch(session.manualPitch);
        for (const id of ["A", "B"] as const)
          engine.current?.setTempo(id, (session.manualPitch[id] ?? 100) / 100);
      }
      const resume = async () => {
        for (const id of resumeDecks) await engine.current?.play(id);
        refresh();
        setNotice("Sesión restaurada: la música continúa donde quedó.");
      };
      try {
        await resume();
      } catch {
        setNotice(
          "Sesión restaurada. Haz clic para reanudar el audio bloqueado por el navegador.",
        );
        const resumeOnGesture = () => void resume().catch(() => undefined);
        window.addEventListener("pointerdown", resumeOnGesture, { once: true });
        window.addEventListener("keydown", resumeOnGesture, { once: true });
      }
    })().catch(() =>
      setNotice("No se pudo restaurar la sesión de reproducción."),
    );
    return () => {
      cancelled = true;
    };
  }, [engineReady, libraryReady]);
  useEffect(() => {
    if (!playbackRestored.current) return;
    const persist = () => {
      const deckSession: PersistedPlaybackSession["decks"] = {};
      for (const id of ["A", "B"] as const) {
        const track = loadedTracks.current[id];
        if (!track) continue;
        const { localFile: _localFile, ...serializableTrack } = track;
        deckSession[id] = {
          track: serializableTrack,
          local: Boolean(track.localFile),
          currentTime: engine.current?.currentTime(id) ?? decks[id].currentTime,
          playing: decks[id].playing,
        };
      }
      localStorage.setItem(
        playbackSessionKey,
        JSON.stringify({
          savedAt: Date.now(),
          active,
          crossfade,
          manualPitch,
          decks: deckSession,
        } satisfies PersistedPlaybackSession),
      );
      lastPlaybackPersist.current = Date.now();
    };
    if (Date.now() - lastPlaybackPersist.current >= 750) persist();
    window.addEventListener("pagehide", persist);
    return () => {
      window.removeEventListener("pagehide", persist);
    };
  }, [active, crossfade, decks, manualPitch]);
  useEffect(() => {
    if (libraryView === nav[1]) {
      const words = query
        .toLocaleLowerCase("es")
        .split(/\s+/)
        .filter(Boolean);
      const selected = words.length
        ? localTracks.current.filter((track) => {
            const haystack = `${track.title} ${track.artist} ${track.genre ?? ""}`.toLocaleLowerCase(
              "es",
            );
            return words.every((word) => haystack.includes(word));
          })
        : localTracks.current;
      setTracks(selected);
      setMeta((current) => ({
        ...current,
        page: 1,
        total: selected.length,
        totalPages: 1,
      }));
      return;
    }
    if (libraryView === "AutoDJ" || libraryView === "Playlists") {
      setTracks(queueRef.current);
      setMeta((current) => ({
        ...current,
        page: 1,
        total: queueRef.current.length,
        totalPages: 1,
      }));
      return;
    }
    if (libraryView === "Favoritos") {
      const selected = catalogTracks.current.filter((track) =>
        favoriteIds.has(track.id),
      );
      setTracks(selected);
      setMeta((current) => ({
        ...current,
        total: selected.length,
        totalPages: 1,
      }));
      return;
    }
    if (libraryView === "Historial" || libraryView === "Recientes") {
      setTracks(historyTracks);
      setMeta((current) => ({
        ...current,
        total: historyTracks.length,
        totalPages: 1,
      }));
      return;
    }
    if (libraryView === nav[8]) {
      const selected = [...catalogTracks.current].sort(
        (a, b) =>
          (playCounts.current.get(b.id) ?? 0) -
          (playCounts.current.get(a.id) ?? 0),
      );
      setTracks(selected);
      setMeta((current) => ({
        ...current,
        total: selected.length,
        totalPages: 1,
      }));
      return;
    }
    const source =
      libraryView === "Drive 01"
        ? "drive01"
        : libraryView === "Drive 02"
          ? "drive02"
          : libraryView === "Drive 03"
            ? "drive03"
            : "";
    const folderParam =
      source && !query && driveFolderPath
        ? `&folder=${encodeURIComponent(driveFolderPath)}`
        : "";
    const cachedPaths = source
      ? driveFolderPathCache.current[source]
      : undefined;
    const cachedGenres = source ? driveFacetCache.current[source] : undefined;
    const childFolders = (paths: string[], parent: string) => {
      const prefix = parent ? `${parent}/` : "";
      return [
        ...new Set(
          paths
            .filter((path) => path.startsWith(prefix) && path !== parent)
            .map((path) => path.slice(prefix.length).split("/")[0])
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b, "es"));
    };
    const includeFolders = Boolean(source && !cachedPaths);
    const includeFacets = Boolean(source && !cachedGenres);
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        fetch(
          `/api/tracks?page=${meta.page}&pageSize=9&q=${encodeURIComponent(query)}&genre=${encodeURIComponent(genre)}&source=${source}${folderParam}&includeFolders=${includeFolders ? "1" : "0"}&includeFacets=${includeFacets ? "1" : "0"}`,
          { cache: "no-store", signal: controller.signal },
        )
          .then((r) => r.json())
          .then((body) => {
            if (
              source &&
              includeFolders &&
              Array.isArray(body.meta?.folderPaths)
            )
              driveFolderPathCache.current[source] = body.meta.folderPaths;
            if (source && body.meta?.genres?.length)
              driveFacetCache.current[source] = body.meta.genres;
            const paths = source
              ? (driveFolderPathCache.current[source] ?? [])
              : [];
            const foldersAtLevel =
              source && !query
                ? childFolders(paths, driveFolderPath)
                : (body.meta?.folders ?? []);
            catalogTracks.current = body.data ?? [];
            setTracks(catalogTracks.current);
            setMeta((m) => ({
              ...m,
              total: body.meta?.total ?? 0,
              totalPages: body.meta?.totalPages ?? 1,
              genres:
                body.meta?.genres?.length > 0
                  ? body.meta.genres
                  : source
                    ? (driveFacetCache.current[source] ?? m.genres)
                    : (body.meta?.genres ?? []),
              folders: foldersAtLevel,
            }));
          })
          .catch((error) => {
            if (error instanceof DOMException && error.name === "AbortError")
              return;
            setNotice("No se pudo abrir esta carpeta.");
          }),
      query ? 150 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    meta.page,
    query,
    genre,
    libraryView,
    favoriteIds,
    historyTracks,
    catalogRevision,
    driveFolderPath,
  ]);
  function transitionAnalysis(
    track?: Track,
  ): TransitionTrackAnalysis | undefined {
    if (!track?.analysis?.bpm) return undefined;
    return {
      bpm: track.analysis.bpm,
      bpmConfidence: track.analysis.bpmConfidence,
      key: track.analysis.musicalKey,
      energy: track.analysis.energy,
      beatGrid: track.analysis.beatgrid,
    };
  }
  async function assignPerformancePad(
    deck: DeckId,
    kind: PerformancePadKind,
    file: File,
  ) {
    const sample: StoredPerformanceSample = {
      id: crypto.randomUUID(),
      deck,
      kind,
      name: file.name.replace(/\.[^.]+$/, ""),
      file,
      createdAt: new Date().toISOString(),
    };
    await savePerformanceSample(sample);
    setPadSamples((current) => [...current, sample]);
    setNotice(`${kind.toUpperCase()} guardado en el Disco ${deck}.`);
  }
  async function triggerPerformancePad(
    deck: DeckId,
    kind: PerformancePadKind,
    sample: StoredPerformanceSample,
  ) {
    setActivePads((current) => ({
      ...current,
      [deck]: new Set(current[deck]).add(kind),
    }));
    try {
      await engine.current?.playPerformanceSample(sample.file, kind);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? `No se pudo disparar el pad: ${error.message}`
          : "No se pudo reproducir el pad.",
      );
    } finally {
      setActivePads((current) => {
        const next = new Set(current[deck]);
        next.delete(kind);
        return { ...current, [deck]: next };
      });
    }
  }
  async function removePerformancePad(sample: StoredPerformanceSample) {
    await deletePerformanceSample(sample.id);
    setPadSamples((current) => current.filter((item) => item.id !== sample.id));
  }
  async function addJingleFile(file: File) {
    const jingle: StoredJingle = {
      id: crypto.randomUUID(),
      name: jingleName || file.name.replace(/\.[^.]+$/, ""),
      file,
      intervalMinutes: jingleInterval,
      duckLevel: jingleDuck,
      enabled: true,
      nextAt: new Date(Date.now() + jingleInterval * 60000).toISOString(),
    };
    try {
      await saveJingle(jingle);
      setJingles(await listJingles());
      setNotice(
        `${jingle.name} programada cada ${jingle.intervalMinutes} minutos.`,
      );
    } catch {
      setNotice("No se pudo guardar la cuña localmente.");
    }
  }
  async function playJingleNow(jingle: StoredJingle) {
    if (jinglePlayingRef.current) return;
    setJinglePlaying(true);
    setNotice(`Cuña al aire: ${jingle.name}. Ducking musical activo.`);
    try {
      await engine.current?.playJingle(jingle.file, jingle.duckLevel);
      const updated: StoredJingle = {
        ...jingle,
        lastPlayedAt: new Date().toISOString(),
        nextAt: new Date(
          Date.now() + jingle.intervalMinutes * 60000,
        ).toISOString(),
      };
      await saveJingle(updated);
      setJingles(await listJingles());
      setNotice(
        `Cuña finalizada; próxima inserción ${new Date(updated.nextAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Falló la cuña.");
    } finally {
      setJinglePlaying(false);
    }
  }
  async function playDueJingle() {
    if (jinglePlayingRef.current) return;
    const due = jinglesRef.current
      .filter(
        (item) => item.enabled && new Date(item.nextAt).getTime() <= Date.now(),
      )
      .sort((a, b) => a.nextAt.localeCompare(b.nextAt))[0];
    if (due) await playJingleNow(due);
  }
  async function toggleJingleEnabled(jingle: StoredJingle) {
    const updated = { ...jingle, enabled: !jingle.enabled };
    await saveJingle(updated);
    setJingles(await listJingles());
  }
  async function removeJingle(jingle: StoredJingle) {
    await deleteJingle(jingle.id);
    setJingles((current) => current.filter((item) => item.id !== jingle.id));
  }
  async function performLoad(track: Track, id: DeckId, activate = true) {
    const streamUrl = `/api/tracks/${track.id}/stream`;
    delete stableDuration.current[id];
    if (track.localFile) await engine.current?.load(id, track.localFile);
    else
      await engine.current?.loadUrl(
        id,
        streamUrl,
        `${track.artist} — ${track.title}`,
      );
    if (activate) setActive(id);
    loadedTrackIds.current[id] = track.id;
    loadedTracks.current[id] = track;
    loadedBpms.current[id] = track.analysis?.bpm ?? 120;
    loadedGenres.current[id] = track.genre ?? "General";
    setHotCues((current) => ({ ...current, [id]: {} }));
    const other = loadedTracks.current[id === "A" ? "B" : "A"];
    const hasProfessionalAnalysis = (item?: Track) =>
      item?.analysis?.analyzerVersion === "browser-professional-v2" &&
      Boolean(item.analysis.beatgrid) &&
      Boolean(item.analysis.cuePoints);
    setAnalysisStatus(
      hasProfessionalAnalysis(track) && hasProfessionalAnalysis(other)
        ? "ready"
        : "idle",
    );
    if (track.analysis?.loudnessLufs !== undefined) {
      const autoGain = Math.max(
        0.72,
        Math.min(1.2, 10 ** ((-14 - track.analysis.loudnessLufs) / 20)),
      );
      engine.current?.setDeckGain(id, autoGain);
    }
    playCounts.current.set(
      track.id,
      (playCounts.current.get(track.id) ?? 0) + 1,
    );
    setHistoryTracks((current) =>
      [track, ...current.filter((item) => item.id !== track.id)].slice(0, 30),
    );
    setNotice(
      `${track.title} ${activate ? "cargada" : "precargada"} en Deck ${id}`,
    );
    refresh();
  }
  function load(track: Track, id: DeckId, activate = true) {
    const pending = performLoad(track, id, activate);
    pendingDeckLoads.current[id] = pending;
    loadingDecks.current.add(id);
    void pending.then(
      () => {
        if (pendingDeckLoads.current[id] === pending) {
          delete pendingDeckLoads.current[id];
          loadingDecks.current.delete(id);
        }
      },
      () => {
        if (pendingDeckLoads.current[id] === pending) {
          delete pendingDeckLoads.current[id];
          loadingDecks.current.delete(id);
        }
      },
    );
    return pending;
  }
  async function loadInFreeDeck(track: Track) {
    const freeDeck = (["A", "B"] as const).find(
      (id) => !loadedTrackIds.current[id] && !loadingDecks.current.has(id),
    );
    if (!freeDeck) {
      setQueue((current) =>
        current.some((item) => item.id === track.id)
          ? current
          : [...current, track],
      );
      setNotice(
        `${track.title} añadida a Cola AutoDJ porque ambos decks están ocupados.`,
      );
      return;
    }
    loadingDecks.current.add(freeDeck);
    try {
      await load(track, freeDeck);
    } finally {
      loadingDecks.current.delete(freeDeck);
    }
  }
  function driveSlotFromView(view: string): "01" | "02" | "03" | null {
    if (view === "Drive 01") return "01";
    if (view === "Drive 02") return "02";
    if (view === "Drive 03") return "03";
    return null;
  }
  function extractDriveFolderId(value: string) {
    const input = value.trim();
    const folderPath = input.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1];
    const queryId = input.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1];
    return folderPath ?? queryId ?? input;
  }
  async function disconnectDriveSlot(slot: DriveSlotId) {
    const item = driveSlots.find((candidate) => candidate.slot === slot);
    if (
      !window.confirm(
        `¿Desconectar “${item?.folderName ?? `Drive ${slot}`}” y eliminar sus pistas indexadas?`,
      )
    )
      return;
    const response = await fetch(`/api/providers/google-drive/slots/${slot}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setNotice(`No se pudo desconectar Drive ${slot}.`);
      return;
    }
    setTracks([]);
    setCatalogRevision((revision) => revision + 1);
    await refreshDriveSlots();
    setNotice(`Drive ${slot} desconectado.`);
  }
  async function previewDriveFolder(slot: DriveSlotId) {
    const folderId = extractDriveFolderId(driveFolderInput);
    if (!/^[a-zA-Z0-9_-]{10,}$/.test(folderId)) {
      setNotice(`Drive ${slot}: la URL o el ID de carpeta no es válido.`);
      return;
    }
    const response = await fetch(`/api/providers/google-drive/slots/${slot}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId }),
    });
    const body = await response.json();
    if (!response.ok) {
      setNotice(body.error ?? "No se pudo acceder a la carpeta.");
      return;
    }
    setDriveFolderPreview({
      slot,
      folderId,
      folderName: body.data.name,
    });
  }
  async function configureDriveInBackground(
    slot: DriveSlotId,
    folderInput = driveFolderInput,
    replace = true,
  ) {
    const folderId = extractDriveFolderId(folderInput);
    if (!/^[a-zA-Z0-9_-]{10,}$/.test(folderId)) {
      setNotice(`Drive ${slot}: la URL o el ID de carpeta no es válido.`);
      return;
    }
    if (syncResumeInFlight.current.has(slot)) return;
    syncResumeInFlight.current.add(slot);
    setCompletedSyncSlot(null);
    setDriveSlots((current) =>
      current.map((item) =>
        item.slot === slot ? { ...item, status: "syncing" } : item,
      ),
    );
    setLibraryView(`Drive ${slot}`);
    setMeta((current) => ({ ...current, page: 1 }));
    setNotice(
      `Drive ${slot}: sincronización iniciada en segundo plano. Puedes seguir usando AutoDJ.`,
    );
    const confirmation = await fetch(
      `/api/providers/google-drive/slots/${slot}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          folderId,
          folderName:
            driveFolderPreview?.slot === slot &&
            driveFolderPreview.folderId === folderId
              ? driveFolderPreview.folderName
              : driveSlots.find((item) => item.slot === slot)?.folderName,
          persist: true,
        }),
      },
    );
    if (!confirmation.ok) {
      const body = await confirmation.json().catch(() => ({}));
      syncResumeInFlight.current.delete(slot);
      setDriveSlots((current) =>
        current.map((item) =>
          item.slot === slot
            ? { ...item, status: "error", error: body.error }
            : item,
        ),
      );
      setNotice(
        `Drive ${slot}: ${body.message ?? body.error ?? "no se pudo confirmar la carpeta"}.`,
      );
      return;
    }
    await refreshDriveSlots();
    await fetch(
      `/api/providers/google-drive/sync?replace=${replace ? "1" : "0"}&drive=${slot}&folderId=${encodeURIComponent(folderId)}`,
      { method: "POST" },
    )
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          if (body.error === "DRIVE_NOT_CONNECTED")
            throw new Error(
              "Google Drive no está conectado. Conéctalo una vez desde Gestionar Biblioteca.",
            );
          if (body.error === "FORBIDDEN")
            throw new Error(
              "Tu usuario no tenía permiso para sincronizar esta carpeta.",
            );
          throw new Error(
            body.message ?? body.error ?? "No se pudo sincronizar.",
          );
        }
        setNotice(
          `Drive ${slot} sincronizado: ${body.data?.created ?? 0} nuevas, ${body.data?.discovered ?? 0} encontradas.`,
        );
        setCompletedSyncSlot(slot);
        setDriveSlots((current) =>
          current.map((item) =>
            item.slot === slot
              ? {
                  ...item,
                  status: "syncing",
                  syncProcessed: body.data?.discovered ?? item.syncTotal ?? 0,
                  syncTotal: body.data?.discovered ?? item.syncTotal ?? 0,
                  syncPercent: 100,
                }
              : item,
          ),
        );
        delete driveFolderPathCache.current[`drive${slot}`];
        delete driveFacetCache.current[`drive${slot}`];
        setDriveFolderInput("");
        setDriveFolderPreview(null);
        localStorage.removeItem(`autodj-folder-${slot}`);
        await new Promise((resolve) => window.setTimeout(resolve, 1400));
        setCompletedSyncSlot(null);
        setDriveFolderPath("");
        await refreshDriveSlots();
        setCatalogRevision((revision) => revision + 1);
      })
      .catch((error: unknown) => {
        setDriveSlots((current) =>
          current.map((item) =>
            item.slot === slot ? { ...item, status: "error" } : item,
          ),
        );
        setNotice(
          error instanceof Error
            ? error.message
            : `Drive ${slot}: falló la sincronización.`,
        );
        void refreshDriveSlots();
      })
      .finally(() => syncResumeInFlight.current.delete(slot));
  }
  useEffect(() => {
    if (driveResumeHandled.current) return;
    const slot = new URLSearchParams(window.location.search).get(
      "configureDrive",
    );
    if (slot !== "01" && slot !== "02" && slot !== "03") return;
    driveResumeHandled.current = true;
    window.history.replaceState({}, "", window.location.pathname);
    setLibraryView(`Drive ${slot}`);
    void refreshDriveSlots();
  }, []);
  function openLibraryView(view: string) {
    const slotId = driveSlotFromView(view);
    if (slotId) {
      const source = `drive${slotId}`;
      // Un clic en una ranura Drive siempre representa una apertura explícita
      // de su raíz, incluso cuando esa misma vista ya estaba seleccionada.
      delete driveFolderPathCache.current[source];
      delete driveFacetCache.current[source];
      catalogTracks.current = [];
      setTracks([]);
      setQuery("");
      setGenre("");
      setMeta((current) => ({
        ...current,
        page: 1,
        total: 0,
        totalPages: 1,
        folders: [],
      }));
      setCatalogRevision((revision) => revision + 1);
    }
    setLibraryView(view);
    setDriveFolderPath("");
    if (!slotId) setMeta((current) => ({ ...current, page: 1 }));
    if (view === "AutoDJ" || view === "Playlists") {
      setTracks(queueRef.current);
      setMeta((current) => ({
        ...current,
        total: queueRef.current.length,
        totalPages: 1,
      }));
    } else if (["Videos", "Karaoke", nav[11], "Samplers"].includes(view)) {
      setQuery(view === nav[11] ? "Cuñas" : view);
    } else if (view === nav[10]) {
      setGenre("");
      setNotice("Busca un género por nombre para ver sus canciones.");
    } else if (["Favoritos", "Historial", "Recientes", nav[8]].includes(view)) {
      setNotice(
        `${view}: esta vista se actualizará con la actividad de reproducción.`,
      );
    }
  }
  function toggleFavorite(track: Track) {
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(track.id)) next.delete(track.id);
      else next.add(track.id);
      localStorage.setItem("autodj-favorites", JSON.stringify([...next]));
      return next;
    });
  }
  function selectLocalFiles(files: FileList | null) {
    if (!files?.length) return;
    const imported = Array.from(files).map((file, index) => ({
      id: `local-${file.name}-${file.lastModified}-${index}`,
      title: file.name.replace(/\.[^.]+$/, ""),
      artist: "Archivo local",
      genre: "Música local",
      durationMs: 0,
      localFile: file,
    }));
    localTracks.current = [
      ...localTracks.current,
      ...imported.filter(
        (track) =>
          !localTracks.current.some((existing) => existing.id === track.id),
      ),
    ];
    for (const track of imported)
      void saveLocalMusic({
        id: track.id,
        title: track.title,
        artist: track.artist,
        genre: track.genre,
        durationMs: track.durationMs,
        file: track.localFile,
        createdAt: new Date().toISOString(),
      });
    setTracks(localTracks.current);
    setMeta((current) => ({
      ...current,
      page: 1,
      total: localTracks.current.length,
      totalPages: 1,
    }));
    setNotice(`${localTracks.current.length} archivos locales disponibles.`);
  }
  async function removeLocalTrack(track: Track) {
    if (!track.localFile) return;
    await deleteLocalMusic(track.id);
    localTracks.current = localTracks.current.filter(
      (item) => item.id !== track.id,
    );
    setTracks((current) => current.filter((item) => item.id !== track.id));
    setMeta((current) => ({
      ...current,
      total: Math.max(0, current.total - 1),
    }));
    setNotice(`${track.title} eliminada de la música local.`);
  }
  function sameGenre(trackGenre?: string, requiredGenre?: string) {
    if (!requiredGenre) return true;
    return (
      (trackGenre ?? "").trim().toLocaleLowerCase("es") ===
      requiredGenre.trim().toLocaleLowerCase("es")
    );
  }
  async function randomTrack(
    requiredGenre?: string,
  ): Promise<Track | undefined> {
    const availableInBrowser = [
      ...localTracks.current,
      ...catalogTracks.current,
    ].filter(
      (track, index, all) =>
        sameGenre(track.genre, requiredGenre) &&
        !playedTrackIds.current.has(track.id) &&
        !Object.values(loadedTrackIds.current).includes(track.id) &&
        all.findIndex((candidate) => candidate.id === track.id) === index,
    );
    if (availableInBrowser.length) {
      return availableInBrowser[
        Math.floor(Math.random() * availableInBrowser.length)
      ];
    }
    const genreParam = requiredGenre
      ? `&genre=${encodeURIComponent(requiredGenre)}`
      : "";
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`/api/tracks?random=1${genreParam}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const body = await response.json();
      const candidate = body.data as Track | undefined;
      if (candidate && !playedTrackIds.current.has(candidate.id))
        return candidate;
    }
    const response = await fetch(`/api/tracks?random=1${genreParam}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const candidate = (await response.json()).data as Track | undefined;
    return candidate && !playedTrackIds.current.has(candidate.id)
      ? candidate
      : undefined;
  }
  async function nextAutoTrack(requiredGenre?: string): Promise<{
    track?: Track;
    source: "queue" | "library";
  }> {
    while (queueRef.current.length) {
      const [queued, ...remaining] = queueRef.current;
      queueRef.current = remaining;
      setQueue(remaining);
      if (!playedTrackIds.current.has(queued.id))
        return { track: queued, source: "queue" };
    }
    return { track: await randomTrack(requiredGenre), source: "library" };
  }
  useEffect(() => {
    if (transitioning.current) return;
    // La coreografía de Auto Mix dura 16 compases (64 beats): el disparo
    // debe llegar con tiempo suficiente para que le quepa completa antes
    // de que la pista saliente se quede sin audio, así que el margen se
    // calcula con el BPM real en vez de un número de segundos fijo.
    // Un MP3 sin índice VBR puede reportar una duración corta y errónea
    // en los primeros ticks tras cargar; solo se confía en `remaining`
    // cuando la duración ya se mantuvo estable frente al tick anterior,
    // para no disparar la continuidad automática por una lectura
    // transitoria del navegador.
    const endingDeck = (["A", "B"] as const)
      .map((id) => {
        const deck = decks[id];
        const previousDuration = stableDuration.current[id];
        const durationStable =
          previousDuration !== undefined &&
          Math.abs(previousDuration - deck.duration) < 0.5;
        stableDuration.current[id] = deck.duration;
        const remaining = deck.duration - deck.currentTime;
        const naturallyEnded =
          !deck.playing &&
          deck.currentTime > 0 &&
          remaining >= -0.5 &&
          remaining <= 1;
        const bpm = loadedBpms.current[id] ?? 120;
        const triggerWindow = Math.max(32, 64 * (60 / bpm) + 4);
        return {
          id,
          deck,
          remaining,
          naturallyEnded,
          triggerWindow,
          durationStable,
        };
      })
      .filter(
        ({ id, deck, remaining, naturallyEnded, triggerWindow, durationStable }) =>
          Boolean(loadedTrackIds.current[id]) &&
          Boolean(deck.duration) &&
          durationStable &&
          (deck.playing || naturallyEnded) &&
          remaining <= triggerWindow,
      )
      .sort((a, b) => a.remaining - b.remaining)[0];
    if (!endingDeck) return;
    const source = endingDeck.id;
    transitioning.current = true;
    const standby: DeckId = source === "A" ? "B" : "A";
    void (async () => {
      try {
        const currentGenre = loadedGenres.current[source];
        const pendingManualLoad = pendingDeckLoads.current[standby];
        if (pendingManualLoad) await pendingManualLoad;
        let nextId = loadedTrackIds.current[standby];
        const standbyReady =
          engine.current?.snapshot(standby).ready ?? decks[standby].ready;
        const standbyAlreadyPlayed = Boolean(
          nextId && playedTrackIds.current.has(nextId),
        );
        if (!standbyReady || !nextId || standbyAlreadyPlayed) {
          const selected = await nextAutoTrack(currentGenre);
          if (!selected.track)
            throw new Error(
              `No hay canciones disponibles del género ${currentGenre ?? "actual"} para continuar AutoDJ.`,
            );
          await load(selected.track, standby, false);
          nextId = selected.track.id;
          setNotice(
            `${selected.track.title} preparada desde ${selected.source === "queue" ? "Cola AutoDJ" : "Biblioteca aleatoria"}.`,
          );
        }
        trackCrossfaderDuringTransition();
        await engine.current?.smartTransition(
          source,
          standby,
          loadedBpms.current[source] ?? 120,
          loadedBpms.current[standby] ?? 120,
          loadedGenres.current[source],
          loadedGenres.current[standby],
          transitionAnalysis(loadedTracks.current[source]),
          transitionAnalysis(loadedTracks.current[standby]),
        );
        registerDeckPlay(standby);
        void playDueJingle();
        const playedId = loadedTrackIds.current[source];
        if (playedId)
          recentIds.current = [playedId, ...recentIds.current].slice(0, 20);
        loadedTrackIds.current[source] = undefined;
        loadedTracks.current[source] = undefined;
        loadedBpms.current[source] = undefined;
        setAnalysisStatus("idle");
        loadedGenres.current[source] = undefined;
        setActive(standby);
        engine.current?.setCrossfader(standby === "B" ? 1 : 0);
        stopCrossfaderAnimation(standby === "B" ? 100 : 0);
        setNotice(
          `Transición automática de ${currentGenre ?? "género actual"}: Deck ${source} → Deck ${standby}.`,
        );
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Falló la continuidad AutoDJ.",
        );
      } finally {
        transitioning.current = false;
      }
    })();
  }, [decks]);
  function beginTrackDrag(event: React.DragEvent<HTMLElement>, track: Track) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-autodj-track", track.id);
    event.dataTransfer.setData("text/plain", track.title);
  }
  async function dropTrack(event: React.DragEvent<HTMLElement>, id: DeckId) {
    event.preventDefault();
    setDragDeck(null);
    const trackId = event.dataTransfer.getData("application/x-autodj-track");
    const track = tracks.find((item) => item.id === trackId);
    if (!track) {
      setNotice("La pista arrastrada ya no está en la página actual.");
      return;
    }
    await load(track, id);
  }
  async function toggle(id: DeckId) {
    if (decks[id].playing) {
      engine.current?.pause(id);
    } else {
      const manualLoad = pendingDeckLoads.current[id];
      if (manualLoad) {
        setNotice(`Disco ${id}: preparando la canción seleccionada…`);
        try {
          await manualLoad;
        } catch (error) {
          setNotice(
            error instanceof Error
              ? `No se pudo cargar la canción seleccionada: ${error.message}`
              : "No se pudo cargar la canción seleccionada.",
          );
          return;
        }
      }
      const deckReady = engine.current?.snapshot(id).ready ?? decks[id].ready;
      if (!loadedTrackIds.current[id] || !deckReady) {
        if (loadingDecks.current.has(id)) return;
        loadingDecks.current.add(id);
        setNotice(`Buscando canción para Disco ${id}…`);
        try {
          const selected = await nextAutoTrack();
          if (!selected.track)
            throw new Error(
              "No hay canciones en Cola AutoDJ ni en la biblioteca.",
            );
          await load(selected.track, id, false);
          setNotice(
            `${selected.track.title} cargada desde ${selected.source === "queue" ? "Cola AutoDJ" : "Biblioteca aleatoria"} en Disco ${id}.`,
          );
        } catch (error) {
          setNotice(
            error instanceof Error
              ? error.message
              : "No se pudo preparar una canción automáticamente.",
          );
          return;
        } finally {
          loadingDecks.current.delete(id);
        }
      }
      try {
        if (!decks[id === "A" ? "B" : "A"].playing) cross(id === "A" ? 0 : 100);
        await engine.current?.play(id);
        registerDeckPlay(id);
        setActive(id);
        setNotice(`Reproduciendo Disco ${id}.`);
      } catch (error) {
        setNotice(
          error instanceof Error
            ? `No se pudo reproducir: ${error.message}`
            : "No se pudo iniciar el audio.",
        );
      }
    }
    refresh();
  }
  function cue(id: DeckId) {
    if (decks[id].playing) {
      engine.current?.pause(id);
      engine.current?.seek(id, cues[id]);
    } else if (Math.abs(decks[id].currentTime - cues[id]) > 0.15)
      engine.current?.seek(id, cues[id]);
    else setCues((value) => ({ ...value, [id]: decks[id].currentTime }));
    refresh();
  }
  function syncDeck(id: DeckId) {
    const other: DeckId = id === "A" ? "B" : "A";
    engine.current?.setTempo(id, decks[other].playbackRate || 1);
    setNotice(`SYNC: Deck ${id} igualado con Deck ${other}.`);
    refresh();
  }
  function beatJump(id: DeckId, direction: -1 | 1) {
    engine.current?.jump(id, direction * 2);
    setNotice(
      `Deck ${id}: salto ${direction > 0 ? "adelante" : "atrás"} de 4 beats.`,
    );
  }
  function loopIn(id: DeckId) {
    const point = engine.current?.currentTime(id) ?? 0;
    engine.current?.clearLoop(id);
    setLoopStarts((value) => ({ ...value, [id]: point }));
    setLoops((value) => ({ ...value, [id]: false }));
    setNotice(`LOOP IN Deck ${id}: ${fmt(point)}.`);
  }
  function loopOut(id: DeckId) {
    if (loops[id]) {
      engine.current?.clearLoop(id);
      setLoops((value) => ({ ...value, [id]: false }));
      return;
    }
    const start = loopStarts[id];
    if (start === undefined) return;
    try {
      const bpm = loadedBpms.current[id] ?? 120;
      const duration = (60 / Math.max(1, bpm)) * loopBeats[id];
      engine.current?.setLoop(id, start, start + duration);
      setLoops((value) => ({ ...value, [id]: true }));
      setNotice(
        `LOOP ${loopBeats[id]} BEATS Deck ${id}: ${duration.toFixed(2)} s.`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Loop inválido.");
    }
  }
  function keyLock(id: DeckId) {
    const enabled = !keyLocks[id];
    engine.current?.setKeyLock(id, enabled);
    setKeyLocks((value) => ({ ...value, [id]: enabled }));
    setNotice(`KEY LOCK Deck ${id}: ${enabled ? "ON" : "OFF"}.`);
  }
  function hitHotCue(id: DeckId, slot: HotCueSlot) {
    if (!engine.current) return;
    const jumped = engine.current.triggerHotCue(id, slot);
    if (jumped) {
      setNotice(`Hot Cue ${slot} · Disco ${id}.`);
    } else {
      engine.current.setHotCue(id, slot);
      setNotice(`Hot Cue ${slot} guardado en Disco ${id}.`);
    }
    setHotCues((current) => ({
      ...current,
      [id]: engine.current!.hotCuesFor(id),
    }));
  }
  function clearHotCue(id: DeckId, slot: HotCueSlot) {
    engine.current?.clearHotCue(id, slot);
    setHotCues((current) => ({
      ...current,
      [id]: engine.current?.hotCuesFor(id) ?? {},
    }));
  }
  function releaseHotCue(id: DeckId) {
    engine.current?.releaseHotCue(id);
  }
  function toggleSlip(id: DeckId) {
    const enabled = !slipOn[id];
    engine.current?.setSlipMode(id, enabled);
    setSlipOn((current) => ({ ...current, [id]: enabled }));
    setNotice(`SLIP Disco ${id}: ${enabled ? "ON" : "OFF"}.`);
  }
  function cross(n: number) {
    setCrossfade(n);
    engine.current?.setCrossfader(n / 100);
  }
  // Durante Auto Mix el volumen de A/B lo anima el TransitionEngine sobre el
  // AudioParam directamente, sin pasar por este componente — así que el
  // crossfader visual se quedaba clavado hasta el salto final. Este loop
  // sigue el valor real de audio cuadro a cuadro (~60fps) mientras dura la
  // transición, para que el usuario VEA el fader deslizarse lento igual que
  // se escucha, en vez de saltar de golpe al terminar.
  function trackCrossfaderDuringTransition() {
    crossfaderAnimation.current += 1;
    const token = crossfaderAnimation.current;
    const step = () => {
      if (token !== crossfaderAnimation.current || !engine.current) return;
      setCrossfade(engine.current.crossfaderPosition());
      if (transitioning.current) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function stopCrossfaderAnimation(finalValue: number) {
    crossfaderAnimation.current += 1;
    setCrossfade(finalValue);
  }
  function commitQueue(next: Track[]) {
    queueRef.current = next;
    setQueue(next);
  }
  function registerDeckPlay(id: DeckId) {
    const track = loadedTracks.current[id];
    if (!track) return;
    playedTrackIds.current.add(track.id);
    setDeckPlayHistory((current) => {
      const latest = current[0];
      if (latest?.deck === id && latest.track.id === track.id) return current;
      const entry = {
        id: `${id}-${track.id}-${Date.now()}`,
        deck: id,
        track,
        playedAt: new Date(),
      };
      void saveDeckHistory({
        id: entry.id,
        trackId: track.id,
        title: track.title,
        artist: track.artist,
        genre: track.genre,
        bpm: track.analysis?.bpm,
        musicalKey: track.analysis?.musicalKey,
        playedAt: entry.playedAt.toISOString(),
      });
      return [entry, ...current].slice(0, 100);
    });
  }
  function moveQueue(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= queueRef.current.length) return;
    const next = [...queueRef.current];
    [next[index], next[target]] = [next[target], next[index]];
    commitQueue(next);
  }
  function reorderQueue(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    const next = [...queueRef.current];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    commitQueue(next);
  }
  async function mixQueuedNow(index = 0) {
    const track = queueRef.current[index];
    if (!track || transitioning.current) return;
    const from: DeckId = decks.A.playing ? "A" : decks.B.playing ? "B" : active;
    const target: DeckId = decks[from].playing
      ? from === "A"
        ? "B"
        : "A"
      : from;
    transitioning.current = true;
    commitQueue(queueRef.current.filter((_, itemIndex) => itemIndex !== index));
    setNotice(`Preparando ${track.title} desde Cola AutoDJ…`);
    try {
      await load(track, target, false);
      if (decks[from].playing && target !== from) {
        await engine.current?.smartTransition(
          from,
          target,
          loadedBpms.current[from] ?? 120,
          loadedBpms.current[target] ?? 120,
          loadedGenres.current[from],
          loadedGenres.current[target],
          transitionAnalysis(loadedTracks.current[from]),
          transitionAnalysis(loadedTracks.current[target]),
        );
        registerDeckPlay(target);
        loadedTrackIds.current[from] = undefined;
        loadedTracks.current[from] = undefined;
        loadedBpms.current[from] = undefined;
        setAnalysisStatus("idle");
        loadedGenres.current[from] = undefined;
      } else {
        cross(target === "A" ? 0 : 100);
        await engine.current?.play(target);
        registerDeckPlay(target);
      }
      setActive(target);
      cross(target === "A" ? 0 : 100);
      setNotice(`${track.title} ahora suena en Disco ${target}.`);
      refresh();
    } catch (error) {
      if (!queueRef.current.some((item) => item.id === track.id)) {
        const restored = [...queueRef.current];
        restored.splice(Math.min(index, restored.length), 0, track);
        commitQueue(restored);
      }
      setNotice(
        error instanceof Error
          ? error.message
          : "No se pudo reproducir la siguiente canción.",
      );
    } finally {
      transitioning.current = false;
    }
  }
  function mix() {
    if (transitioning.current) return;
    const from: DeckId =
      decks.A.playing && !decks.B.playing
        ? "A"
        : decks.B.playing && !decks.A.playing
          ? "B"
          : active;
    const to: DeckId = from === "A" ? "B" : "A";
    if (!decks[from].playing) {
      setNotice("Primero reproduce la canción que deseas mezclar.");
      return;
    }
    if (!decks[to].ready || !loadedTrackIds.current[to]) {
      setNotice(`Carga una canción en Deck ${to} antes de usar Auto Mix.`);
      return;
    }
    transitioning.current = true;
    setNotice("Auto Mix: mezclando BPM, bajos y efectos en el próximo golpe…");
    trackCrossfaderDuringTransition();
    engine.current
      ?.smartTransition(
        from,
        to,
        loadedBpms.current[from] ?? 120,
        loadedBpms.current[to] ?? 120,
        loadedGenres.current[from],
        loadedGenres.current[to],
        transitionAnalysis(loadedTracks.current[from]),
        transitionAnalysis(loadedTracks.current[to]),
      )
      .then(() => {
        registerDeckPlay(to);
        setActive(to);
        loadedTrackIds.current[from] = undefined;
        loadedTracks.current[from] = undefined;
        loadedBpms.current[from] = undefined;
        setAnalysisStatus("idle");
        loadedGenres.current[from] = undefined;
        engine.current?.setCrossfader(to === "B" ? 1 : 0);
        stopCrossfaderAnimation(to === "B" ? 100 : 0);
        setNotice(
          `Mezcla profesional completada: Disco ${from} → Disco ${to}, sin crossfade.`,
        );
      })
      .catch((error) =>
        setNotice(
          error instanceof Error
            ? error.message
            : "No se pudo realizar la transición inteligente.",
        ),
      )
      .finally(() => {
        transitioning.current = false;
      });
  }

  async function analyzeLoadedTracks() {
    const trackA = loadedTracks.current.A;
    const trackB = loadedTracks.current.B;
    if (!trackA || !trackB) {
      setAnalysisStatus("error");
      setNotice("Carga una canción en cada deck antes de analizar.");
      return;
    }
    const selected: Track[] = [trackA, trackB];
    setAnalysisStatus("analyzing");
    setNotice(
      "Analizando BPM, tonalidad, estructura y beatgrid de ambas pistas…",
    );
    try {
      await Promise.all(
        selected.map(async (track) => {
          if (
            track.analysis?.analyzerVersion === "browser-professional-v2" &&
            track.analysis.beatgrid &&
            track.analysis.cuePoints
          )
            return;
          const source = track.localFile ?? `/api/tracks/${track.id}/stream`;
          const result: AudioAnalysis = await analyzeAudioFile(source);
          if (track.localFile) {
            // Browser-selected files do not have a Track row in PostgreSQL.
            // Keep their professional analysis on the local track so Auto Mix
            // can use it without trying to persist a non-existent database ID.
            track.analysis = {
              bpm: result.bpm,
              bpmConfidence: result.bpmConfidence,
              musicalKey: result.key,
              keyConfidence: result.keyConfidence,
              energy: result.energy,
              loudnessLufs: result.loudnessLufs,
              truePeakDb: 20 * Math.log10(Math.max(result.peak, 1e-8)),
              analyzerVersion: "browser-professional-v2",
              cuePoints: result.cuePoints,
              beatgrid: result.beatgrid,
              waveform: { version: 2, peaks: result.waveform },
            };
          } else {
            const response = await fetch(`/api/tracks/${track.id}/analysis`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(result),
            });
            const body = await response.json();
            if (!response.ok)
              throw new Error(
                body.error ??
                  `No se pudo guardar el análisis de ${track.title}`,
              );
            track.analysis = body.data;
          }
          loadedBpms.current[
            loadedTracks.current.A?.id === track.id ? "A" : "B"
          ] = result.bpm;
        }),
      );
      setAnalysisStatus("ready");
      setCatalogRevision((value) => value + 1);
      setNotice(
        "Análisis profesional completado y guardado. Auto Mix Inteligente está listo.",
      );
    } catch (error) {
      setAnalysisStatus("error");
      setNotice(
        error instanceof Error ? error.message : "Falló el análisis de audio.",
      );
    }
  }
  return (
    <div className="dj-app min-h-[calc(100vh-1rem)] overflow-visible rounded-xl border border-slate-700 bg-[#050608] shadow-2xl">
      <header className="flex min-h-16 items-center border-b border-slate-700 bg-gradient-to-b from-[#20242b] to-[#0b0d11] px-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded bg-red-600 font-black text-white">
            I
          </span>
          <div className="flex items-center gap-4">
            <div>
              <b className="text-sm">
                INFONET <span className="text-red-500">AutoDJ</span>
              </b>
              <small className="block text-[7px] uppercase tracking-[.2em] text-slate-500">
                Intelligent Music Mixing System
              </small>
            </div>
            <Link
              href="/library"
              className="dj-button flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-bold text-slate-200 hover:text-cyan"
            >
              <Library size={12} /> GESTIONAR BIBLIOTECA
            </Link>
            <div
              className={`flex h-12 items-center gap-2 rounded-md border px-2.5 font-mono shadow-inner transition-all ${
                transitionDebug?.state === "BASS_SWAP"
                  ? "border-lime/70 bg-lime/15 shadow-[0_0_16px_rgba(132,204,22,.22)]"
                  : "border-cyan/25 bg-black/35"
              }`}
              title="Estado en tiempo real del motor profesional de transiciones"
            >
              <span
                className={`grid h-5 w-5 place-items-center rounded-full ${
                  transitionDebug?.state === "BASS_SWAP"
                    ? "animate-pulse bg-lime text-black"
                    : "bg-cyan/10 text-cyan"
                }`}
              >
                <Zap size={11} fill="currentColor" />
              </span>
              <span className="min-w-28 leading-none">
                <b className="block text-[8px] tracking-[.12em] text-slate-200">
                  DJ TRANSITION ENGINE
                </b>
                <small
                  className={`mt-1 block font-mono text-[7px] ${
                    transitionDebug?.state === "BASS_SWAP"
                      ? "font-black text-lime"
                      : "text-slate-500"
                  }`}
                >
                  {transitionDebug?.state === "BASS_SWAP"
                    ? "⚡ BASS SWAP"
                    : (transitionDebug?.state ?? "IDLE")}
                </small>
              </span>
              <span className="h-8 w-px bg-slate-700" />
              <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[6px] text-slate-500">
                <span>A BPM</span>
                <span>B BPM</span>
                <span>SYNC</span>
                <b className="text-[9px] text-cyan">
                  {loadedTracks.current.A?.analysis?.bpm?.toFixed(2) ?? "—"}
                </b>
                <b className="text-[9px] text-red-400">
                  {loadedTracks.current.B?.analysis?.bpm?.toFixed(2) ?? "—"}
                </b>
                <b className="text-[9px] text-lime">
                  {transitionDebug?.syncBpm.toFixed(2) ?? "—"}
                </b>
                <span>DOWNBEAT</span>
                <span>PHRASE</span>
                <span>SWAP EN</span>
                <b className="text-[8px] text-slate-300">
                  {transitionDebug
                    ? `${transitionDebug.nextDownbeat.toFixed(2)}s`
                    : "—"}
                </b>
                <b className="text-[8px] text-slate-300">
                  {transitionDebug
                    ? `${transitionDebug.nextPhrase.toFixed(2)}s`
                    : "—"}
                </b>
                <b className="text-[8px] text-lime">
                  {transitionDebug
                    ? `${Math.max(0, transitionDebug.bassSwapTime - transitionDebug.startTime).toFixed(2)}s`
                    : "—"}
                </b>
              </div>
              <span className="h-8 w-px bg-slate-700" />
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[6px]">
                {[
                  ["BEAT", transitionDebug?.beatSync],
                  ["DOWNBEAT", transitionDebug?.downbeatSync],
                  ["PHRASE", transitionDebug?.phraseSync],
                  ["BASS ARMED", transitionDebug?.bassSwapArmed],
                ].map(([label, ok]) => (
                  <span
                    key={String(label)}
                    className={ok ? "text-lime" : "text-slate-600"}
                  >
                    {label} {ok ? "✓" : "—"}
                  </span>
                ))}
              </div>
              <span className="h-8 w-px bg-slate-700" />
              <div className="grid w-24 grid-cols-[auto_1fr_auto] items-center gap-x-1.5 gap-y-1 text-[6px]">
                <span className="text-cyan">BASS A</span>
                <div className="h-1 overflow-hidden rounded bg-slate-800">
                  <div
                    className="h-full bg-cyan transition-all"
                    style={{
                      width: `${(transitionDebug?.bassA ?? 0) * 100}%`,
                    }}
                  />
                </div>
                <b>{Math.round((transitionDebug?.bassA ?? 0) * 100)}%</b>
                <span className="text-red-400">BASS B</span>
                <div className="h-1 overflow-hidden rounded bg-slate-800">
                  <div
                    className="h-full bg-red-500 transition-all"
                    style={{
                      width: `${(transitionDebug?.bassB ?? 0) * 100}%`,
                    }}
                  />
                </div>
                <b>{Math.round((transitionDebug?.bassB ?? 0) * 100)}%</b>
              </div>
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-4 text-[9px] text-slate-400">
          <span
            title={`AudioContext: ${audioContextState}`}
            className={
              audioContextState === "running" ? "text-lime" : "text-amber-400"
            }
          >
            <Activity size={13} className="inline" />{" "}
            {audioContextState === "running"
              ? "AUDIO ACTIVO"
              : audioContextState === "suspended"
                ? "AUDIO EN PAUSA"
                : "AUDIO CERRADO"}
          </span>
          <span className={engineReady ? "text-lime" : "text-slate-600"}>
            <Wifi size={13} className="inline" /> MOTOR{" "}
            {engineReady ? "LISTO" : "INICIANDO"}
          </span>
          <b className="font-mono text-sm text-white">{clock}</b>
          <Settings size={15} />
        </div>
      </header>
      <section className="relative grid h-28 grid-rows-2 border-b border-slate-700 bg-black px-2">
        <div className="absolute right-2 top-1 z-20 flex rounded border border-slate-700 bg-black/85 p-0.5">
          {(["bars", "mirror", "spectrum"] as WaveMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setWaveMode(mode)}
              className={`rounded px-2 py-1 text-[7px] uppercase ${waveMode === mode ? "bg-white/15 text-white" : "text-slate-500"}`}
            >
              {mode === "bars"
                ? "Barras"
                : mode === "mirror"
                  ? "Espejo"
                  : "Espectral"}
            </button>
          ))}
        </div>
        <LiveWaveform
          id="A"
          data={waves.A}
          mode={waveMode}
          onSeek={(seconds) => engine.current?.seek("A", seconds)}
        />
        <LiveWaveform
          id="B"
          data={waves.B}
          mode={waveMode}
          onSeek={(seconds) => engine.current?.seek("B", seconds)}
        />
      </section>
      <section className="grid grid-cols-[1fr_210px_1fr] gap-2 p-2">
        <Deck
          id="A"
          state={decks.A}
          wave={waves.A}
          waveMode={waveMode}
          dragOver={dragDeck === "A"}
          onDragEnter={() => setDragDeck("A")}
          onDragLeave={() => setDragDeck(null)}
          onDrop={(event) => dropTrack(event, "A")}
          onToggle={() => toggle("A")}
          onSeek={(n) => engine.current?.seek("A", n)}
          onTempo={(rate) => {
            setManualPitch((current) => ({ ...current, A: rate * 100 }));
            engine.current?.setTempo("A", rate);
          }}
          onCue={() => cue("A")}
          onSync={() => syncDeck("A")}
          onBeatBack={() => beatJump("A", -1)}
          onBeatForward={() => beatJump("A", 1)}
          onLoopIn={() => loopIn("A")}
          onLoopOut={() => loopOut("A")}
          onKeyLock={() => keyLock("A")}
          loopReady={loopStarts.A !== undefined}
          loopActive={loops.A}
          loopBeats={loopBeats.A}
          onLoopBeats={(beats) =>
            setLoopBeats((current) => ({ ...current, A: beats }))
          }
          keyLock={keyLocks.A}
          pitchValue={manualPitch.A}
          bpm={loadedTracks.current.A?.analysis?.bpm}
          musicalKey={loadedTracks.current.A?.analysis?.musicalKey}
          padCounts={
            Object.fromEntries(
              performancePads.map((pad) => [
                pad.kind,
                padSamples.filter(
                  (sample) => sample.deck === "A" && sample.kind === pad.kind,
                ).length,
              ]),
            ) as Record<PerformancePadKind, number>
          }
          activePads={activePads.A}
          onPadOpen={(kind) => setPadModal({ deck: "A", kind })}
          onScratch={(delta) =>
            engine.current?.jogScratch("A", delta, decks.A.playing)
          }
          trackName={loadedTracks.current.A?.title}
          hotCues={hotCues.A}
          onHotCue={(slot) => hitHotCue("A", slot)}
          onHotCueClear={(slot) => clearHotCue("A", slot)}
          onHotCueRelease={() => releaseHotCue("A")}
          slipOn={slipOn.A}
          onSlipToggle={() => toggleSlip("A")}
        />
        <Mixer
          crossfade={crossfade}
          setCrossfade={cross}
          onMix={mix}
          peaks={{ A: decks.A.peak, B: decks.B.peak }}
          onVolume={(id, value) => engine.current?.setChannelVolume(id, value)}
          onEq={(id, band, db) => engine.current?.setDeckEq(id, band, db)}
          onFilter={(id, position) =>
            engine.current?.setColorFilter(id, position)
          }
          karaokeOn={karaokeOn}
          onKaraoke={(id, enabled) => {
            setKaraokeOn((current) => ({ ...current, [id]: enabled }));
            engine.current?.setKaraoke(id, enabled);
            setNotice(
              `Karaoke Disco ${id}: ${enabled ? "voz cancelada" : "desactivado"}.`,
            );
          }}
          onDelayMix={(value) => engine.current?.setDelayMix(value)}
          onReverbMix={(value) => engine.current?.setReverbMix(value)}
          onDelayTime={(seconds) => engine.current?.setDelayTime(seconds)}
          liveFx={liveFx}
        />
        <Deck
          id="B"
          state={decks.B}
          wave={waves.B}
          waveMode={waveMode}
          dragOver={dragDeck === "B"}
          onDragEnter={() => setDragDeck("B")}
          onDragLeave={() => setDragDeck(null)}
          onDrop={(event) => dropTrack(event, "B")}
          onToggle={() => toggle("B")}
          onSeek={(n) => engine.current?.seek("B", n)}
          onTempo={(rate) => {
            setManualPitch((current) => ({ ...current, B: rate * 100 }));
            engine.current?.setTempo("B", rate);
          }}
          onCue={() => cue("B")}
          onSync={() => syncDeck("B")}
          onBeatBack={() => beatJump("B", -1)}
          onBeatForward={() => beatJump("B", 1)}
          onLoopIn={() => loopIn("B")}
          onLoopOut={() => loopOut("B")}
          onKeyLock={() => keyLock("B")}
          loopReady={loopStarts.B !== undefined}
          loopActive={loops.B}
          loopBeats={loopBeats.B}
          onLoopBeats={(beats) =>
            setLoopBeats((current) => ({ ...current, B: beats }))
          }
          keyLock={keyLocks.B}
          pitchValue={manualPitch.B}
          bpm={loadedTracks.current.B?.analysis?.bpm}
          musicalKey={loadedTracks.current.B?.analysis?.musicalKey}
          padCounts={
            Object.fromEntries(
              performancePads.map((pad) => [
                pad.kind,
                padSamples.filter(
                  (sample) => sample.deck === "B" && sample.kind === pad.kind,
                ).length,
              ]),
            ) as Record<PerformancePadKind, number>
          }
          activePads={activePads.B}
          onPadOpen={(kind) => setPadModal({ deck: "B", kind })}
          onScratch={(delta) =>
            engine.current?.jogScratch("B", delta, decks.B.playing)
          }
          trackName={loadedTracks.current.B?.title}
          hotCues={hotCues.B}
          onHotCue={(slot) => hitHotCue("B", slot)}
          onHotCueClear={(slot) => clearHotCue("B", slot)}
          onHotCueRelease={() => releaseHotCue("B")}
          slipOn={slipOn.B}
          onSlipToggle={() => toggleSlip("B")}
        />
      </section>
      <section className="grid min-h-[390px] grid-cols-[205px_minmax(0,1fr)_280px] border-t border-slate-700">
        <input
          ref={localInput}
          type="file"
          accept="audio/*,.mp3,.wav,.flac,.ogg,.m4a,.aac"
          multiple
          className="hidden"
          onChange={(event) => selectLocalFiles(event.target.files)}
        />
        <aside className="overflow-auto border-r border-slate-700 bg-[#0a0c10] p-3">
          <p className="mb-2 text-[13px] font-black uppercase tracking-[.14em] text-slate-300">
            Biblioteca
          </p>
          {libraryNav.map((x, i) => {
            const slot = i < 3 ? driveSlots[i] : undefined;
            const label = slot?.folderName ?? (slot ? "Drive libre" : x);
            return (
              <div key={x} className="group flex items-center gap-1">
                <button
                  onClick={() => openLibraryView(x)}
                  className={`flex min-w-0 flex-1 items-center gap-3 rounded-md px-2.5 py-1.5 text-left text-[13px] font-semibold ${libraryView === x ? "bg-red-600/20 text-red-300" : "text-slate-200 hover:bg-white/5"}`}
                >
                  {i < 3 ? (
                    <Library
                      size={15}
                      className={
                        slot?.folderName ? "text-lime" : "text-slate-600"
                      }
                    />
                  ) : i === 3 ? (
                    <Library size={15} />
                  ) : i === 4 ? (
                    <Star size={15} />
                  ) : i === 5 ? (
                    <History size={15} />
                  ) : i === 11 ? (
                    <Video size={15} />
                  ) : (
                    <Library size={15} />
                  )}
                  <span className="truncate">{label}</span>
                  {slot?.status === "syncing" && (
                    <span className="ml-auto font-mono text-[9px] font-black text-cyan">
                      {slot.syncPercent ?? 0}%
                    </span>
                  )}
                  {slot && !slot.folderName && (
                    <span className="ml-auto text-[10px] text-slate-600">
                      ＋
                    </span>
                  )}
                </button>
                {slot?.folderName && (
                  <button
                    type="button"
                    title={`Desconectar ${slot.folderName}`}
                    onClick={() => void disconnectDriveSlot(slot.slot)}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded text-slate-600 hover:bg-red-500/15 hover:text-red-400"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </aside>
        <main className="min-w-0 bg-[#080a0d]">
          <div className="flex h-10 items-center gap-2 border-b border-slate-700 px-2">
            <Search size={13} />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setMeta((m) => ({ ...m, page: 1 }));
              }}
              placeholder="Buscar título, artista, género…"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none"
            />
            <span className="text-[8px] text-slate-500">
              {meta.total} pistas
            </span>
          </div>
          <div className="grid grid-cols-[30px_1.5fr_1fr_55px_45px_90px_58px_116px] border-b border-slate-800 px-2 py-1.5 text-[8px] font-bold uppercase tracking-wide text-slate-500">
            <span />
            <span>Título</span>
            <span>Artista</span>
            <span>BPM</span>
            <span>Key</span>
            <span>Género</span>
            <span>Duración</span>
          </div>
          {(() => {
            const slotId = driveSlotFromView(libraryView);
            const slot = slotId
              ? driveSlots.find((item) => item.slot === slotId)
              : undefined;
            if (!slot?.folderId || slot.status === "error") return null;
            const syncing = slot.status === "syncing";
            const synchronized =
              !syncing &&
              slot.status === "connected" &&
              (slot.syncTotal ?? 0) > 0;
            if (!syncing && !synchronized) return null;
            const percent = syncing ? (slot.syncPercent ?? 0) : 100;
            return (
              <div className="flex min-h-8 items-center border-b border-slate-700 bg-[#11151b] px-3">
                <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-slate-200">
                  {slot.folderName}
                </span>
                <span className="mr-3 w-36">
                  {syncing && (
                    <span className="block h-1.5 overflow-hidden rounded-sm bg-slate-700">
                      <span
                        className="block h-full bg-sky-500 transition-[width] duration-300"
                        style={{ width: `${percent}%` }}
                      />
                    </span>
                  )}
                </span>
                <span
                  className={`w-[116px] text-right font-mono text-[10px] font-black ${syncing ? "text-sky-400" : "text-emerald-400"}`}
                >
                  {syncing
                    ? `SINCRONIZANDO · ${percent}%`
                    : "SINCRONIZADO AL 100%"}
                </span>
              </div>
            );
          })()}
          <div className="h-[220px] overflow-auto">
            {(() => {
              const slotId = driveSlotFromView(libraryView);
              const slot = slotId
                ? driveSlots.find((item) => item.slot === slotId)
                : undefined;
              if (
                !slotId ||
                !slot?.folderId ||
                slot.status !== "connected" ||
                slot.syncTotal !== 0
              )
                return null;
              return (
                <div className="flex items-center gap-3 border-b border-amber-400/30 bg-amber-400/[.07] px-3 py-2">
                  <Library size={16} className="shrink-0 text-amber-300" />
                  <span className="min-w-0 flex-1">
                    <b className="block text-[11px] text-amber-200">
                      SUBCARPETAS PENDIENTES DE INDEXAR
                    </b>
                    <small className="text-[9px] text-slate-400">
                      Actualiza la estructura sin borrar ni duplicar canciones.
                    </small>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void configureDriveInBackground(
                        slotId,
                        slot.folderId,
                        false,
                      )
                    }
                    className="rounded border border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-[9px] font-black text-amber-200"
                  >
                    INDEXAR AHORA
                  </button>
                </div>
              );
            })()}
            {driveSlotFromView(libraryView) && !query && (
              <div className="flex items-center gap-1 border-b border-slate-800 bg-[#0d1117] px-2 py-1.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => {
                    setDriveFolderPath("");
                    setMeta((current) => ({ ...current, page: 1 }));
                  }}
                  className="font-bold text-cyan hover:text-white"
                >
                  {driveSlots.find(
                    (item) => item.slot === driveSlotFromView(libraryView),
                  )?.folderName ?? "Drive"}
                </button>
                {driveFolderPath
                  .split("/")
                  .filter(Boolean)
                  .map((part, index, all) => (
                    <span
                      key={`${part}-${index}`}
                      className="flex items-center gap-1"
                    >
                      <ChevronRight size={10} className="text-slate-600" />
                      <button
                        type="button"
                        onClick={() => {
                          setDriveFolderPath(all.slice(0, index + 1).join("/"));
                          setMeta((current) => ({ ...current, page: 1 }));
                        }}
                        className="font-semibold text-slate-300 hover:text-cyan"
                      >
                        {part}
                      </button>
                    </span>
                  ))}
              </div>
            )}
            {!tracks.length &&
              !meta.folders.length &&
              (() => {
                const selectedSlotId = driveSlotFromView(libraryView);
                const selectedSlot = selectedSlotId
                  ? driveSlots.find((item) => item.slot === selectedSlotId)
                  : undefined;
                if (selectedSlotId && selectedSlot?.status === "syncing")
                  return null;
                if (selectedSlotId && selectedSlot?.status === "error")
                  return (
                    <div className="grid h-full place-items-center px-8 text-center">
                      <div className="w-full max-w-lg rounded-lg border border-red-500/30 bg-red-500/[.06] p-5">
                        <b className="text-sm text-red-300">
                          ERROR DE SINCRONIZACIÓN
                        </b>
                        <p className="mt-2 break-words text-[11px] text-slate-300">
                          {selectedSlot.error ??
                            "Google Drive rechazó la sincronización."}
                        </p>
                        {selectedSlot.folderId && (
                          <button
                            type="button"
                            onClick={() =>
                              void configureDriveInBackground(
                                selectedSlotId,
                                selectedSlot.folderId,
                                false,
                              )
                            }
                            className="mt-4 rounded-md border border-cyan/50 bg-cyan/10 px-5 py-2 text-[10px] font-black text-cyan"
                          >
                            REINTENTAR SIN BORRAR
                          </button>
                        )}
                      </div>
                    </div>
                  );
                if (selectedSlotId && !hasConnectedDriveAccount)
                  return (
                    <div className="grid h-full place-items-center text-center">
                      <div>
                        <Library className="mx-auto mb-3 text-slate-500" />
                        <b className="text-sm">
                          GOOGLE DRIVE NO ESTÁ CONECTADO
                        </b>
                        <p className="mt-1 text-[10px] text-slate-500">
                          Autoriza tu cuenta para seleccionar una carpeta
                          musical.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            const returnTo = `/?configureDrive=${selectedSlotId}`;
                            window.location.assign(
                              `/api/auth/google-drive/connect?returnTo=${encodeURIComponent(returnTo)}`,
                            );
                          }}
                          className="mt-4 rounded-md border border-cyan/50 bg-cyan/10 px-5 py-2 text-[10px] font-black text-cyan"
                        >
                          CONECTAR DRIVE
                        </button>
                      </div>
                    </div>
                  );
                if (selectedSlotId && !selectedSlot?.folderId)
                  return (
                    <div className="grid h-full place-items-center px-10">
                      <div className="w-full max-w-lg text-center">
                        <b className="text-sm">VINCULAR CARPETA MUSICAL</b>
                        <p className="mt-1 text-[10px] text-slate-500">
                          Pega la URL de una carpeta de Google Drive o su ID.
                        </p>
                        <div className="mt-4 flex gap-2">
                          <input
                            value={driveFolderInput}
                            onChange={(event) => {
                              setDriveFolderInput(event.target.value);
                              setDriveFolderPreview(null);
                            }}
                            placeholder="https://drive.google.com/drive/folders/…"
                            className="min-w-0 flex-1 rounded-md border border-slate-600 bg-black px-3 py-2 text-[11px] outline-none focus:border-cyan"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              void previewDriveFolder(selectedSlotId)
                            }
                            className="rounded-md border border-lime/50 bg-lime/10 px-4 text-[9px] font-black text-lime"
                          >
                            VALIDAR
                          </button>
                        </div>
                        {driveFolderPreview?.slot === selectedSlotId && (
                          <div className="mt-3 flex items-center rounded-md border border-lime/30 bg-lime/[.06] p-2 text-left">
                            <Library size={15} className="mr-2 text-lime" />
                            <span className="min-w-0 flex-1">
                              <small className="block text-[7px] text-slate-500">
                                CARPETA ENCONTRADA
                              </small>
                              <b className="block truncate text-[11px] text-slate-100">
                                {driveFolderPreview.folderName}
                              </b>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                void configureDriveInBackground(
                                  selectedSlotId,
                                  driveFolderPreview.folderId,
                                )
                              }
                              className="rounded bg-lime px-3 py-2 text-[8px] font-black text-black"
                            >
                              CONFIRMAR Y SINCRONIZAR
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                if (selectedSlotId && selectedSlot?.folderId)
                  return (
                    <div className="grid h-full place-items-center text-center">
                      <div>
                        <Library className="mx-auto mb-3 text-lime" />
                        <b className="text-sm">{selectedSlot.folderName}</b>
                        <p className="mt-1 text-[10px] text-slate-500">
                          La carpeta está conectada, pero no contiene audios
                          compatibles.
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            void configureDriveInBackground(
                              selectedSlotId,
                              selectedSlot.folderId,
                              false,
                            )
                          }
                          className="mt-3 rounded border border-slate-600 px-4 py-2 text-[9px] text-slate-300"
                        >
                          ↻ INDEXAR SUBCARPETAS
                        </button>
                      </div>
                    </div>
                  );
                if (libraryView === nav[1])
                  return (
                    <div className="grid h-full place-items-center text-center">
                      <div>
                        <Disc3 className="mx-auto mb-3 text-cyan" />
                        <b className="text-sm">NO HAY MÚSICA LOCAL</b>
                        <p className="mt-1 text-[10px] text-slate-500">
                          Los archivos importados permanecerán guardados después
                          de F5.
                        </p>
                        <button
                          onClick={() => localInput.current?.click()}
                          className="mt-3 rounded-md border border-cyan/50 bg-cyan/10 px-5 py-2 text-[10px] font-black text-cyan"
                        >
                          ABRIR COMPUTADORA
                        </button>
                      </div>
                    </div>
                  );
                return (
                  <div className="grid h-full place-items-center text-center text-slate-500">
                    <div>
                      <Library className="mx-auto mb-2" />
                      <b className="text-[12px]">
                        {libraryView.toUpperCase()} ESTÁ VACÍO
                      </b>
                      <p className="mt-1 text-[10px]">
                        El contenido aparecerá aquí cuando esté disponible.
                      </p>
                    </div>
                  </div>
                );
              })()}
            {!query && meta.folders.length > 0 && (
              <div className="border-b border-slate-700 bg-[#151a21] px-3 py-1 text-[8px] font-black uppercase tracking-[.16em] text-slate-400">
                Carpetas · {meta.folders.length}
              </div>
            )}
            {!query &&
              meta.folders.map((folder) => (
                <button
                  type="button"
                  key={`${driveFolderPath}/${folder}`}
                  onClick={() => {
                    const exactPath = driveFolderPath
                      ? `${driveFolderPath}/${folder}`
                      : folder;
                    setTracks([]);
                    setMeta((current) => ({
                      ...current,
                      page: 1,
                      total: 0,
                      totalPages: 1,
                      folders: [],
                    }));
                    setDriveFolderPath(exactPath.normalize("NFC"));
                  }}
                  className="grid min-h-10 w-full grid-cols-[30px_1fr_auto] items-center border-b border-slate-800 bg-cyan/[.025] px-2 py-1.5 text-left hover:bg-cyan/10"
                >
                  <Library size={17} className="text-amber-300" />
                  <span>
                    <b className="block text-[12px] text-slate-100">{folder}</b>
                    <small className="text-[9px] uppercase tracking-wide text-slate-500">
                      Carpeta musical
                    </small>
                  </span>
                  <ChevronRight size={15} className="text-slate-500" />
                </button>
              ))}
            {!query && meta.folders.length > 0 && tracks.length > 0 && (
              <div className="border-y border-slate-700 bg-[#151a21] px-3 py-1 text-[8px] font-black uppercase tracking-[.16em] text-slate-400">
                Canciones en esta carpeta · {meta.total}
              </div>
            )}
            {tracks.map((track) => (
              <div
                key={track.id}
                draggable
                onDragStart={(event) => beginTrackDrag(event, track)}
                onDragEnd={() => setDragDeck(null)}
                onDoubleClick={() => loadInFreeDeck(track)}
                className="grid min-h-8 cursor-grab grid-cols-[30px_1.5fr_1fr_55px_45px_90px_58px_116px] items-center border-b border-slate-900 px-2 py-1.5 text-[10px] hover:bg-white/5 active:cursor-grabbing"
              >
                <Disc3 size={16} className="text-slate-500" />
                <button
                  onClick={() => loadInFreeDeck(track)}
                  className="truncate text-left text-[12px] font-bold text-slate-100 hover:text-cyan"
                >
                  {track.title}
                </button>
                <span className="truncate text-[11px] text-slate-300">
                  {track.artist}
                </span>
                <span>{track.analysis?.bpm?.toFixed(0) ?? "—"}</span>
                <span>{track.analysis?.musicalKey ?? "—"}</span>
                <span className="truncate">{track.genre ?? "General"}</span>
                <span>{fmt(track.durationMs / 1000)}</span>
                <span className="flex gap-1">
                  <button
                    title="Favorito"
                    onClick={() => toggleFavorite(track)}
                    className={`rounded px-1 py-1 ${favoriteIds.has(track.id) ? "text-amber-300" : "text-slate-600"}`}
                  >
                    <Star
                      size={11}
                      fill={favoriteIds.has(track.id) ? "currentColor" : "none"}
                    />
                  </button>
                  <button
                    title="Cargar en Deck A"
                    onClick={() => load(track, "A")}
                    className="rounded bg-cyan/15 px-1.5 py-1 font-black text-cyan"
                  >
                    A
                  </button>
                  <button
                    title="Cargar en Deck B"
                    onClick={() => load(track, "B")}
                    className="rounded bg-red-500/15 px-1.5 py-1 font-black text-red-400"
                  >
                    B
                  </button>
                  <button
                    title="Añadir a Cola AutoDJ"
                    onClick={() =>
                      setQueue((q) =>
                        q.some((item) => item.id === track.id)
                          ? q
                          : [...q, track],
                      )
                    }
                    className="rounded bg-lime/10 px-1.5 py-1 font-black text-lime"
                  >
                    +
                  </button>
                  {track.localFile && (
                    <button
                      title={`Eliminar ${track.title} de la música local`}
                      onClick={() => void removeLocalTrack(track)}
                      className="rounded bg-red-500/10 px-1.5 py-1 text-red-400 hover:bg-red-500/25"
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className="h-[120px] border-t border-slate-700 bg-black/35 px-2 py-2">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-black tracking-[.1em] text-slate-200">
              <span>HISTORIAL GENERAL DE REPRODUCCIÓN</span>
              <span className="flex items-center gap-2 font-mono text-[10px] tracking-normal text-slate-300">
                <button
                  disabled={meta.page <= 1}
                  onClick={() => setMeta((m) => ({ ...m, page: m.page - 1 }))}
                  className="rounded border border-slate-700 p-0.5 disabled:opacity-25"
                >
                  <ChevronLeft size={10} />
                </button>
                {meta.page} / {meta.totalPages}
                <button
                  disabled={meta.page >= meta.totalPages}
                  onClick={() => setMeta((m) => ({ ...m, page: m.page + 1 }))}
                  className="rounded border border-slate-700 p-0.5 disabled:opacity-25"
                >
                  <ChevronRight size={10} />
                </button>
              </span>
            </div>
            <section className="rounded border border-slate-700 bg-white/[.02] px-2 py-1">
              {deckPlayHistory.length ? (
                deckPlayHistory.slice(0, 4).map((entry, index) => (
                  <div
                    key={entry.id}
                    className="grid min-h-5 grid-cols-[26px_54px_1fr_auto_auto] items-center gap-2.5 border-t border-white/10 py-1 font-mono text-[11px] first:border-0"
                  >
                    <span className="text-center text-slate-600">
                      {index + 1}
                    </span>
                    <span className="text-[10px] text-slate-300">
                      {entry.playedAt.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="truncate text-[12px] text-white">
                      <b className="font-black">{entry.track.title}</b>
                      <span className="text-[11px] text-slate-300">
                        {" "}
                        — {entry.track.artist}
                      </span>
                    </span>
                    <span className="text-[10px] font-bold text-slate-200">
                      {entry.track.analysis?.musicalKey ?? "—"}
                    </span>
                    <span className="min-w-20 text-right text-[11px] font-black text-lime">
                      {entry.track.analysis?.bpm?.toFixed(1) ?? "—"} BPM
                    </span>
                  </div>
                ))
              ) : (
                <p className="py-5 text-center text-[12px] text-slate-300">
                  Las canciones reproducidas aparecerán aquí
                </p>
              )}
            </section>
          </div>
        </main>
        <aside className="min-h-0 overflow-auto border-l border-slate-700 bg-[#0a0c10] p-2">
          <div className="rounded-lg border border-slate-700 bg-gradient-to-b from-slate-800/60 to-black p-2 shadow-inner">
            <div className="flex items-center">
              <ListMusic size={14} className="text-red-400" />
              <b className="ml-2 text-[12px] tracking-[.1em]">COLA AUTODJ</b>
              <span className="ml-auto rounded-full bg-lime/10 px-2 py-0.5 text-[7px] font-black text-lime">
                {queue.length} EN COLA
              </span>
            </div>
            <button
              type="button"
              disabled={!queue.length || transitioning.current}
              onClick={() => mixQueuedNow(0)}
              className="mt-2 flex w-full items-center gap-2 rounded-md border border-lime/30 bg-lime/10 p-2 text-left disabled:opacity-35"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-lime text-black shadow-[0_0_10px_#84cc16aa]">
                <Play size={12} fill="currentColor" />
              </span>
              <span className="min-w-0 flex-1">
                <small className="block text-[8px] font-black tracking-[.16em] text-lime">
                  SIGUIENTE · MEZCLAR AHORA
                </small>
                <b className="block truncate text-[11px]">
                  {queue[0]?.title ?? "Cola vacía"}
                </b>
                <small className="block truncate text-[9px] text-slate-400">
                  {queue[0]?.artist ?? "Añade canciones desde la biblioteca"}
                </small>
              </span>
            </button>
          </div>
          <div className="mt-2 h-52 space-y-1 overflow-auto pr-1">
            {queue.map((t, i) => (
              <div
                key={`${t.id}-${i}`}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData(
                    "application/x-autodj-queue",
                    String(i),
                  );
                  setQueueDragIndex(i);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = Number(
                    event.dataTransfer.getData("application/x-autodj-queue"),
                  );
                  if (Number.isInteger(from)) reorderQueue(from, i);
                  setQueueDragIndex(null);
                }}
                onDragEnd={() => setQueueDragIndex(null)}
                className={`group flex cursor-grab items-center gap-1.5 rounded-md border p-1.5 text-[10px] active:cursor-grabbing ${queueDragIndex === i ? "scale-[.98] border-cyan/50 bg-cyan/10 opacity-60" : i === 0 ? "border-lime/30 bg-lime/5" : "border-slate-800 bg-white/[.03]"}`}
              >
                <GripVertical size={10} className="shrink-0 text-slate-600" />
                <span
                  className={`grid h-5 w-5 place-items-center rounded font-mono text-[7px] ${i === 0 ? "bg-lime text-black" : "bg-slate-800 text-slate-400"}`}
                >
                  {i + 1}
                </span>
                <Disc3
                  size={13}
                  className={i === 0 ? "text-lime" : "text-slate-500"}
                />
                <span className="min-w-0 flex-1 truncate">
                  <b className="block">{t.title}</b>
                  <small className="text-[9px] text-slate-400">
                    {t.artist} · {t.analysis?.bpm?.toFixed(0) ?? "—"} BPM
                  </small>
                </span>
                {i === 0 && (
                  <button
                    type="button"
                    title="Mezclar ahora"
                    onClick={() => mixQueuedNow(i)}
                    className="rounded p-1 text-lime hover:bg-lime/10"
                  >
                    <Play size={10} fill="currentColor" />
                  </button>
                )}
                <span className="grid gap-px">
                  <button
                    type="button"
                    title="Subir"
                    disabled={i === 0}
                    onClick={() => moveQueue(i, -1)}
                    className="text-slate-500 hover:text-white disabled:opacity-20"
                  >
                    <ChevronUp size={9} />
                  </button>
                  <button
                    type="button"
                    title="Bajar"
                    disabled={i === queue.length - 1}
                    onClick={() => moveQueue(i, 1)}
                    className="text-slate-500 hover:text-white disabled:opacity-20"
                  >
                    <ChevronDown size={9} />
                  </button>
                </span>
                <button
                  type="button"
                  title={`Eliminar ${t.title} de la cola`}
                  aria-label={`Eliminar ${t.title} de la cola`}
                  onClick={() =>
                    commitQueue(
                      queueRef.current.filter((_, index) => index !== i),
                    )
                  }
                  className="rounded p-1 text-slate-500 transition hover:bg-red-500/15 hover:text-red-400"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
            {!queue.length && (
              <p className="py-8 text-center text-[10px] text-slate-500">
                Selecciona pistas y añádelas a AutoDJ
              </p>
            )}
          </div>
          <button
            onClick={() => tracks[0] && setQueue((q) => [...q, tracks[0]])}
            className="dj-button mt-1 w-full py-1.5 text-[10px] font-bold"
          >
            + AÑADIR CANCIÓN
          </button>
          <div className="mt-2 rounded border border-slate-700 p-2">
            <div className="flex items-center gap-1.5">
              <Megaphone size={12} className="text-fuchsia-300" />
              <b className="text-[9px] tracking-wide">JINGLES / CUÑAS</b>
              <span className="ml-auto text-[7px] text-slate-500">
                Se emiten al cerrar cada transición
              </span>
            </div>
            <div className="mt-2 grid grid-cols-[1fr_54px] gap-1">
              <input
                value={jingleName}
                onChange={(event) => setJingleName(event.target.value)}
                placeholder="Nombre de la cuña"
                className="min-w-0 rounded border border-slate-700 bg-black px-1.5 py-1 text-[9px] outline-none focus:border-fuchsia-400"
              />
              <label className="text-[7px] text-slate-500">
                MIN
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={jingleInterval}
                  onChange={(event) =>
                    setJingleInterval(
                      Math.max(1, Math.min(240, Number(event.target.value))),
                    )
                  }
                  className="mt-0.5 w-full rounded border border-slate-700 bg-black p-1 text-[9px] outline-none focus:border-fuchsia-400"
                />
              </label>
            </div>
            <label className="mt-1.5 block text-[7px] text-slate-500">
              DUCKING MUSICAL {Math.round(jingleDuck * 100)}%
              <input
                aria-label="Nivel de ducking de la cuña"
                type="range"
                min={10}
                max={80}
                value={jingleDuck * 100}
                onChange={(event) =>
                  setJingleDuck(Number(event.target.value) / 100)
                }
                className="mt-1 w-full accent-fuchsia-400"
              />
            </label>
            <label className="mt-1.5 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded border border-fuchsia-500/40 bg-fuchsia-500/10 py-1.5 text-[9px] font-black text-fuchsia-300 hover:bg-fuchsia-500/20">
              <Upload size={11} /> SUBIR CUÑA
              <input
                type="file"
                accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void addJingleFile(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <div className="mt-2 space-y-1">
              {jingles.map((jingle) => (
                <div
                  key={jingle.id}
                  className="flex items-center gap-1.5 rounded bg-black/30 p-1.5 text-[9px]"
                >
                  <button
                    type="button"
                    title={jingle.enabled ? "Pausar programación" : "Activar programación"}
                    onClick={() => void toggleJingleEnabled(jingle)}
                    className={jingle.enabled ? "text-lime" : "text-slate-600"}
                  >
                    <Circle size={7} fill="currentColor" />
                  </button>
                  <span className="min-w-0 flex-1 truncate">
                    <b className="block truncate">{jingle.name}</b>
                    <small className="text-[8px] text-slate-500">
                      Cada {jingle.intervalMinutes} min · próxima{" "}
                      {new Date(jingle.nextAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </small>
                  </span>
                  <button
                    type="button"
                    disabled={jinglePlaying}
                    onClick={() => void playJingleNow(jingle)}
                    className="rounded border border-fuchsia-500/30 px-1.5 py-1 font-black text-fuchsia-300 disabled:opacity-30"
                  >
                    EMITIR
                  </button>
                  <button
                    type="button"
                    title={`Eliminar ${jingle.name}`}
                    onClick={() => void removeJingle(jingle)}
                    className="text-slate-600 hover:text-red-400"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
              {!jingles.length && (
                <p className="py-2 text-center text-[9px] text-slate-600">
                  Sin cuñas programadas
                </p>
              )}
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1 text-[7px]">
            <span className="dj-button flex items-center justify-center gap-1 py-1 text-slate-400">
              <span
                className={`led ${decks.A.playing || decks.B.playing ? "bg-lime" : "bg-slate-700"}`}
              />
              {decks.A.playing || decks.B.playing ? "AL AIRE" : "EN ESPERA"}
            </span>
            <span className="dj-button flex items-center justify-center gap-1 py-1 text-slate-400">
              <span
                className={`led ${jinglePlaying ? "bg-fuchsia-400" : "bg-slate-700"}`}
              />
              {jinglePlaying ? "CUÑA AL AIRE" : "MIC STANDBY"}
            </span>
          </div>
        </aside>
      </section>
      {padModal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-6 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPadModal(null);
          }}
        >
          <section className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-600 bg-[#0d1117] shadow-[0_24px_80px_#000]">
            <header className="flex items-center border-b border-slate-700 bg-gradient-to-b from-slate-700/40 to-black px-4 py-3">
              <span
                className={`performance-pad performance-pad-${padModal.kind} mr-3 max-w-24 is-loaded`}
              >
                <b>
                  {performancePads.find((pad) => pad.kind === padModal.kind)
                    ?.label ?? padModal.kind}
                </b>
              </span>
              <div>
                <b className="text-sm tracking-wider">BIBLIOTECA DE PADS</b>
                <small className="block text-[9px] text-slate-400">
                  Disco {padModal.deck} · contenido persistente
                </small>
              </div>
              <button
                type="button"
                onClick={() => setPadModal(null)}
                className="ml-auto grid h-8 w-8 place-items-center rounded border border-slate-600 text-lg text-slate-300 hover:border-white"
              >
                ×
              </button>
            </header>
            <div className="max-h-[55vh] space-y-2 overflow-auto p-4">
              {padSamples
                .filter(
                  (sample) =>
                    sample.deck === padModal.deck &&
                    sample.kind === padModal.kind,
                )
                .map((sample, index) => (
                  <div
                    key={sample.id}
                    className="flex items-center gap-3 rounded-lg border border-slate-700 bg-white/[.03] p-2.5"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded bg-slate-800 font-mono text-xs text-slate-400">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[12px] text-slate-100">
                        {sample.name}
                      </b>
                      <small className="text-[9px] text-slate-500">
                        {(sample.file.size / 1024 / 1024).toFixed(1)} MB
                      </small>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void triggerPerformancePad(
                          padModal.deck,
                          padModal.kind,
                          sample,
                        )
                      }
                      className="rounded-md border border-lime/40 bg-lime/10 px-3 py-2 text-[9px] font-black text-lime hover:bg-lime/20"
                    >
                      ▶ PLAY
                    </button>
                    <button
                      type="button"
                      title={`Eliminar ${sample.name}`}
                      onClick={() => void removePerformancePad(sample)}
                      className="grid h-8 w-8 place-items-center rounded-md border border-red-500/40 bg-red-500/10 text-lg font-black text-red-400 hover:bg-red-500/25"
                    >
                      −
                    </button>
                  </div>
                ))}
              {!padSamples.some(
                (sample) =>
                  sample.deck === padModal.deck &&
                  sample.kind === padModal.kind,
              ) && (
                <p className="py-8 text-center text-[11px] text-slate-500">
                  No hay audios importados en esta categoría.
                </p>
              )}
            </div>
            <footer className="flex items-center border-t border-slate-700 bg-black/30 p-3">
              <small className="text-[9px] text-slate-500">
                Los archivos permanecen guardados después de recargar la página.
              </small>
              <label className="ml-auto cursor-pointer rounded-md border border-cyan/50 bg-cyan/10 px-4 py-2 text-[10px] font-black text-cyan hover:bg-cyan/20">
                + IMPORTAR AUDIO
                <input
                  type="file"
                  multiple
                  accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac"
                  className="hidden"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    for (const file of files)
                      void assignPerformancePad(
                        padModal.deck,
                        padModal.kind,
                        file,
                      );
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </footer>
          </section>
        </div>
      )}
      <footer className="flex h-7 items-center border-t border-slate-700 px-3 text-[8px] text-slate-500">
        <span className={engineReady ? "text-lime" : "text-amber-400"}>
          ● {engineReady ? "AI DJ ENGINE ONLINE" : "AI DJ ENGINE INICIANDO"}
        </span>
        <span className="mx-auto">{notice}</span>
        <span>
          Disco {active} activo · Crossfader {crossfade}% ·{" "}
          {jinglePlaying ? "Cuña al aire" : `${jingles.length} cuña(s) programada(s)`}
        </span>
      </footer>
    </div>
  );
}
