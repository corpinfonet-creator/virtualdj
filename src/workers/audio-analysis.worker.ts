type RequestMessage = { samples: Float32Array; sampleRate: number };

function analyzeBpm(samples: Float32Array, sampleRate: number) {
  const hop = 512,
    frame = 1024,
    envelope: number[] = [];
  let previous = 0;
  for (let start = 0; start + frame < samples.length; start += hop) {
    let sum = 0;
    for (let i = 0; i < frame; i++) {
      const v = samples[start + i];
      sum += v * v;
    }
    const energy = Math.sqrt(sum / frame);
    envelope.push(Math.max(0, energy - previous));
    previous = energy;
  }
  let bestBpm = 100,
    best = 0,
    second = 0;
  for (let bpm = 70; bpm <= 180; bpm += 0.25) {
    const lag = Math.round((60 * sampleRate) / (bpm * hop));
    let score = 0,
      normA = 0,
      normB = 0;
    for (let i = lag; i < envelope.length; i++) {
      score += envelope[i] * envelope[i - lag];
      normA += envelope[i] ** 2;
      normB += envelope[i - lag] ** 2;
    }
    score /= Math.sqrt(normA * normB) || 1;
    if (score > best) {
      second = best;
      best = score;
      bestBpm = bpm;
    } else if (score > second) second = score;
  }
  return {
    bpm: Math.round(bestBpm * 100) / 100,
    confidence: Math.max(
      0,
      Math.min(1, best > 0 ? ((best - second) / best) * 4 : 0),
    ),
    onset: envelope,
    hop,
  };
}

function analyzeStructure(
  samples: Float32Array,
  sampleRate: number,
  bpmResult: ReturnType<typeof analyzeBpm>,
) {
  const durationMs = (samples.length / sampleRate) * 1000,
    beatIntervalMs = 60000 / bpmResult.bpm,
    hopMs = (bpmResult.hop / sampleRate) * 1000,
    onset = bpmResult.onset;
  let phase = 0,
    phaseScore = -1;
  const phaseSteps = Math.max(8, Math.round(beatIntervalMs / hopMs));
  for (let candidate = 0; candidate < phaseSteps; candidate++) {
    let score = 0;
    for (let frame = candidate; frame < onset.length; frame += phaseSteps)
      score += onset[frame];
    if (score > phaseScore) {
      phaseScore = score;
      phase = candidate * hopMs;
    }
  }
  const beatsMs: number[] = [];
  for (
    let time = phase;
    time < durationMs && beatsMs.length < 5000;
    time += beatIntervalMs
  )
    beatsMs.push(Math.round(time));
  let downbeatOffset = 0,
    downbeatScore = -1;
  for (let offset = 0; offset < 4; offset++) {
    let score = 0;
    for (let i = offset; i < beatsMs.length; i += 4)
      score +=
        onset[Math.min(onset.length - 1, Math.round(beatsMs[i] / hopMs))] ?? 0;
    if (score > downbeatScore) {
      downbeatScore = score;
      downbeatOffset = offset;
    }
  }
  const downbeatsMs = beatsMs.filter(
    (_, index) => index % 4 === downbeatOffset,
  );
  const bucketMs = 4000,
    energyProfile: { timeMs: number; energy: number }[] = [],
    raw: number[] = [];
  for (
    let start = 0;
    start < samples.length;
    start += Math.round((sampleRate * bucketMs) / 1000)
  ) {
    let sum = 0;
    const end = Math.min(
      samples.length,
      start + Math.round((sampleRate * bucketMs) / 1000),
    );
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    raw.push(Math.sqrt(sum / Math.max(1, end - start)));
  }
  const maximum = Math.max(...raw, 1e-6);
  raw.forEach((value, index) =>
    energyProfile.push({
      timeMs: index * bucketMs,
      energy: Math.round((value / maximum) * 1000) / 1000,
    }),
  );
  const sustained = (from: number, direction: 1 | -1) => {
    for (let i = from; i >= 0 && i < raw.length; i += direction) {
      const neighborhood = raw.slice(
        Math.max(0, i - 1),
        Math.min(raw.length, i + 2),
      );
      if (neighborhood.every((value) => value / maximum > 0.28))
        return i * bucketMs;
    }
    return direction === 1 ? 0 : Math.max(0, durationMs - 32000);
  };
  const introEndMs = sustained(0, 1),
    outroStartMs = sustained(raw.length - 1, -1);
  let dropIndex = 0,
    dropRise = -Infinity;
  for (let i = 1; i < raw.length; i++) {
    const rise = raw[i] - raw[i - 1];
    if (rise > dropRise && i * bucketMs < durationMs * 0.75) {
      dropRise = rise;
      dropIndex = i;
    }
  }
  return {
    cuePoints: {
      introEndMs: Math.round(introEndMs),
      outroStartMs: Math.round(Math.max(introEndMs, outroStartMs)),
      dropMs: dropIndex * bucketMs,
      energyProfile,
    },
    beatgrid: {
      firstBeatMs: beatsMs[0] ?? 0,
      beatIntervalMs: Math.round(beatIntervalMs * 1000) / 1000,
      beatsMs,
      downbeatsMs,
      confidence: bpmResult.confidence,
    },
  };
}

