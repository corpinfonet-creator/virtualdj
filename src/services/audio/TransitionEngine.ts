export type TransitionDeckId = "A" | "B";

/** Familia rítmica usada para adaptar el carácter de la mezcla (duración de
 * filtros, balance echo/reverb) al género detectado. */
export type TransitionGenreFamily =
  "cumbia" | "rock" | "dembow" | "electronic" | "latin" | "neutral";

export type TransitionState =
  | "IDLE"
  | "ANALYZING"
  | "PREPARING"
  | "SYNCING"
  | "INTRODUCING"
  | "BASS_SWAP"
  | "EXITING"
  | "COMPLETE"
  | "ERROR";

export interface BeatGrid {
  bpm: number;
  firstBeatTime: number;
  beatDuration: number;
  beats: number[];
  downbeats: number[];
  confidence: number;
}

export interface TransitionTrackAnalysis {
  bpm: number;
  bpmConfidence?: number;
  key?: string;
  energy?: number;
  beatGrid?: Partial<BeatGrid> & {
    firstBeatMs?: number;
    beatIntervalMs?: number;
    beatsMs?: number[];
    downbeatsMs?: number[];
  };
  /** Fin de intro detectado por el análisis, en segundos. */
  introEndSeconds?: number;
}

export interface TransitionPlan {
  startTime: number;
  bassSwapTime: number;
  endTime: number;
  sourceDeck: TransitionDeckId;
  targetDeck: TransitionDeckId;
  sourceBpm: number;
  targetBpm: number;
  syncBpm: number;
  beatDuration: number;
  introBeats: number;
  outroBeats: number;
  bassSwapDuration: number;
  targetStartTime: number;
  confidence: number;
  fallback: boolean;
  nextDownbeat: number;
  nextPhrase: number;
  genreFamily: TransitionGenreFamily;
}

export interface TransitionDebug extends TransitionPlan {
  state: TransitionState;
  bassA: number;
  bassB: number;
  beatSync: boolean;
  downbeatSync: boolean;
  phraseSync: boolean;
  bassSwapArmed: boolean;
  message?: string;
}

export interface TransitionConfig {
  lowCutDb: number;
  lowShelfFrequency: number;
  phraseBars: 4 | 8 | 16;
  introBars: number;
  outroBars: number;
  swapBeatFraction: number;
  minSwapSeconds: number;
  maxSwapSeconds: number;
  confidenceThreshold: number;
  transitionHeadroom: number;
  /** Frecuencia mínima (Hz) del filtro de color al cerrar la salida en el swap. */
  filterSweepLowHz: number;
  /** Frecuencia mínima (Hz) del filtro de la entrante justo tras el swap. */
  filterOpenStartHz: number;
  /** Nivel pico del retorno de echo durante el "echo out" de salida. */
  echoOutPeak: number;
  /** Duración de la cola de echo tras el final del outro, en beats. */
  echoTailBeats: number;
  /** Nivel pico del retorno de reverb durante el cierre de la salida. */
  reverbOutPeak: number;
  /** Duración de la cola de reverb tras el final del outro, en beats. */
  reverbTailBeats: number;
  /** Fracción (0-1) de la ventana intro→swap en la que el crossfade sigue
   * casi plano mientras el filtro ya se está moviendo solo. */
  filterLeadFraction: number;
}

/** Ajustes de carácter por familia rítmica: qué tan largo es el barrido de
 * filtro, cuánto domina el echo frente al reverb, y qué tan agresivo es el
 * hot cue de entrada. BPM altos (electrónica/dembow) piden barridos cortos
 * y precisos; BPM bajos (cumbia/rock) piden barridos largos y más reverb. */
export interface TransitionGenreProfile {
  /** Multiplicador sobre filterLeadFraction (barrido de filtro más largo o corto). */
  filterLeadMultiplier: number;
  /** Balance echo vs reverb en la salida: 0 = solo reverb, 1 = solo echo. */
  echoReverbBalance: number;
  /** Multiplicador sobre la duración del bass swap. */
  bassSwapMultiplier: number;
}

export const GENRE_TRANSITION_PROFILES: Record<
  TransitionGenreFamily,
  TransitionGenreProfile
