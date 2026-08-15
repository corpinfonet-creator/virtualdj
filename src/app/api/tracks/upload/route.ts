import { createHash, randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { detectAudioSignature } from "@/server/audio/signature";
import { db } from "@/server/db/prisma";
import { apiError } from "@/server/http/api-error";

export const runtime = "nodejs";

const metadataSchema = z.object({
  title: z.string().trim().min(1).max(180), artist: z.string().trim().min(1).max(180),
  genre: z.string().trim().max(80).optional(), durationMs: z.coerce.number().int().min(1_000).max(21_600_000),
  licenseType: z.enum(["OWNED", "LICENSED", "ROYALTY_FREE", "PUBLIC_DOMAIN"]),
  licenseReference: z.string().trim().min(3).max(500),
});

export async function POST(request: Request) {
  let writtenPath: string | undefined;
  try {
    const session = await requireSession();
    if (session.role === "OPERATOR") return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "AUDIO_FILE_REQUIRED" }, { status: 400 });
    if (file.size > 250 * 1024 * 1024) return Response.json({ error: "FILE_TOO_LARGE", maxMb: 250 }, { status: 413 });
    const metadata = metadataSchema.parse(Object.fromEntries([...form.entries()].filter(([key]) => key !== "file")));
    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = detectAudioSignature(bytes);
    if (!detected) return Response.json({ error: "UNSUPPORTED_AUDIO", accepted: ["MP3", "WAV", "FLAC", "OGG", "M4A"] }, { status: 415 });
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const duplicate = await db().audioAsset.findFirst({ where: { sha256, track: { tenantId: session.tenantId } }, select: { id: true, trackId: true } });
    if (duplicate) return Response.json({ error: "DUPLICATE_AUDIO", existing: duplicate }, { status: 409 });

    const relativeKey = path.posix.join("quarantine", session.tenantId, `${randomUUID()}.${detected.extension}`);
    const root = path.resolve(process.cwd(), "uploads");
    writtenPath = path.resolve(root, ...relativeKey.split("/"));
    if (!writtenPath.startsWith(`${root}${path.sep}`)) throw new Error("INVALID_STORAGE_PATH");
    await mkdir(path.dirname(writtenPath), { recursive: true });
    await writeFile(writtenPath, bytes, { flag: "wx" });

    const track = await db().$transaction(async tx => tx.track.create({
      data: {
        tenantId: session.tenantId, title: metadata.title, artist: metadata.artist, genre: metadata.genre, durationMs: metadata.durationMs,
        assets: { create: { storageKey: relativeKey, sha256, mimeType: detected.mime, status: "QUARANTINED", licenseEvidence: { type: metadata.licenseType, reference: metadata.licenseReference, assertedBy: session.sub, assertedAt: new Date().toISOString(), originalName: file.name }, offlineAllowed: true } },
      }, include: { assets: true },
    }));
    return Response.json({ data: track, message: "Archivo recibido en cuarentena para análisis." }, { status: 201 });
  } catch (error) {
    if (writtenPath) await unlink(writtenPath).catch(() => undefined);
    return apiError(error);
  }
}