const majorProfile = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const minorProfile = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];
const camelotMajor = [
  "8B",
  "3B",
  "10B",
  "5B",
  "12B",
  "7B",
  "2B",
  "9B",
  "4B",
  "11B",
  "6B",
  "1B",
];
const camelotMinor = [
  "5A",
  "12A",
  "7A",
  "2A",
  "9A",
  "4A",
  "11A",
  "6A",
  "1A",
  "8A",
  "3A",
  "10A",
];

function goertzel(frame: Float32Array, sampleRate: number, frequency: number) {
  const w = (2 * Math.PI * frequency) / sampleRate,
    coeff = 2 * Math.cos(w);
  let s0 = 0,
    s1 = 0,
    s2 = 0;
  for (const value of frame) {
    s0 = value + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2);
}
function analyzeKey(samples: Float32Array, sampleRate: number) {
  const chroma = new Array(12).fill(0),
    size = 2048,
    maxFrames = 120,
    step = Math.max(size, Math.floor((samples.length - size) / maxFrames));
  for (let start = 0; start + size < samples.length; start += step) {
    const frame = samples.slice(start, start + size);
    for (let pc = 0; pc < 12; pc++) {
      for (let octave = 3; octave <= 6; octave++) {
        const midi = 12 * (octave + 1) + pc;
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        if (freq < sampleRate / 2)
          chroma[pc] += goertzel(frame, sampleRate, freq);
      }
    }
  }
  const total = chroma.reduce((a, b) => a + b, 0) || 1;
  for (let i = 0; i < 12; i++) chroma[i] /= total;
  const scores: { score: number; pc: number; minor: boolean }[] = [];
  for (let root = 0; root < 12; root++) {
    for (const minor of [false, true]) {
      const profile = minor ? minorProfile : majorProfile;
      let score = 0;
      for (let i = 0; i < 12; i++)
        score += chroma[(i + root) % 12] * profile[i];
      scores.push({ score, pc: root, minor });
    }
  }
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0],
    second = scores[1];
  return {
    key: (best.minor ? camelotMinor : camelotMajor)[best.pc],
    confidence: Math.max(
      0,
      Math.min(1, ((best.score - second.score) / (best.score || 1)) * 8),
    ),
  };
}

self.onmessage = (event: MessageEvent<RequestMessage>) => {
  const { samples, sampleRate } = event.data;
  let sum = 0,
    peak = 0;
  for (const value of samples) {
    sum += value * value;
    peak = Math.max(peak, Math.abs(value));
  }
  const meanSquare = sum / (samples.length || 1),
    rms = Math.sqrt(meanSquare);
  const bins = 160,
    waveform: number[] = [];
  for (let bin = 0; bin < bins; bin++) {
    const from = Math.floor((bin * samples.length) / bins),
      to = Math.floor(((bin + 1) * samples.length) / bins);
    let value = 0;
    for (let i = from; i < to; i++)
      value = Math.max(value, Math.abs(samples[i]));
    waveform.push(value);
  }
  const bpm = analyzeBpm(samples, sampleRate),
    key = analyzeKey(samples, sampleRate),
    structure = analyzeStructure(samples, sampleRate, bpm);
  self.postMessage({
    bpm: bpm.bpm,
    bpmConfidence: bpm.confidence,
    key: key.key,
    keyConfidence: key.confidence,
    energy: Math.max(0, Math.min(1, rms * 4)),
    loudnessLufs: -0.691 + 10 * Math.log10(meanSquare || 1e-12),
    peak,
    waveform,
    ...structure,
  });
};