> = {
  cumbia: {
    filterLeadMultiplier: 1.35,
    echoReverbBalance: 0.35,
    bassSwapMultiplier: 1.15,
  },
  rock: {
    filterLeadMultiplier: 1.25,
    echoReverbBalance: 0.3,
    bassSwapMultiplier: 1.1,
  },
  latin: {
    filterLeadMultiplier: 1.2,
    echoReverbBalance: 0.4,
    bassSwapMultiplier: 1.05,
  },
  electronic: {
    filterLeadMultiplier: 0.85,
    echoReverbBalance: 0.7,
    bassSwapMultiplier: 0.9,
  },
  dembow: {
    filterLeadMultiplier: 0.8,
    echoReverbBalance: 0.65,
    bassSwapMultiplier: 0.85,
  },
  neutral: {
    filterLeadMultiplier: 1,
    echoReverbBalance: 0.5,
    bassSwapMultiplier: 1,
  },
};

export const DEFAULT_TRANSITION_CONFIG: TransitionConfig = {
  lowCutDb: -24,
  lowShelfFrequency: 150,
  phraseBars: 8,
  introBars: 8,
  outroBars: 8,
  swapBeatFraction: 0.25,
  minSwapSeconds: 0.1,
  maxSwapSeconds: 0.4,
  confidenceThreshold: 0.35,
  transitionHeadroom: 0.72,
  filterSweepLowHz: 120,
  filterOpenStartHz: 90,
  echoOutPeak: 0.32,
  echoTailBeats: 2,
  reverbOutPeak: 0.28,
  reverbTailBeats: 3,
  filterLeadFraction: 0.85,
};

type ScheduledDeck = {
  fade: AudioParam;
  low: AudioParam;
  mid: AudioParam;
  high: AudioParam;
  /** Filtro de color del canal (mismo nodo que el Filter knob manual). */
  filter?: BiquadFilterNode;
  /** Envío del canal al bus de Beat FX (echo/reverb). */
  fxSend?: AudioParam;
};

export interface TransitionFxBus {
  /** Nivel de retorno del echo compartido; se abre solo durante el "echo out". */
  delayWet: AudioParam;
  /** Nivel de retorno del reverb compartido; realza la cola de salida. */
  reverbWet: AudioParam;
}

export interface ExecuteTransitionOptions {
  plan: TransitionPlan;
  source: ScheduledDeck;
  target: ScheduledDeck;
  fxBus?: TransitionFxBus;
  playTarget: () => Promise<void>;
  stopSource: () => void;
  onDebug?: (debug: TransitionDebug) => void;
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function gridSeconds(
  analysis: TransitionTrackAnalysis | undefined,
  fallbackBpm: number,
): BeatGrid {
  const raw = analysis?.beatGrid;
  const bpm = Math.max(40, Math.min(240, analysis?.bpm || fallbackBpm));
  const beatDuration =
    raw?.beatDuration ?? (raw?.beatIntervalMs ?? 60000 / bpm) / 1000;
  return {
    bpm,
    firstBeatTime: raw?.firstBeatTime ?? (raw?.firstBeatMs ?? 0) / 1000,
    beatDuration,
    beats: raw?.beats ?? (raw?.beatsMs ?? []).map((time) => time / 1000),
    downbeats:
      raw?.downbeats ?? (raw?.downbeatsMs ?? []).map((time) => time / 1000),
    confidence: Math.max(
      0,
      Math.min(1, raw?.confidence ?? analysis?.bpmConfidence ?? 0),
    ),
  };
}

export class TransitionEngine {
  private cancelled = false;
  private timers = new Set<number>();

  constructor(
    private context: AudioContext,
    private config: TransitionConfig = DEFAULT_TRANSITION_CONFIG,
  ) {}

  updateConfig(config: Partial<TransitionConfig>) {
    this.config = { ...this.config, ...config };
  }

  getNextBeat(position: number, grid: BeatGrid) {
    const index = Math.ceil(
      (position - grid.firstBeatTime - 0.001) / grid.beatDuration,
    );
    return grid.firstBeatTime + Math.max(0, index) * grid.beatDuration;
  }

  getNextDownbeat(position: number, grid: BeatGrid) {
    const explicit = grid.downbeats.find((time) => time >= position - 0.001);
    if (explicit !== undefined) return explicit;
    const bar = grid.beatDuration * 4;
    return (
      grid.firstBeatTime +
      Math.ceil((position - grid.firstBeatTime - 0.001) / bar) * bar
    );
  }

  getNextBar(position: number, grid: BeatGrid) {
    return this.getNextDownbeat(position, grid);
  }

  getNextPhrase(
    position: number,
    grid: BeatGrid,
    bars = this.config.phraseBars,
  ) {
    const phrase = grid.beatDuration * 4 * bars;
    const downbeat = this.getNextDownbeat(position, grid);
    const anchor = grid.downbeats[0] ?? grid.firstBeatTime;
    return downbeat + positiveModulo(anchor - downbeat, phrase);
  }

