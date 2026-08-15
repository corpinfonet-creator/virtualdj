export type SupportedAudio = { extension: "mp3" | "wav" | "flac" | "ogg" | "m4a"; mime: string };

export function detectAudioSignature(bytes: Uint8Array): SupportedAudio | null {
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  if (ascii(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return { extension: "mp3", mime: "audio/mpeg" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return { extension: "wav", mime: "audio/wav" };
  if (ascii(0, 4) === "fLaC") return { extension: "flac", mime: "audio/flac" };
  if (ascii(0, 4) === "OggS") return { extension: "ogg", mime: "audio/ogg" };
  if (ascii(4, 4) === "ftyp") return { extension: "m4a", mime: "audio/mp4" };
  return null;
}
