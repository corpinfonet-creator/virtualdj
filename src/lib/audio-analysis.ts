export type EnergyPoint = { timeMs: number; energy: number };
export type AudioAnalysis = {
  bpm: number;
  bpmConfidence: number;
  key: string;
  keyConfidence: number;
  energy: number;
  loudnessLufs: number;
  peak: number;
  waveform: number[];
  cuePoints: {
    introEndMs: number;
    outroStartMs: number;
    dropMs: number;
    energyProfile: EnergyPoint[];
  };
  beatgrid: {
    firstBeatMs: number;
    beatIntervalMs: number;
    beatsMs: number[];
    downbeatsMs: number[];
    confidence: number;
  };
};

export async function analyzeAudioFile(
  source: File | string,
): Promise<AudioAnalysis> {
  const context = new AudioContext();
  try {
    const encoded =
      typeof source === "string"
        ? await fetch(source, { cache: "no-store" }).then((response) => {
            if (!response.ok)
              throw new Error("No se pudo descargar la pista para analizarla");
            return response.arrayBuffer();
          })
        : await source.arrayBuffer();
    const buffer = await context.decodeAudioData(encoded);
    const targetRate = 11025,
      ratio = Math.max(1, Math.floor(buffer.sampleRate / targetRate)),
      length = Math.ceil(buffer.length / ratio),
      mono = new Float32Array(length);
    for (let output = 0, input = 0; output < length; output++, input += ratio) {
      let value = 0;
      for (let channel = 0; channel < buffer.numberOfChannels; channel++)
        value +=
          buffer.getChannelData(channel)[Math.min(input, buffer.length - 1)] /
          buffer.numberOfChannels;
      mono[output] = value;
    }
    const worker = new Worker(
      new URL("../workers/audio-analysis.worker.ts", import.meta.url),
    );
    return await new Promise<AudioAnalysis>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        worker.terminate();
        reject(new Error("El análisis excedió el tiempo permitido"));
      }, 120000);
      worker.onmessage = (event) => {
        window.clearTimeout(timeout);
        worker.terminate();
        resolve(event.data as AudioAnalysis);
      };
      worker.onerror = () => {
        window.clearTimeout(timeout);
        worker.terminate();
        reject(new Error("Falló el worker de análisis"));
      };
      worker.postMessage(
        { samples: mono, sampleRate: buffer.sampleRate / ratio },
        [mono.buffer],
      );
    });
  } finally {
    await context.close();
  }
}