  prepareTransition(input: {
    sourceDeck: TransitionDeckId;
    targetDeck: TransitionDeckId;
    sourcePosition: number;
    targetPosition: number;
    sourceBpm: number;
    targetBpm: number;
    sourceAnalysis?: TransitionTrackAnalysis;
    targetAnalysis?: TransitionTrackAnalysis;
    /** Hot Cue guardado en el deck entrante, si el operador marcó uno. */
    targetHotCue?: number;
    /** Familia rítmica detectada (por género) para adaptar el carácter de la mezcla. */
    genreFamily?: TransitionGenreFamily;
  }): TransitionPlan {
    const genreFamily = input.genreFamily ?? "neutral";
    const genreProfile = GENRE_TRANSITION_PROFILES[genreFamily];
    const sourceGrid = gridSeconds(input.sourceAnalysis, input.sourceBpm);
    const targetGrid = gridSeconds(input.targetAnalysis, input.targetBpm);
    const confidence = Math.min(sourceGrid.confidence, targetGrid.confidence);
    const fallback = confidence < this.config.confidenceThreshold;
    const nextDownbeat = this.getNextDownbeat(input.sourcePosition, sourceGrid);
    const nextPhrase = this.getNextPhrase(input.sourcePosition, sourceGrid);
    const musicalPoint = fallback ? nextDownbeat : nextPhrase;
    const waitSeconds = Math.max(0.08, musicalPoint - input.sourcePosition);
    const beatDuration = 60 / sourceGrid.bpm;
    const startTime = this.context.currentTime + Math.max(0.05, waitSeconds);
    // Aun en modo fallback (beatgrid poco confiable) la mezcla debe seguir
    // siendo gradual — se usa la mitad de la ventana configurada en vez de
    // colapsar a un solo compás, que es lo que sonaba como un corte brusco.
    const introBeats = fallback
      ? this.config.introBars * 2
      : this.config.introBars * 4;
    const bassSwapTime = startTime + introBeats * beatDuration;
    const outroBeats = fallback
      ? this.config.outroBars * 2
      : this.config.outroBars * 4;
    const endTime = bassSwapTime + outroBeats * beatDuration;
    const bassSwapDuration = Math.max(
      this.config.minSwapSeconds,
      Math.min(
        this.config.maxSwapSeconds,
        beatDuration *
          this.config.swapBeatFraction *
          genreProfile.bassSwapMultiplier,
      ),
    );
    // Si el operador ya marcó un Hot Cue en la pista entrante (el drop, el
    // hook), la mezcla arranca ahí en vez del primer downbeat crudo —
    // ajustado al downbeat más cercano para no romper el beatgrid.
    const preferredTargetPosition =
      input.targetHotCue !== undefined && input.targetHotCue >= 0
        ? input.targetHotCue
        : input.targetPosition;
    const targetDownbeat = this.getNextDownbeat(
      preferredTargetPosition,
      targetGrid,
    );
    return {
      startTime,
      bassSwapTime,
      endTime,
      sourceDeck: input.sourceDeck,
      targetDeck: input.targetDeck,
      sourceBpm: sourceGrid.bpm,
      targetBpm: targetGrid.bpm,
      syncBpm: sourceGrid.bpm,
      beatDuration,
      introBeats,
      outroBeats,
      bassSwapDuration,
      targetStartTime: Math.max(0, targetDownbeat),
      confidence,
      fallback,
      nextDownbeat,
      nextPhrase,
      genreFamily,
    };
  }

  private emitAt(time: number, callback: () => void) {
    const timer = window.setTimeout(
      () => {
        this.timers.delete(timer);
        if (!this.cancelled) callback();
      },
      Math.max(0, time - this.context.currentTime) * 1000,
    );
    this.timers.add(timer);
  }

