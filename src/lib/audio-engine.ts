import {
  DEFAULT_TRANSITION_CONFIG,
  TransitionEngine,
  type TransitionDebug,
  type TransitionGenreFamily,
  type TransitionTrackAnalysis,
} from "@/services/audio/TransitionEngine";

export type DeckId = "A" | "B";
export type DeckSnapshot = {
  ready: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  playbackRate: number;
  peak: number;
  name?: string;
  error?: string;
};
export type DeckWaveform = {
  samples: number[];
  currentTime: number;
  duration: number;
  buffered: number;
  playing: boolean;
};
export type AudioAnalysisResult = {
  bpm: number;
  bpmConfidence: number;
  energy: number;
  loudnessLufs: number;
  cueInMs: number;
  transitionOutMs: number;
  segments: Array<{
    startMs: number;
    endMs: number;
    energy: number;
    vocalProbability: number;
  }>;
};

type InternalDeck = {
  element: HTMLAudioElement;
  fadeGain: GainNode;
  trimGain: GainNode;
  channelGain: GainNode;
  lowEq: BiquadFilterNode;
  midEq: BiquadFilterNode;
  highEq: BiquadFilterNode;
  colorFilter: BiquadFilterNode;
  analyser: AnalyserNode;
  meterData: Uint8Array<ArrayBuffer>;
  source: MediaElementAudioSourceNode;
  splitter: ChannelSplitterNode;
  merger: ChannelMergerNode;
  invertRight: GainNode;
  dryGain: GainNode;
  karaokeGain: GainNode;
  fxSend: GainNode;
  stallTimer?: number;
  url?: string;
  name?: string;
  error?: string;
  loopStart?: number;
  loopEnd?: number;
  hotCues: Partial<Record<HotCueSlot, number>>;
  slipEnabled: boolean;
  /** Ancla del groove real mientras dura un desvío temporal (loop/hot cue/scratch). */
  slipAnchor?: { audioTime: number; contextTime: number };
};
export type HotCueSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export class BrowserAudioEngine {
  private context: AudioContext;
  private compressor: DynamicsCompressorNode;
  private master: GainNode;
  private musicBus: GainNode;
  private jingleElement: HTMLAudioElement;
  private jingleGain: GainNode;
  private jingleUrl?: string;
  private performanceBus: GainNode;
  private performanceCache = new Map<string, AudioBuffer>();
  private decks: Record<DeckId, InternalDeck>;
  private transitionTimer?: number;
  private smartMixCount = 0;
  private analysisCache = new Map<string, AudioAnalysisResult>();
  private transitionEngine: TransitionEngine;
  private fxReturn!: GainNode;
  private delayNode!: DelayNode;
  private delayFeedback!: GainNode;
  private delayWet!: GainNode;
  private reverbNode!: ConvolverNode;
  private reverbWet!: GainNode;

  constructor(
    private onChange: () => void,
    private onFailure: (deck: DeckId, message: string) => void,
    private onTransitionDebug?: (debug: TransitionDebug) => void,
  ) {
    this.context = new AudioContext({ latencyHint: "playback" });
    this.master = this.context.createGain();
    this.musicBus = this.context.createGain();
    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.value = -3;
    this.compressor.knee.value = 6;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;
    this.musicBus.connect(this.master);
    this.master.connect(this.compressor).connect(this.context.destination);
    this.jingleElement = new Audio();
    this.jingleElement.preload = "auto";
    const jingleSource = this.context.createMediaElementSource(
      this.jingleElement,
    );
    this.jingleGain = this.context.createGain();
    jingleSource.connect(this.jingleGain).connect(this.master);
    this.performanceBus = this.context.createGain();
    this.performanceBus.gain.value = 0.68;
    this.performanceBus.connect(this.master);
    this.fxReturn = this.context.createGain();
    this.fxReturn.connect(this.master);
    this.delayNode = this.context.createDelay(2);
    this.delayNode.delayTime.value = 0.25;
    this.delayFeedback = this.context.createGain();
    this.delayFeedback.gain.value = 0.35;
    this.delayWet = this.context.createGain();
    this.delayWet.gain.value = 0;
    this.delayNode.connect(this.delayFeedback).connect(this.delayNode);
    this.delayNode.connect(this.delayWet).connect(this.fxReturn);
    this.reverbNode = this.context.createConvolver();
    this.reverbNode.buffer = this.buildImpulseResponse(2.4, 2.2);
    this.reverbWet = this.context.createGain();
    this.reverbWet.gain.value = 0;
    this.reverbNode.connect(this.reverbWet).connect(this.fxReturn);
    this.decks = { A: this.createDeck("A"), B: this.createDeck("B") };
    this.transitionEngine = new TransitionEngine(this.context);
    this.setCrossfader(0);
  }

  private buildImpulseResponse(duration: number, decay: number) {
    const rate = this.context.sampleRate;
    const length = Math.max(1, Math.floor(rate * duration));
    const impulse = this.context.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1)
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
    return impulse;
  }

  private createDeck(id: DeckId): InternalDeck {
    const element = new Audio();
    element.preload = "auto";
    element.preservesPitch = true;
    const source = this.context.createMediaElementSource(element);
    const trimGain = this.context.createGain();
    const channelGain = this.context.createGain();
    const lowEq = this.context.createBiquadFilter();
    lowEq.type = "lowshelf";
    lowEq.frequency.value = DEFAULT_TRANSITION_CONFIG.lowShelfFrequency;
    const midEq = this.context.createBiquadFilter();
    midEq.type = "peaking";
    midEq.frequency.value = 1000;
    midEq.Q.value = 0.8;
    const highEq = this.context.createBiquadFilter();
    highEq.type = "highshelf";
    highEq.frequency.value = 4000;
    const colorFilter = this.context.createBiquadFilter();
    colorFilter.type = "allpass";
    colorFilter.frequency.value = 20000;
    colorFilter.Q.value = 0.7;
    const fadeGain = this.context.createGain();
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 256;
    const meterData = new Uint8Array(analyser.frequencyBinCount);
    // Karaoke: L-R en ambos canales de salida cancela el contenido centrado
    // (voz, bajo) y conserva lo panoramizado; se mezcla con la señal seca.
    const splitter = this.context.createChannelSplitter(2);
    const merger = this.context.createChannelMerger(2);
    const invertRight = this.context.createGain();
    invertRight.gain.value = -1;
    const dryGain = this.context.createGain();
    const karaokeGain = this.context.createGain();
    karaokeGain.gain.value = 0;
    source.connect(splitter);
    splitter.connect(merger, 0, 0);
    splitter.connect(invertRight);
    invertRight.connect(merger, 0, 1);
    splitter.connect(merger, 1, 1);
    source.connect(dryGain);
    merger.connect(karaokeGain);
    const fxSend = this.context.createGain();
    fxSend.gain.value = 1;
    dryGain
      .connect(trimGain)
      .connect(lowEq)
      .connect(midEq)
      .connect(highEq)
      .connect(colorFilter)
      .connect(channelGain)
      .connect(fadeGain);
    karaokeGain.connect(trimGain);
    fadeGain.connect(analyser).connect(this.musicBus);
    fadeGain.connect(fxSend);
    fxSend.connect(this.delayNode);
    fxSend.connect(this.reverbNode);
    element.addEventListener("timeupdate", this.onChange);
    element.addEventListener("timeupdate", () => {
      const deck = this.decks?.[id];
      if (
        deck?.loopStart !== undefined &&
        deck.loopEnd !== undefined &&
        element.currentTime >= deck.loopEnd
      ) {
        if (deck.slipEnabled && !deck.slipAnchor)
          deck.slipAnchor = {
            audioTime: deck.loopStart,
            contextTime: this.context.currentTime,
          };
        element.currentTime = deck.loopStart;
      }
    });
    element.addEventListener("play", this.onChange);
    element.addEventListener("pause", this.onChange);
    element.addEventListener("loadedmetadata", this.onChange);
    element.addEventListener("waiting", () => {
      const deck = this.decks?.[id];
      if (!deck || deck.stallTimer) return;
      deck.stallTimer = window.setTimeout(() => {
        deck.stallTimer = undefined;
        if (
          !element.paused &&
          element.readyState < HTMLMediaElement.HAVE_FUTURE_DATA
        )
          this.onFailure(id, "Buffer detenido durante 5 segundos");
      }, 5000);
    });
    element.addEventListener("playing", () => {
      const deck = this.decks?.[id];
      if (deck?.stallTimer) {
        window.clearTimeout(deck.stallTimer);
        deck.stallTimer = undefined;
      }
    });
    element.addEventListener("error", () => {
      const message =
        element.error?.message || "No se pudo decodificar el audio";
      this.decks[id].error = message;
      this.onFailure(id, message);
      this.onChange();
    });
    return {
      element,
      fadeGain,
      trimGain,
      channelGain,
      lowEq,
      midEq,
      highEq,
      colorFilter,
      analyser,
      meterData,
      source,
      splitter,
      merger,
      invertRight,
      dryGain,
      karaokeGain,
      fxSend,
      hotCues: {},
      slipEnabled: false,
    };
  }

  async load(id: DeckId, file: File) {
    const deck = this.decks[id];
    deck.element.pause();
    if (deck.url) URL.revokeObjectURL(deck.url);
    deck.url = URL.createObjectURL(file);
    deck.name = file.name;
    deck.error = undefined;
    deck.hotCues = {};
    deck.element.src = deck.url;
    deck.element.load();
    await new Promise<void>((resolve, reject) => {
      const ready = () => {
        cleanup();
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(new Error("Formato no reproducible por este navegador"));
      };
      const cleanup = () => {
        deck.element.removeEventListener("canplay", ready);
        deck.element.removeEventListener("error", failed);
      };
      deck.element.addEventListener("canplay", ready, { once: true });
      deck.element.addEventListener("error", failed, { once: true });
    });
    this.onChange();
  }

  async loadUrl(id: DeckId, url: string, name: string) {
    const deck = this.decks[id];
    deck.element.pause();
    await this.assertStreamable(url);
    if (deck.url?.startsWith("blob:")) URL.revokeObjectURL(deck.url);
    deck.url = url;
    deck.name = name;
    deck.error = undefined;
    deck.hotCues = {};
    deck.element.src = url;
    deck.element.load();
    await new Promise<void>((resolve, reject) => {
      const ready = () => {
        cleanup();
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(new Error("No se pudo transmitir el audio desde Drive"));
      };
      const cleanup = () => {
        deck.element.removeEventListener("canplay", ready);
        deck.element.removeEventListener("error", failed);
      };
      deck.element.addEventListener("canplay", ready, { once: true });
      deck.element.addEventListener("error", failed, { once: true });
    });
    this.onChange();
  }

  private async assertStreamable(url: string) {
    let response: Response;
    try {
      response = await fetch(url, { method: "GET", cache: "no-store" });
    } catch {
      throw new Error("No se pudo contactar el servidor de streaming");
    }
    if (response.ok) return;
    const reasons: Record<string, string> = {
      DRIVE_NOT_CONNECTED: "Tu cuenta de Google Drive no está conectada",
      TRACK_NOT_STREAMABLE: "Esta pista ya no está disponible en Drive",
      DRIVE_STREAM_FAILED: "Google Drive rechazó la solicitud de streaming",
      GOOGLE_DRIVE_NOT_CONFIGURED: "Falta configurar la integración con Google Drive",
      INVALID_DRIVE_TOKEN: "La conexión con Google Drive es inválida, reconéctala",
      DRIVE_RECONNECT_REQUIRED: "Debes reconectar tu cuenta de Google Drive",
      UNAUTHORIZED: "Tu sesión expiró, vuelve a iniciar sesión",
    };
    let code: string | undefined;
    try {
      const body = (await response.json()) as { error?: string };
      code = body.error;
    } catch {
      // Respuesta sin cuerpo JSON legible; se usa el código de estado HTTP.
    }
    const reason =
      (code && reasons[code]) ||
      `El servidor de streaming respondió ${response.status}`;
    throw new Error(`No se pudo transmitir el audio desde Drive: ${reason}`);
  }

  async analyzeSource(source: File | string): Promise<AudioAnalysisResult> {
    const cacheKey =
      typeof source === "string"
        ? source
        : `${source.name}:${source.size}:${source.lastModified}`;
    const cached = this.analysisCache.get(cacheKey);
    if (cached) return cached;
    const arrayBuffer =
      typeof source === "string"
        ? await fetch(source, { cache: "no-store" }).then((response) => {
            if (!response.ok) throw new Error("No se pudo analizar la pista");
            return response.arrayBuffer();
          })
        : await source.arrayBuffer();
    const decoded = await this.context.decodeAudioData(arrayBuffer.slice(0));
    const channel = decoded.getChannelData(0);
    const sampleRate = decoded.sampleRate;
    const hop = 1024;
    const maxSamples = Math.min(channel.length, sampleRate * 360);
    const envelope: number[] = [];
    let sumSquares = 0;
    let peakEnvelope = 0;
    for (let offset = 0; offset < maxSamples; offset += hop) {
      let energy = 0;
      const end = Math.min(maxSamples, offset + hop);
      for (let index = offset; index < end; index += 1) {
        const sample = channel[index];
        energy += sample * sample;
        sumSquares += sample * sample;
      }
      const rms = Math.sqrt(energy / Math.max(1, end - offset));
      envelope.push(rms);
      peakEnvelope = Math.max(peakEnvelope, rms);
    }
    const onset = envelope.map((value, index) =>
      Math.max(0, value - (envelope[index - 1] ?? value)),
    );
    const framesPerSecond = sampleRate / hop;
    let bestBpm = 120;
    let bestScore = -Infinity;
    let totalScore = 0;
    for (let bpm = 70; bpm <= 180; bpm += 0.5) {
      const lag = Math.max(1, Math.round((framesPerSecond * 60) / bpm));
      let score = 0;
      for (let index = lag; index < onset.length; index += 1)
        score += onset[index] * onset[index - lag];
      totalScore += Math.max(0, score);
      if (score > bestScore) {
        bestScore = score;
        bestBpm = bpm;
      }
    }
    const threshold = peakEnvelope * 0.18;
    const cueFrame = Math.max(
      0,
      envelope.findIndex((value) => value >= threshold),
    );
    const durationMs = decoded.duration * 1000;
    const segmentSamples = Math.max(1, Math.round(sampleRate * 4));
    const segments: AudioAnalysisResult["segments"] = [];
    let maximumSegmentEnergy = 0;
    for (let offset = 0; offset < maxSamples; offset += segmentSamples) {
      const end = Math.min(maxSamples, offset + segmentSamples);
      let total = 0;
      let low = 0;
      let lowState = 0;
      let zeroCrossings = 0;
      const smoothing = Math.exp((-2 * Math.PI * 220) / sampleRate);
      for (let index = offset; index < end; index += 1) {
        const sample = channel[index];
        lowState = smoothing * lowState + (1 - smoothing) * sample;
        total += sample * sample;
        low += lowState * lowState;
        if (index > offset && sample >= 0 !== channel[index - 1] >= 0)
          zeroCrossings += 1;
      }
      const length = Math.max(1, end - offset);
      const rms = Math.sqrt(total / length);
      const lowRatio = Math.max(
        0,
        Math.min(1, low / Math.max(0.000001, total)),
      );
      const midHighRatio = 1 - lowRatio;
      const zcr = zeroCrossings / length;
      const vocalShape =
        Math.max(0, 1 - Math.abs(midHighRatio - 0.58) / 0.42) *
        Math.max(0, 1 - Math.abs(zcr - 0.085) / 0.085);
      const vocalProbability =
        rms < 0.008 ? 0 : Math.max(0, Math.min(1, vocalShape));
      maximumSegmentEnergy = Math.max(maximumSegmentEnergy, rms);
      segments.push({
        startMs: Math.round((offset / sampleRate) * 1000),
        endMs: Math.round((end / sampleRate) * 1000),
        energy: rms,
        vocalProbability,
      });
    }
    for (const segment of segments)
      segment.energy = Math.max(
        0,
        Math.min(1, segment.energy / Math.max(0.000001, maximumSegmentEnergy)),
      );
    const safeSegments = segments.filter(
      (segment) => segment.vocalProbability < 0.38 && segment.energy > 0.28,
    );
    const safeCue =
      safeSegments.find((segment) => segment.startMs >= 2_000) ??
      safeSegments[0];
    const safeOut = [...safeSegments]
      .reverse()
      .find((segment) => segment.endMs <= durationMs - 2_000);
    const result: AudioAnalysisResult = {
      bpm: Math.round(bestBpm * 10) / 10,
      bpmConfidence: Math.max(
        0.05,
        Math.min(0.99, (bestScore / Math.max(0.000001, totalScore)) * 22),
      ),
      energy: Math.max(
        0,
        Math.min(1, Math.sqrt(sumSquares / Math.max(1, maxSamples)) * 4),
      ),
      loudnessLufs:
        20 *
        Math.log10(
          Math.max(0.000001, Math.sqrt(sumSquares / Math.max(1, maxSamples))),
        ),
      cueInMs:
        safeCue?.startMs ?? Math.round((cueFrame / framesPerSecond) * 1000),
      transitionOutMs:
        safeOut?.startMs ??
        Math.max(0, Math.round(durationMs - (60 / bestBpm) * 32 * 1000)),
      segments,
    };
    this.analysisCache.set(cacheKey, result);
    return result;
  }

  get contextState() {
    return this.context.state;
  }
  get sampleRate() {
    return this.context.sampleRate;
  }
  async play(id: DeckId) {
    await this.context.resume();
    await this.decks[id].element.play();
    this.onChange();
  }
  pause(id: DeckId) {
    this.decks[id].element.pause();
    this.onChange();
  }
  seek(id: DeckId, seconds: number) {
    const d = this.decks[id].element;
    if (Number.isFinite(d.duration))
      d.currentTime = Math.max(0, Math.min(seconds, d.duration));
  }
  jump(id: DeckId, seconds: number) {
    const element = this.decks[id].element;
    this.seek(id, (element.currentTime || 0) + seconds);
    this.onChange();
  }
  currentTime(id: DeckId) {
    return this.decks[id].element.currentTime || 0;
  }
  setLoop(id: DeckId, start: number, end: number) {
    const deck = this.decks[id];
    const element = deck.element;
    if (end <= start) throw new Error("LOOP OUT debe estar después de LOOP IN");
    deck.loopStart = Math.max(0, start);
    deck.loopEnd = Math.min(element.duration || end, end);
    this.onChange();
  }
  clearLoop(id: DeckId) {
    const deck = this.decks[id];
    deck.loopStart = undefined;
    deck.loopEnd = undefined;
    this.returnFromSlip(id);
    this.onChange();
  }
  /** Posición del groove real mientras un ancla de slip está activa. */
  private slipGroovePosition(deck: InternalDeck) {
    if (!deck.slipAnchor) return undefined;
    return (
      deck.slipAnchor.audioTime +
      (this.context.currentTime - deck.slipAnchor.contextTime)
    );
  }
  /** Al salir de un desvío temporal (loop/hot cue), retoma el groove real. */
  private returnFromSlip(id: DeckId) {
    const deck = this.decks[id];
    const groove = this.slipGroovePosition(deck);
    deck.slipAnchor = undefined;
    if (groove === undefined) return;
    this.seek(id, groove);
  }
  setSlipMode(id: DeckId, enabled: boolean) {
    const deck = this.decks[id];
    deck.slipEnabled = enabled;
    if (!enabled) deck.slipAnchor = undefined;
  }
  isSlipMode(id: DeckId) {
    return this.decks[id].slipEnabled;
  }
  setKeyLock(id: DeckId, enabled: boolean) {
    this.decks[id].element.preservesPitch = enabled;
  }
  setMaster(value: number) {
    this.master.gain.setTargetAtTime(
      Math.max(0, Math.min(1.2, value)),
      this.context.currentTime,
      0.01,
    );
  }
  setDeckGain(id: DeckId, value: number) {
    this.decks[id].trimGain.gain.setTargetAtTime(
      Math.max(0, Math.min(1.5, value)),
      this.context.currentTime,
      0.01,
    );
  }
  setChannelVolume(id: DeckId, value: number) {
    const gain = this.decks[id].channelGain.gain;
    const now = this.context.currentTime;
    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(Math.max(0, Math.min(1, value)), now, 0.005);
  }
  setDeckEq(id: DeckId, band: "low" | "mid" | "high", db: number) {
    const deck = this.decks[id];
    const filter =
      band === "low" ? deck.lowEq : band === "mid" ? deck.midEq : deck.highEq;
    filter.gain.setTargetAtTime(
      Math.max(-24, Math.min(12, db)),
      this.context.currentTime,
      0.02,
    );
  }
  /**
   * Filter knob estilo DJM Pioneer: -100 cierra en lowpass, +100 abre en
   * highpass, 0 es allpass (sin efecto). Un solo control por canal.
   */
  setColorFilter(id: DeckId, position: number) {
    const filter = this.decks[id].colorFilter;
    const clamped = Math.max(-100, Math.min(100, position));
    const now = this.context.currentTime;
    if (Math.abs(clamped) < 1) {
      filter.type = "allpass";
      filter.frequency.setTargetAtTime(20000, now, 0.02);
      filter.Q.setTargetAtTime(0.7, now, 0.02);
      return;
    }
    if (clamped < 0) {
      filter.type = "lowpass";
      const t = (100 + clamped) / 100;
      filter.frequency.setTargetAtTime(80 * Math.pow(280, t), now, 0.02);
    } else {
      filter.type = "highpass";
      const t = clamped / 100;
      filter.frequency.setTargetAtTime(60 * Math.pow(140, t), now, 0.02);
    }
    filter.Q.setTargetAtTime(1 + Math.abs(clamped) / 22, now, 0.02);
  }
  /** Karaoke L-R: cancela el centro estéreo (voz, bajo) por diferencia de fase. */
  setKaraoke(id: DeckId, enabled: boolean) {
    const deck = this.decks[id];
    const now = this.context.currentTime;
    deck.dryGain.gain.setTargetAtTime(enabled ? 0 : 1, now, 0.03);
    deck.karaokeGain.gain.setTargetAtTime(enabled ? 1 : 0, now, 0.03);
  }
  /**
   * Lee la posición equivalente -100..100 del filtro de color en tiempo
   * real (inversa de setColorFilter), incluso cuando el valor lo mueve la
   * automatización de una transición y no el knob manual.
   */
  filterPosition(id: DeckId): number {
    const filter = this.decks[id].colorFilter;
    const frequency = filter.frequency.value;
    if (filter.type === "lowpass") {
      const t = Math.log(frequency / 80) / Math.log(280);
      return Math.max(-100, Math.min(100, Math.round((t - 1) * 100)));
    }
    if (filter.type === "highpass") {
      const t = Math.log(frequency / 60) / Math.log(140);
      return Math.max(-100, Math.min(100, Math.round(t * 100)));
    }
    return 0;
  }
  fxSendLevel(id: DeckId): number {
    return this.decks[id].fxSend.gain.value;
  }
  /** Posición 0-100 del crossfader derivada del volumen real de A/B — se
   * mantiene fiel incluso mientras Auto Mix anima el volumen por su cuenta,
   * sin depender de que algo más reporte el progreso de la transición. */
  crossfaderPosition(): number {
    const a = Math.max(0, Math.min(1, this.decks.A.fadeGain.gain.value));
    const b = Math.max(0, Math.min(1, this.decks.B.fadeGain.gain.value));
    if (a <= 0.0001 && b <= 0.0001) return 0;
    const x = (Math.atan2(b, a) / (Math.PI / 2)) * 100;
    return Math.max(0, Math.min(100, Math.round(x)));
  }
  delayMixLevel(): number {
    return this.delayWet.gain.value;
  }
  reverbMixLevel(): number {
    return this.reverbWet.gain.value;
  }
  setFxSend(id: DeckId, value: number) {
    this.decks[id].fxSend.gain.setTargetAtTime(
      Math.max(0, Math.min(1, value)),
      this.context.currentTime,
      0.02,
    );
  }
  setDelayTime(seconds: number) {
    this.delayNode.delayTime.setTargetAtTime(
      Math.max(0.02, Math.min(2, seconds)),
      this.context.currentTime,
      0.01,
    );
  }
  setDelayFeedback(value: number) {
    this.delayFeedback.gain.setTargetAtTime(
      Math.max(0, Math.min(0.85, value)),
      this.context.currentTime,
      0.02,
    );
  }
  setDelayMix(value: number) {
    this.delayWet.gain.setTargetAtTime(
      Math.max(0, Math.min(1, value)),
      this.context.currentTime,
      0.02,
    );
  }
  setReverbMix(value: number) {
    this.reverbWet.gain.setTargetAtTime(
      Math.max(0, Math.min(1, value)),
      this.context.currentTime,
      0.02,
    );
  }
  setHotCue(id: DeckId, slot: HotCueSlot) {
    this.decks[id].hotCues[slot] = this.decks[id].element.currentTime || 0;
  }
  triggerHotCue(id: DeckId, slot: HotCueSlot) {
    const deck = this.decks[id];
    const point = deck.hotCues[slot];
    if (point === undefined) return false;
    if (deck.slipEnabled && !deck.slipAnchor)
      deck.slipAnchor = {
        audioTime: deck.element.currentTime || 0,
        contextTime: this.context.currentTime,
      };
    this.seek(id, point);
    return true;
  }
  /** Suelta un hot cue mantenido: con slip activo retoma el groove real. */
  releaseHotCue(id: DeckId) {
    if (this.decks[id].slipEnabled) this.returnFromSlip(id);
  }
  clearHotCue(id: DeckId, slot: HotCueSlot) {
    delete this.decks[id].hotCues[slot];
  }
  hotCuesFor(id: DeckId): Partial<Record<HotCueSlot, number>> {
    return { ...this.decks[id].hotCues };
  }
  setTempo(id: DeckId, value: number) {
    this.decks[id].element.playbackRate = Math.max(0.92, Math.min(1.08, value));
    this.onChange();
  }
  private jogBendTimer: Partial<Record<DeckId, number>> = {};
  /**
   * Emula el jog wheel de un CDJ: con la pista sonando, gira el
   * playbackRate un instante (pitch bend) y lo repone solo; en pausa,
   * mueve la posición directamente (scrub/search), igual que hardware real.
   */
  jogScratch(id: DeckId, deltaTurns: number, playing: boolean) {
    const deck = this.decks[id];
    const element = deck.element;
    if (!playing) {
      this.seek(id, (element.currentTime || 0) + deltaTurns * 1.8);
      return;
    }
    const base = element.playbackRate || 1;
    const bend = Math.max(-0.55, Math.min(0.55, deltaTurns * 5));
    element.playbackRate = Math.max(0.3, Math.min(1.8, base + bend));
    const timer = this.jogBendTimer[id];
    if (timer) window.clearTimeout(timer);
    this.jogBendTimer[id] = window.setTimeout(() => {
      element.playbackRate = base;
      this.jogBendTimer[id] = undefined;
      this.onChange();
    }, 120);
  }

  async setOutputDevice(deviceId: string) {
    const context = this.context as AudioContext & {
      setSinkId?: (id: string) => Promise<void>;
    };
    if (!context.setSinkId)
      throw new Error(
        "Este navegador no permite seleccionar la salida de AudioContext",
      );
    await context.setSinkId(deviceId);
  }

  async playJingle(file: File, duckLevel = 0.35) {
    if (this.jingleUrl) URL.revokeObjectURL(this.jingleUrl);
    this.jingleUrl = URL.createObjectURL(file);
    this.jingleElement.src = this.jingleUrl;
    this.jingleElement.load();
    await this.context.resume();
    const now = this.context.currentTime;
    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, now);
    this.musicBus.gain.linearRampToValueAtTime(
      Math.max(0.1, Math.min(1, duckLevel)),
      now + 0.35,
    );
    try {
      await this.jingleElement.play();
      await new Promise<void>((resolve, reject) => {
        this.jingleElement.addEventListener("ended", () => resolve(), {
          once: true,
        });
        this.jingleElement.addEventListener(
          "error",
          () => reject(new Error("No se pudo reproducir la cuña")),
          { once: true },
        );
      });
    } finally {
      const restore = this.context.currentTime;
      this.musicBus.gain.cancelScheduledValues(restore);
      this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, restore);
      this.musicBus.gain.linearRampToValueAtTime(1, restore + 0.6);
    }
  }
  stopJingle() {
    this.jingleElement.pause();
    this.jingleElement.currentTime = 0;
    const now = this.context.currentTime;
    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.linearRampToValueAtTime(1, now + 0.2);
  }
  async playPerformanceSample(
    file: File,
    kind: "base" | "bass" | "voice" | "jingle",
  ) {
    await this.context.resume();
    const cacheKey = `${file.name}:${file.size}:${file.lastModified}`;
    let buffer = this.performanceCache.get(cacheKey);
    if (!buffer) {
      buffer = await this.context.decodeAudioData(await file.arrayBuffer());
      this.performanceCache.set(cacheKey, buffer);
    }
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const now = this.context.currentTime;
    source.buffer = buffer;
    filter.type = kind === "bass" ? "lowpass" : "allpass";
    filter.frequency.value = kind === "bass" ? 180 : 1000;
    const level = kind === "bass" ? 0.52 : kind === "base" ? 0.58 : 0.72;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(level, now + 0.008);
    gain.gain.setValueAtTime(
      level,
      now + Math.max(0.01, buffer.duration - 0.035),
    );
    gain.gain.linearRampToValueAtTime(0.0001, now + buffer.duration);
    source.connect(filter).connect(gain).connect(this.performanceBus);
    source.start(now);
    await new Promise<void>((resolve) => {
      source.addEventListener("ended", () => resolve(), { once: true });
    });
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
  }

  setCrossfader(value: number) {
    const x = Math.max(0, Math.min(1, value));
    const now = this.context.currentTime;
    this.decks.A.fadeGain.gain.cancelScheduledValues(now);
    this.decks.B.fadeGain.gain.cancelScheduledValues(now);
    this.decks.A.fadeGain.gain.setValueAtTime(Math.cos((x * Math.PI) / 2), now);
    this.decks.B.fadeGain.gain.setValueAtTime(Math.sin((x * Math.PI) / 2), now);
  }

  private startRhythmBridge(bpm: number, durationSeconds: number) {
    const start = this.context.currentTime;
    const end = start + durationSeconds;
    const beat = 60 / Math.max(70, Math.min(180, bpm));
    const bus = this.context.createGain();
    const lowpass = this.context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 9500;
    bus.gain.setValueAtTime(0.0001, start);
    bus.gain.exponentialRampToValueAtTime(0.32, start + 0.08);
    bus.gain.setValueAtTime(0.32, Math.max(start + 0.09, end - 1.25));
    bus.gain.exponentialRampToValueAtTime(0.0001, end);
    bus.connect(lowpass).connect(this.musicBus);

    const noiseBuffer = this.context.createBuffer(
      1,
      Math.ceil(this.context.sampleRate * 0.06),
      this.context.sampleRate,
    );
    const noise = noiseBuffer.getChannelData(0);
    for (let index = 0; index < noise.length; index += 1)
      noise[index] = Math.random() * 2 - 1;

    for (let time = start; time < end; time += beat / 2) {
      const halfBeat = Math.round((time - start) / (beat / 2));
      if (halfBeat % 2 === 0) {
        const kick = this.context.createOscillator();
        const kickGain = this.context.createGain();
        kick.type = "sine";
        kick.frequency.setValueAtTime(125, time);
        kick.frequency.exponentialRampToValueAtTime(48, time + 0.13);
        kickGain.gain.setValueAtTime(0.0001, time);
        kickGain.gain.exponentialRampToValueAtTime(0.9, time + 0.008);
        kickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
        kick.connect(kickGain).connect(bus);
        kick.start(time);
        kick.stop(Math.min(end, time + 0.22));
      } else {
        const hat = this.context.createBufferSource();
        const hatFilter = this.context.createBiquadFilter();
        const hatGain = this.context.createGain();
        hat.buffer = noiseBuffer;
        hatFilter.type = "highpass";
        hatFilter.frequency.value = 6500;
        hatGain.gain.setValueAtTime(0.13, time);
        hatGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);
        hat.connect(hatFilter).connect(hatGain).connect(bus);
        hat.start(time);
        hat.stop(Math.min(end, time + 0.06));
      }
    }
    const cleanup = window.setTimeout(
      () => {
        bus.disconnect();
        lowpass.disconnect();
      },
      durationSeconds * 1000 + 150,
    );
    return () => {
      window.clearTimeout(cleanup);
      const now = this.context.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setTargetAtTime(0.0001, now, 0.04);
      window.setTimeout(() => {
        bus.disconnect();
        lowpass.disconnect();
      }, 250);
    };
  }

  private startSmartMixFx(bpm: number, durationSeconds: number, style: number) {
    const start = this.context.currentTime;
    const end = start + durationSeconds;
    const beat = 60 / Math.max(70, Math.min(180, bpm));
    const bus = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const noiseBuffer = this.context.createBuffer(
      1,
      Math.ceil(this.context.sampleRate * durationSeconds),
      this.context.sampleRate,
    );
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const noise = this.context.createBufferSource();
    noise.buffer = noiseBuffer;
    filter.type = style === 1 ? "bandpass" : "highpass";
    filter.Q.value = style === 1 ? 4 : 1.2;
    filter.frequency.setValueAtTime(style === 2 ? 1800 : 450, start);
    filter.frequency.exponentialRampToValueAtTime(11000, end - beat * 0.5);
    bus.gain.setValueAtTime(0.0001, start);
    bus.gain.exponentialRampToValueAtTime(
      style === 0 ? 0.055 : 0.035,
      end - beat,
    );
    bus.gain.exponentialRampToValueAtTime(0.0001, end);
    noise.connect(filter).connect(bus).connect(this.musicBus);
    noise.start(start);
    noise.stop(end);

    // Dos golpes subgraves únicamente alrededor del drop. La afinación y el
    // espacio cambian con el BPM/estilo para integrarse mejor con cada base.
    const spacing = style === 1 ? beat : beat * 0.5;
    const root = Math.max(44, Math.min(62, 44 + ((bpm + style * 7) % 18)));
    const impacts = [end - spacing, end].map((impactTime, index) => {
      const impact = this.context.createOscillator();
      const impactGain = this.context.createGain();
      const tone = this.context.createBiquadFilter();
      impact.type = index === 0 ? "sine" : "triangle";
      impact.frequency.setValueAtTime(
        root * (index === 0 ? 1.8 : 2),
        impactTime,
      );
      impact.frequency.exponentialRampToValueAtTime(
        root,
        impactTime + (index === 0 ? 0.2 : 0.3),
      );
      tone.type = "lowpass";
      tone.frequency.value = 145;
      tone.Q.value = 1.1;
      impactGain.gain.setValueAtTime(0.0001, impactTime);
      impactGain.gain.exponentialRampToValueAtTime(
        index === 0 ? 0.14 : 0.22,
        impactTime + 0.006,
      );
      impactGain.gain.exponentialRampToValueAtTime(
        0.0001,
        impactTime + (index === 0 ? 0.24 : 0.38),
      );
      impact.connect(tone).connect(impactGain).connect(this.musicBus);
      impact.start(impactTime);
      impact.stop(impactTime + 0.4);
      return { impact, impactGain, tone };
    });

    window.setTimeout(
      () => {
        noise.disconnect();
        filter.disconnect();
        bus.disconnect();
        for (const { impact, impactGain, tone } of impacts) {
          impact.disconnect();
          impactGain.disconnect();
          tone.disconnect();
        }
      },
      durationSeconds * 1000 + 500,
    );
  }

  private armEchoOut(deck: InternalDeck, beat: number, dropTime: number) {
    const delay = this.context.createDelay(2);
    const feedback = this.context.createGain();
    const wet = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    delay.delayTime.value = Math.max(0.12, Math.min(0.75, beat * 0.75));
    feedback.gain.value = 0.46;
    filter.type = "highpass";
    filter.frequency.value = 180;
    wet.gain.setValueAtTime(0.0001, this.context.currentTime);
    wet.gain.exponentialRampToValueAtTime(0.32, dropTime);
    wet.gain.setValueAtTime(0.32, dropTime + beat);
    wet.gain.exponentialRampToValueAtTime(0.0001, dropTime + beat * 4);
    deck.channelGain.connect(delay);
    delay.connect(filter).connect(wet).connect(this.musicBus);
    delay.connect(feedback).connect(delay);
    window.setTimeout(
      () => {
        deck.channelGain.disconnect(delay);
        delay.disconnect();
        feedback.disconnect();
        filter.disconnect();
        wet.disconnect();
      },
      Math.max(0, dropTime - this.context.currentTime + beat * 4.5) * 1000,
    );
  }

  private armEqDrop(
    outgoing: InternalDeck,
    incoming: InternalDeck,
    beat: number,
    dropTime: number,
    style: number,
    vocalProtection: boolean,
  ) {
    const start = this.context.currentTime;
    const sweepStart = Math.max(start, dropTime - beat * (style === 2 ? 4 : 2));
    const lastBeat = Math.max(sweepStart, dropTime - beat);
    const finalHit = Math.max(lastBeat, dropTime - beat * 0.18);
    const original = {
      outLow: outgoing.lowEq.gain.value,
      outMid: outgoing.midEq.gain.value,
      outHigh: outgoing.highEq.gain.value,
      inLow: incoming.lowEq.gain.value,
      inMid: incoming.midEq.gain.value,
      inHigh: incoming.highEq.gain.value,
    };
    const bands = [
      outgoing.lowEq.gain,
      outgoing.midEq.gain,
      outgoing.highEq.gain,
      incoming.lowEq.gain,
      incoming.midEq.gain,
      incoming.highEq.gain,
    ];
    for (const band of bands) band.cancelScheduledValues(start);

    outgoing.lowEq.gain.setValueAtTime(original.outLow, sweepStart);
    outgoing.midEq.gain.setValueAtTime(original.outMid, sweepStart);
    outgoing.highEq.gain.setValueAtTime(original.outHigh, sweepStart);
    outgoing.midEq.gain.linearRampToValueAtTime(
      vocalProtection ? -22 : -14,
      lastBeat,
    );
    outgoing.highEq.gain.linearRampToValueAtTime(
      style === 2 ? -3 : -6,
      lastBeat,
    );
    outgoing.lowEq.gain.setValueAtTime(original.outLow, lastBeat);
    outgoing.lowEq.gain.linearRampToValueAtTime(2, finalHit);

    // La pista entrante permanece completa internamente y recibe un pequeño
    // golpe de graves justo al abrirse, sin rampa de volumen.
    incoming.lowEq.gain.setValueAtTime(original.inLow, dropTime);
    incoming.midEq.gain.setValueAtTime(original.inMid, dropTime);
    incoming.highEq.gain.setValueAtTime(original.inHigh, dropTime);
    incoming.lowEq.gain.setValueAtTime(4, dropTime + 0.001);
    incoming.lowEq.gain.exponentialRampToValueAtTime(
      Math.max(0.01, original.inLow || 0.01),
      dropTime + beat * 0.75,
    );

    window.setTimeout(
      () => {
        const now = this.context.currentTime;
        for (const band of bands) band.cancelScheduledValues(now);
        outgoing.lowEq.gain.value = original.outLow;
        outgoing.midEq.gain.value = original.outMid;
        outgoing.highEq.gain.value = original.outHigh;
        incoming.lowEq.gain.value = original.inLow;
        incoming.midEq.gain.value = original.inMid;
        incoming.highEq.gain.value = original.inHigh;
      },
      Math.max(0, dropTime - start + beat) * 1000,
    );
  }

  private startInstrumentalBridge(
    bpm: number,
    dropTime: number,
    style: number,
  ) {
    const beat = 60 / Math.max(70, Math.min(180, bpm));
    const start = Math.max(this.context.currentTime, dropTime - beat * 4);
    const end = dropTime + beat * 4;
    const bus = this.context.createGain();
    const lowpass = this.context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 10500;
    bus.gain.setValueAtTime(0.0001, start);
    bus.gain.exponentialRampToValueAtTime(0.2, start + beat * 0.35);
    bus.gain.setValueAtTime(0.2, dropTime + beat * 2);
    bus.gain.exponentialRampToValueAtTime(0.0001, end);
    bus.connect(lowpass).connect(this.musicBus);

    const noiseBuffer = this.context.createBuffer(
      1,
      Math.ceil(this.context.sampleRate * 0.055),
      this.context.sampleRate,
    );
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i += 1)
      noiseData[i] = Math.random() * 2 - 1;

    let step = 0;
    for (let time = start; time < end; time += beat / 2, step += 1) {
      if (step % 2 === 0) {
        const kick = this.context.createOscillator();
        const gain = this.context.createGain();
        kick.type = "sine";
        kick.frequency.setValueAtTime(style === 1 ? 112 : 126, time);
        kick.frequency.exponentialRampToValueAtTime(48, time + 0.14);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.72, time + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
        kick.connect(gain).connect(bus);
        kick.start(time);
        kick.stop(time + 0.24);
      } else {
        const hat = this.context.createBufferSource();
        const filter = this.context.createBiquadFilter();
        const gain = this.context.createGain();
        hat.buffer = noiseBuffer;
        filter.type = "highpass";
        filter.frequency.value = style === 2 ? 7200 : 8200;
        gain.gain.setValueAtTime(0.07, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
        hat.connect(filter).connect(gain).connect(bus);
        hat.start(time);
        hat.stop(time + 0.055);
      }
    }
    window.setTimeout(
      () => {
        bus.disconnect();
        lowpass.disconnect();
      },
      Math.max(0, end - this.context.currentTime) * 1000 + 300,
    );
  }

  private captureBassBridge(
    deck: InternalDeck,
    outgoingBpm: number,
    incomingBpm: number,
    dropTime: number,
    style: number,
  ) {
    const beat = 60 / Math.max(70, Math.min(180, outgoingBpm));
    const targetBeat = 60 / Math.max(70, Math.min(180, incomingBpm));
    const start = Math.max(this.context.currentTime, dropTime - beat * 4);
    const end = dropTime + beat * (style === 2 ? 6 : 4);
    const highpass = this.context.createBiquadFilter();
    const lowpass = this.context.createBiquadFilter();
    const delay = this.context.createDelay(2);
    const feedback = this.context.createGain();
    const bridgeGain = this.context.createGain();
    const limiter = this.context.createDynamicsCompressor();

    highpass.type = "highpass";
    highpass.frequency.value = 38;
    highpass.Q.value = 0.7;
    lowpass.type = "lowpass";
    lowpass.frequency.value = style === 1 ? 165 : 190;
    lowpass.Q.value = 1.4;
    delay.delayTime.setValueAtTime(beat, start);
    if (Math.abs(targetBeat - beat) > 0.01)
      delay.delayTime.linearRampToValueAtTime(targetBeat, end);
    feedback.gain.value = style === 2 ? 0.82 : 0.76;
    limiter.threshold.value = -8;
    limiter.knee.value = 8;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.004;
    limiter.release.value = beat * 0.45;
    bridgeGain.gain.setValueAtTime(0.0001, start);
    bridgeGain.gain.exponentialRampToValueAtTime(0.27, dropTime);
    bridgeGain.gain.setValueAtTime(0.27, dropTime + beat * 2);
    bridgeGain.gain.exponentialRampToValueAtTime(0.0001, end);

    // Toma audio real del disco saliente antes del fader, elimina la zona de
    // voz y realimenta exactamente un beat para conservar su kick/subgrave.
    deck.channelGain.connect(highpass);
    highpass.connect(lowpass).connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(bridgeGain).connect(limiter).connect(this.musicBus);

    window.setTimeout(
      () => {
        deck.channelGain.disconnect(highpass);
        highpass.disconnect();
        lowpass.disconnect();
        delay.disconnect();
        feedback.disconnect();
        bridgeGain.disconnect();
        limiter.disconnect();
      },
      Math.max(0, end - this.context.currentTime) * 1000 + 350,
    );
  }

  private blendIncomingRealBase(
    deck: InternalDeck,
    bpm: number,
    dropTime: number,
  ) {
    const beat = 60 / Math.max(70, Math.min(180, bpm));
    const start = this.context.currentTime;
    const end = dropTime + beat * 4;
    const highpass = this.context.createBiquadFilter();
    const lowpass = this.context.createBiquadFilter();
    const warmth = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const limiter = this.context.createDynamicsCompressor();
    highpass.type = "highpass";
    highpass.frequency.value = 34;
    lowpass.type = "lowpass";
    lowpass.frequency.value = 230;
    lowpass.Q.value = 1.1;
    warmth.type = "peaking";
    warmth.frequency.value = 92;
    warmth.Q.value = 0.85;
    warmth.gain.value = 2.5;
    limiter.threshold.value = -9;
    limiter.knee.value = 10;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.004;
    limiter.release.value = beat * 0.42;

    gain.gain.setValueAtTime(0.0001, start);
    const preview = Math.max(start + 0.02, dropTime - beat);
    gain.gain.setValueAtTime(0.0001, preview);
    gain.gain.exponentialRampToValueAtTime(0.14, dropTime - beat * 0.12);
    gain.gain.exponentialRampToValueAtTime(0.3, dropTime + beat * 0.08);
    gain.gain.setValueAtTime(0.3, dropTime + beat);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    // Se toma antes del fadeGain: aunque la pista entrante todavía esté
    // oculta, su kick y bajo reales pueden preparar musicalmente el drop.
    deck.channelGain.connect(highpass);
    highpass.connect(lowpass).connect(warmth).connect(gain).connect(limiter);
    limiter.connect(this.musicBus);
    window.setTimeout(
      () => {
        deck.channelGain.disconnect(highpass);
        highpass.disconnect();
        lowpass.disconnect();
        warmth.disconnect();
        gain.disconnect();
        limiter.disconnect();
      },
      Math.max(0, end - this.context.currentTime) * 1000 + 300,
    );
  }

  private startRockTransitionFill(
    bpm: number,
    dropTime: number,
    style: number,
  ) {
    const beat = 60 / Math.max(70, Math.min(180, bpm));
    const bus = this.context.createGain();
    const drive = this.context.createWaveShaper();
    const cabinet = this.context.createBiquadFilter();
    const limiter = this.context.createDynamicsCompressor();
    const curve = new Float32Array(1024);
    for (let index = 0; index < curve.length; index += 1) {
      const x = (index * 2) / (curve.length - 1) - 1;
      curve[index] =
        ((3 + 18) * x * 20 * (Math.PI / 180)) / (Math.PI + 18 * Math.abs(x));
    }
    drive.curve = curve;
    drive.oversample = "4x";
    cabinet.type = "lowpass";
    cabinet.frequency.value = 3200;
    cabinet.Q.value = 0.8;
    limiter.threshold.value = -10;
    limiter.knee.value = 8;
    limiter.ratio.value = 10;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.16;
    bus.gain.value = 0.13;
    bus.connect(drive).connect(cabinet).connect(limiter).connect(this.musicBus);

    // Power chord corto: quinta justa, afinada de forma relativa al estilo.
    const root = style === 2 ? 82.41 : style === 1 ? 98 : 110;
    for (const [ratio, level] of [
      [1, 0.55],
      [1.5, 0.42],
      [2, 0.25],
    ] as const) {
      const guitar = this.context.createOscillator();
      const gain = this.context.createGain();
      guitar.type = "sawtooth";
      guitar.frequency.value = root * ratio;
      gain.gain.setValueAtTime(0.0001, dropTime - beat * 0.5);
      gain.gain.exponentialRampToValueAtTime(level, dropTime - beat * 0.47);
      gain.gain.setValueAtTime(level * 0.8, dropTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, dropTime + beat * 1.4);
      guitar.connect(gain).connect(bus);
      guitar.start(dropTime - beat * 0.5);
      guitar.stop(dropTime + beat * 1.5);
    }

    const noiseBuffer = this.context.createBuffer(
      1,
      Math.ceil(this.context.sampleRate * 0.5),
      this.context.sampleRate,
    );
    const noiseData = noiseBuffer.getChannelData(0);
    for (let index = 0; index < noiseData.length; index += 1)
      noiseData[index] = Math.random() * 2 - 1;

    // Redoble de cuatro golpes que acelera hacia el cambio.
    for (let step = 0; step < 4; step += 1) {
      const time = dropTime - beat + step * (beat / 4);
      const snare = this.context.createBufferSource();
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      snare.buffer = noiseBuffer;
      filter.type = "bandpass";
      filter.frequency.value = 1250 + step * 180;
      filter.Q.value = 1.2;
      gain.gain.setValueAtTime(0.07 + step * 0.018, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
      snare.connect(filter).connect(gain).connect(this.musicBus);
      snare.start(time);
      snare.stop(time + 0.11);
    }

    // Crash brillante exactamente en el drop.
    const crash = this.context.createBufferSource();
    const crashFilter = this.context.createBiquadFilter();
    const crashGain = this.context.createGain();
    crash.buffer = noiseBuffer;
    crashFilter.type = "highpass";
    crashFilter.frequency.value = 5200;
    crashGain.gain.setValueAtTime(0.13, dropTime);
    crashGain.gain.exponentialRampToValueAtTime(0.0001, dropTime + 0.48);
    crash.connect(crashFilter).connect(crashGain).connect(this.musicBus);
    crash.start(dropTime);
    crash.stop(dropTime + 0.5);

    window.setTimeout(
      () => {
        bus.disconnect();
        drive.disconnect();
        cabinet.disconnect();
        limiter.disconnect();
      },
      Math.max(0, dropTime - this.context.currentTime + beat * 2) * 1000,
    );
  }

  async transition(
    from: DeckId,
    to: DeckId,
    durationSeconds: number,
    outgoingBpm = 120,
    incomingBpm = 120,
  ) {
    const incoming = this.decks[to];
    if (incoming.element.readyState < HTMLMediaElement.HAVE_FUTURE_DATA)
      throw new Error(`Deck ${to} no está precargado`);
    await this.context.resume();
    const outgoing = this.decks[from];
    const beatSeconds = 60 / Math.max(70, Math.min(180, outgoingBpm));
    const untilBeat =
      (beatSeconds - (outgoing.element.currentTime % beatSeconds)) %
      beatSeconds;
    const stopBridge = this.startRhythmBridge(
      outgoingBpm,
      durationSeconds + untilBeat,
    );
    if (untilBeat > 0.025)
      await new Promise<void>((resolve) =>
        window.setTimeout(resolve, untilBeat * 1000),
      );
    incoming.element.playbackRate = Math.max(
      0.92,
      Math.min(1.08, outgoingBpm / Math.max(1, incomingBpm)),
    );
    incoming.element.preservesPitch = true;
    await incoming.element.play();
    const start = this.context.currentTime;
    const steps = 128;
    const out = new Float32Array(steps);
    const into = new Float32Array(steps);
    for (let i = 0; i < steps; i++) {
      const x = i / (steps - 1);
      const outgoingCurve = Math.cos((x * Math.PI) / 2);
      const incomingCurve = Math.sin((x * Math.PI) / 2);
      out[i] = x < 0.75 ? Math.max(0.42, outgoingCurve) : outgoingCurve;
      into[i] = Math.min(1, incomingCurve * 1.08);
    }
    const outgoingLow = outgoing.lowEq.gain.value;
    const incomingLow = incoming.lowEq.gain.value;
    outgoing.lowEq.gain.cancelScheduledValues(start);
    incoming.lowEq.gain.cancelScheduledValues(start);
    outgoing.lowEq.gain.setValueAtTime(outgoingLow, start);
    outgoing.lowEq.gain.linearRampToValueAtTime(
      3,
      start + durationSeconds * 0.35,
    );
    outgoing.lowEq.gain.linearRampToValueAtTime(
      -18,
      start + durationSeconds * 0.62,
    );
    incoming.lowEq.gain.setValueAtTime(-18, start);
    incoming.lowEq.gain.linearRampToValueAtTime(
      -12,
      start + durationSeconds * 0.42,
    );
    incoming.lowEq.gain.linearRampToValueAtTime(
      incomingLow,
      start + durationSeconds * 0.62,
    );
    outgoing.fadeGain.gain.cancelScheduledValues(start);
    incoming.fadeGain.gain.cancelScheduledValues(start);
    outgoing.fadeGain.gain.setValueCurveAtTime(out, start, durationSeconds);
    incoming.fadeGain.gain.setValueCurveAtTime(into, start, durationSeconds);
    if (this.transitionTimer) window.clearTimeout(this.transitionTimer);
    await new Promise<void>((resolve) => {
      this.transitionTimer = window.setTimeout(
        resolve,
        durationSeconds * 1000 + 50,
      );
    });
    outgoing.element.pause();
    outgoing.element.currentTime = 0;
    outgoing.lowEq.gain.cancelScheduledValues(this.context.currentTime);
    outgoing.lowEq.gain.value = outgoingLow;
    incoming.lowEq.gain.cancelScheduledValues(this.context.currentTime);
    incoming.lowEq.gain.value = incomingLow;
    stopBridge();
    this.transitionTimer = undefined;
    this.onChange();
  }

  private transitionFamily(genre?: string): TransitionGenreFamily {
    const value = (genre ?? "").toLocaleLowerCase("es");
    if (/cumbia|chicha|tropical|vallenato/.test(value)) return "cumbia";
    if (/rock|metal|punk|indie|grunge/.test(value)) return "rock";
    if (/reggaeton|reguet|urbano|dembow/.test(value)) return "dembow";
    if (/electro|house|techno|edm|dance|trance/.test(value))
      return "electronic";
    if (/salsa|merengue|bachata|latin/.test(value)) return "latin";
    return "neutral";
  }

  private startGenreTransitionFill(
    bpm: number,
    dropTime: number,
    style: number,
    incomingGenre?: string,
  ) {
    const family = this.transitionFamily(incomingGenre);
    if (family === "rock") {
      this.startRockTransitionFill(bpm, dropTime, style);
      return;
    }
    const beat = 60 / Math.max(70, Math.min(180, bpm));
    const start = dropTime - beat * 2;
    const bus = this.context.createGain();
    const limiter = this.context.createDynamicsCompressor();
    bus.gain.value = 0.11;
    limiter.threshold.value = -10;
    limiter.knee.value = 8;
    limiter.ratio.value = 9;
    limiter.attack.value = 0.003;
    limiter.release.value = beat * 0.4;
    bus.connect(limiter).connect(this.musicBus);
    const noiseBuffer = this.context.createBuffer(
      1,
      Math.ceil(this.context.sampleRate * 0.12),
      this.context.sampleRate,
    );
    const noiseData = noiseBuffer.getChannelData(0);
    for (let index = 0; index < noiseData.length; index += 1)
      noiseData[index] = Math.random() * 2 - 1;
    const hit = (
      time: number,
      frequency: number,
      level: number,
      length: number,
    ) => {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type =
        family === "cumbia" || family === "latin" ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency * 1.8, time);
      oscillator.frequency.exponentialRampToValueAtTime(
        frequency,
        time + length * 0.6,
      );
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(level, time + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
      oscillator.connect(gain).connect(bus);
      oscillator.start(time);
      oscillator.stop(time + length + 0.02);
    };
    const noiseHit = (time: number, highpass: number, level: number) => {
      const source = this.context.createBufferSource();
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      source.buffer = noiseBuffer;
      filter.type = "highpass";
      filter.frequency.value = highpass;
      gain.gain.setValueAtTime(level, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);
      source.connect(filter).connect(gain).connect(bus);
      source.start(time);
      source.stop(time + 0.1);
    };
    for (let step = 0; step < 8; step += 1) {
      const time = start + step * (beat / 2);
      if (family === "cumbia") {
        if (step % 2 === 0) hit(time, 62, 0.48, 0.18);
        else hit(time, step === 3 || step === 7 ? 175 : 135, 0.2, 0.1);
        noiseHit(time + beat * 0.22, 4800, 0.045);
      } else if (family === "latin") {
        hit(
          time,
          step % 3 === 0 ? 72 : 155,
          step % 3 === 0 ? 0.42 : 0.18,
          0.14,
        );
        if (step % 2) noiseHit(time, 3600, 0.055);
      } else if (family === "dembow") {
        if ([0, 3, 4, 6].includes(step)) hit(time, 52, 0.5, 0.2);
        if ([2, 5].includes(step)) noiseHit(time, 1500, 0.11);
      } else if (family === "electronic") {
        if (step % 2 === 0) hit(time, 48, 0.55, 0.2);
        else noiseHit(time, 7000, 0.065);
      } else {
        if (step % 2 === 0) hit(time, 55, 0.42, 0.18);
        else noiseHit(time, 5200, 0.045);
      }
    }
    window.setTimeout(
      () => {
        bus.disconnect();
        limiter.disconnect();
      },
      beat * 4.5 * 1000,
    );
  }

  async smartTransition(
    from: DeckId,
    to: DeckId,
    outgoingBpm = 120,
    incomingBpm = 120,
    outgoingGenre?: string,
    incomingGenre?: string,
    outgoingAnalysis?: TransitionTrackAnalysis,
    incomingAnalysis?: TransitionTrackAnalysis,
  ) {
    const outgoing = this.decks[from];
    const incoming = this.decks[to];
    if (incoming.element.readyState < HTMLMediaElement.HAVE_FUTURE_DATA)
      throw new Error(`Deck ${to} no está precargado`);

    await this.context.resume();
    // Si el operador ya marcó un Hot Cue en el deck entrante (el drop, el
    // hook), Auto Mix arranca la mezcla ahí en vez del primer downbeat
    // crudo — el mismo criterio que usaría un DJ eligiendo dónde traer la
    // siguiente pista.
    const targetHotCues = Object.entries(incoming.hotCues)
      .map(([slot, time]) => ({ slot: Number(slot), time }))
      .sort((a, b) => a.slot - b.slot);
    const targetHotCue = targetHotCues[0]?.time;
    // Auto Mix no modifica el tempo/pitch del deck entrante. El playbackRate
    // queda bajo control exclusivo del pitch fader manual de cada consola.
    const plan = this.transitionEngine.prepareTransition({
      sourceDeck: from,
      targetDeck: to,
      sourcePosition: outgoing.element.currentTime,
      targetPosition: incoming.element.currentTime,
      sourceBpm: outgoingBpm,
      targetBpm: incomingBpm,
      sourceAnalysis: outgoingAnalysis,
      targetAnalysis: incomingAnalysis,
      targetHotCue,
      genreFamily: this.transitionFamily(incomingGenre),
    });
    incoming.element.currentTime = Math.min(
      Math.max(0, plan.targetStartTime),
      Math.max(0, (incoming.element.duration || 0) - 1),
    );
    this.onTransitionDebug?.({
      ...plan,
      state: "SYNCING",
      bassA: from === "A" ? 1 : 0.08,
      bassB: from === "B" ? 1 : 0.08,
      beatSync: true,
      downbeatSync: true,
      phraseSync: !plan.fallback,
      bassSwapArmed: true,
      message: `${outgoingGenre ?? "General"} → ${incomingGenre ?? "General"}`,
    });
    await this.transitionEngine.executeTransition({
      plan,
      source: {
        fade: outgoing.fadeGain.gain,
        low: outgoing.lowEq.gain,
        mid: outgoing.midEq.gain,
        high: outgoing.highEq.gain,
        filter: outgoing.colorFilter,
        fxSend: outgoing.fxSend.gain,
      },
      target: {
        fade: incoming.fadeGain.gain,
        low: incoming.lowEq.gain,
        mid: incoming.midEq.gain,
        high: incoming.highEq.gain,
        filter: incoming.colorFilter,
        fxSend: incoming.fxSend.gain,
      },
      fxBus: { delayWet: this.delayWet.gain, reverbWet: this.reverbWet.gain },
      playTarget: () => incoming.element.play(),
      stopSource: () => {
        outgoing.element.pause();
        outgoing.element.currentTime = 0;
      },
      onDebug: this.onTransitionDebug,
    });
    this.onChange();
  }

  snapshot(id: DeckId): DeckSnapshot {
    const d = this.decks[id];
    d.analyser.getByteTimeDomainData(d.meterData);
    let peak = 0;
    for (const sample of d.meterData)
      peak = Math.max(peak, Math.abs(sample - 128) / 128);
    const duration = Number.isFinite(d.element.duration)
      ? d.element.duration
      : 0;
    const end = d.element.buffered.length
      ? d.element.buffered.end(d.element.buffered.length - 1)
      : 0;
    return {
      ready: d.element.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA,
      playing: !d.element.paused,
      currentTime: d.element.currentTime || 0,
      duration,
      buffered: duration ? Math.min(1, end / duration) : 0,
      playbackRate: d.element.playbackRate,
      peak,
      name: d.name,
      error: d.error,
    };
  }
  waveform(id: DeckId): DeckWaveform {
    const d = this.decks[id];
    d.analyser.getByteTimeDomainData(d.meterData);
    const samples = Array.from(d.meterData)
      .filter((_, index) => index % 2 === 0)
      .map((sample) => Math.min(1, Math.abs(sample - 128) / 64));
    const duration = Number.isFinite(d.element.duration)
      ? d.element.duration
      : 0;
    const end = d.element.buffered.length
      ? d.element.buffered.end(d.element.buffered.length - 1)
      : 0;
    return {
      samples,
      currentTime: d.element.currentTime || 0,
      duration,
      buffered: duration ? Math.min(1, end / duration) : 0,
      playing: !d.element.paused,
    };
  }
  dispose() {
    this.transitionEngine.cancelTransition();
    if (this.transitionTimer) window.clearTimeout(this.transitionTimer);
    for (const id of Object.keys(this.decks) as DeckId[]) {
      const deck = this.decks[id];
      deck.element.pause();
      if (deck.stallTimer) window.clearTimeout(deck.stallTimer);
      if (deck.url?.startsWith("blob:")) URL.revokeObjectURL(deck.url);
      const bendTimer = this.jogBendTimer[id];
      if (bendTimer) window.clearTimeout(bendTimer);
    }
    this.jingleElement.pause();
    if (this.jingleUrl) URL.revokeObjectURL(this.jingleUrl);
    void this.context.close();
  }
}