  async executeTransition(options: ExecuteTransitionOptions) {
    this.cancelTransition();
    this.cancelled = false;
    const { plan, source, target, fxBus, onDebug } = options;
    const base = (state: TransitionState, bassA: number, bassB: number) => ({
      ...plan,
      state,
      bassA,
      bassB,
      beatSync: true,
      downbeatSync: true,
      phraseSync: !plan.fallback,
      bassSwapArmed: state !== "COMPLETE" && state !== "ERROR",
    });
    onDebug?.(
      base(
        "PREPARING",
        plan.sourceDeck === "A" ? 1 : 0.08,
        plan.sourceDeck === "B" ? 1 : 0.08,
      ),
    );

    const now = this.context.currentTime;
    for (const param of [source.fade, target.fade, source.low, target.low])
      param.cancelScheduledValues(now);

    const start = Math.max(now + 0.03, plan.startTime);
    const swap = Math.max(start + plan.beatDuration, plan.bassSwapTime);
    const end = Math.max(swap + plan.beatDuration, plan.endTime);
    const headroom = this.config.transitionHeadroom;
    const lowCut = this.config.lowCutDb;
    const sourceLow = source.low.value;
    const targetLow = target.low.value;
    const originalDelayWet = fxBus?.delayWet.value ?? 0;
    const originalSourceFxSend = source.fxSend?.value ?? 1;

    const genreProfile = GENRE_TRANSITION_PROFILES[plan.genreFamily];

    source.fade.setValueAtTime(Math.min(1, source.fade.value || 1), now);
    target.fade.setValueAtTime(0.0001, now);
    target.low.setValueAtTime(lowCut, now);
    source.low.setValueAtTime(sourceLow, now);

    // Coreografía en capas, como un DJ real: el filtro de color LIDERA la
    // mezcla — arranca su barrido lento desde el primer instante de la
    // ventana ("start"), igual que un DJ que primero prepara el filtro con
    // la mano — y el crossfade recién gana pendiente perceptible una vez
    // que el filtro ya avanzó una buena fracción de su recorrido. Antes de
    // ese punto el crossfade permanece casi plano (silencio/nivel bajo en
    // target), así el cambio de "color" se escucha antes que el cambio de
    // volumen, en vez de que ambos se muevan a la par.
    const sweepLow = this.config.filterSweepLowHz;
    const openStart = this.config.filterOpenStartHz;
    const echoTail = plan.beatDuration * this.config.echoTailBeats;
    const reverbTail = plan.beatDuration * this.config.reverbTailBeats;
    const filterSweepStart = start;
    const filterLeadFraction = Math.max(
      0.1,
      Math.min(
        0.95,
        this.config.filterLeadFraction * genreProfile.filterLeadMultiplier,
      ),
    );
    const crossfadeStart = start + (swap - start) * filterLeadFraction;
    const filterOpenEnd = Math.min(end, swap + plan.bassSwapDuration * 3);

    // Crossfade: casi plano hasta crossfadeStart (el filtro ya lideró ese
    // tramo), luego sube de silencio a nivel pleno a lo largo del resto de
    // la ventana intro+outro. Source acompaña simétricamente.
    target.fade.setValueAtTime(0.0001, crossfadeStart);
    target.fade.linearRampToValueAtTime(headroom, swap);
    target.fade.linearRampToValueAtTime(1, end);
    source.fade.setValueAtTime(
      Math.min(1, source.fade.value || 1),
      crossfadeStart,
    );
    source.fade.linearRampToValueAtTime(headroom, swap);
    source.fade.linearRampToValueAtTime(0.0001, end);

    // The low shelves exchange authority only around the downbeat. Their
    // ramps are short, independent from the much longer volume blend.
    source.low.setValueAtTime(sourceLow, swap);
    target.low.setValueAtTime(lowCut, swap);
    source.low.linearRampToValueAtTime(lowCut, swap + plan.bassSwapDuration);
    target.low.linearRampToValueAtTime(targetLow, swap + plan.bassSwapDuration);

    if (source.filter) {
      source.filter.type = "lowpass";
      source.filter.frequency.cancelScheduledValues(now);
      source.filter.frequency.setValueAtTime(20000, filterSweepStart);
      source.filter.frequency.linearRampToValueAtTime(sweepLow, swap);
      source.filter.frequency.setValueAtTime(
        sweepLow,
        swap + plan.bassSwapDuration,
      );
      source.filter.frequency.linearRampToValueAtTime(20000, end + 0.05);
    }
    if (target.filter) {
      // Simétrico al sweep de la saliente: la entrante también barre desde
      // el inicio de la ventana, cerrada en highpass, y se abre del todo
      // recién tras el bass swap — así su llegada suena tan gradual como la
      // salida de la otra pista, y lidera al crossfade igual que la fuente.
      target.filter.type = "highpass";
      target.filter.frequency.cancelScheduledValues(now);
      target.filter.frequency.setValueAtTime(20, filterSweepStart);
      target.filter.frequency.linearRampToValueAtTime(openStart, swap);
      target.filter.frequency.linearRampToValueAtTime(20, filterOpenEnd);
    }
    // Beat FX de salida: el envío de la pista saliente al bus se abre en el
    // tramo final, repartido entre echo y reverb según la familia de
    // género (echoReverbBalance: 1 = todo echo, 0 = todo reverb). Géneros
    // de BPM alto (electrónica/dembow) favorecen echo rítmico; los de BPM
    // más bajo (cumbia/rock/latin) favorecen reverb, más orgánico y menos
    // "picado", para una cola de salida de nivel profesional.
    const echoLeadIn = Math.min(end - swap, plan.beatDuration * 4);
    const echoStart = end - echoLeadIn;
    if (source.fxSend && fxBus) {
      source.fxSend.cancelScheduledValues(now);
      source.fxSend.setValueAtTime(originalSourceFxSend, echoStart);
      source.fxSend.linearRampToValueAtTime(1, end);

      const originalReverbWet = fxBus.reverbWet.value;
      const echoPeak =
        Math.max(this.config.echoOutPeak, originalDelayWet) *
        genreProfile.echoReverbBalance;
      const reverbPeak =
        Math.max(this.config.reverbOutPeak, originalReverbWet) *
        (1 - genreProfile.echoReverbBalance);

      fxBus.delayWet.cancelScheduledValues(now);
      fxBus.delayWet.setValueAtTime(originalDelayWet, echoStart);
      fxBus.delayWet.linearRampToValueAtTime(echoPeak, end);
      fxBus.delayWet.linearRampToValueAtTime(originalDelayWet, end + echoTail);

      fxBus.reverbWet.cancelScheduledValues(now);
      fxBus.reverbWet.setValueAtTime(originalReverbWet, echoStart);
      fxBus.reverbWet.linearRampToValueAtTime(reverbPeak, end);
      fxBus.reverbWet.linearRampToValueAtTime(
        originalReverbWet,
        end + reverbTail,
      );

      source.fxSend.setValueAtTime(1, end);
      source.fxSend.linearRampToValueAtTime(
        originalSourceFxSend,
        end + Math.max(echoTail, reverbTail),
      );
    }

    this.emitAt(start, () =>
      onDebug?.(
        base(
          "INTRODUCING",
          plan.sourceDeck === "A" ? 1 : 0.08,
          plan.sourceDeck === "B" ? 1 : 0.08,
        ),
      ),
    );
    this.emitAt(swap, () =>
      onDebug?.(
        base(
          "BASS_SWAP",
          plan.targetDeck === "A" ? 0.08 : 1,
          plan.targetDeck === "B" ? 0.08 : 1,
        ),
      ),
    );
    this.emitAt(swap + plan.bassSwapDuration, () =>
      onDebug?.(
        base(
          "EXITING",
          plan.targetDeck === "A" ? 1 : 0.08,
          plan.targetDeck === "B" ? 1 : 0.08,
        ),
      ),
    );

    // HTMLMediaElement has no sample-accurate start method. Its transport is
    // armed at the phrase boundary, while every audible gain/EQ event remains
    // scheduled sample-accurately on the AudioContext clock.
    await new Promise<void>((resolve) => this.emitAt(start, resolve));
    if (this.cancelled) throw new Error("Transición cancelada");
    await options.playTarget();
    await new Promise<void>((resolve) => this.emitAt(end + 0.03, resolve));
    if (this.cancelled) throw new Error("Transición cancelada");
    options.stopSource();
    source.fade.cancelScheduledValues(this.context.currentTime);
    source.fade.setValueAtTime(0, this.context.currentTime);
    target.fade.cancelScheduledValues(this.context.currentTime);
    target.fade.setValueAtTime(1, this.context.currentTime);
    source.low.cancelScheduledValues(this.context.currentTime);
    target.low.cancelScheduledValues(this.context.currentTime);
    source.low.setValueAtTime(sourceLow, this.context.currentTime);
    target.low.setValueAtTime(targetLow, this.context.currentTime);
    // El envío de echo sigue su propia rampa ya programada (la cola del
    // echo de salida) y se deja correr sin cortarla. El filtro, en cambio,
    // ya no tiene audio detrás en ninguno de los dos decks en este punto
    // (source está pausado, target ya cruzó su apertura) así que se
    // reconcilia a neutro de inmediato para que el knob no quede "pegado".
    if (source.filter) {
      source.filter.frequency.cancelScheduledValues(this.context.currentTime);
      source.filter.type = "allpass";
      source.filter.frequency.setValueAtTime(20000, this.context.currentTime);
    }
    if (target.filter) {
      target.filter.frequency.cancelScheduledValues(this.context.currentTime);
      target.filter.type = "allpass";
      target.filter.frequency.setValueAtTime(20000, this.context.currentTime);
    }
    onDebug?.({
      ...base(
        "COMPLETE",
        plan.targetDeck === "A" ? 1 : 0,
        plan.targetDeck === "B" ? 1 : 0,
      ),
      bassSwapArmed: false,
    });
  }

  cancelTransition() {
    this.cancelled = true;
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
  }
}
