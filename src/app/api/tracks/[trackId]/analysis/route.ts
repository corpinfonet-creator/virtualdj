import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db/prisma";
import { apiError } from "@/server/http/api-error";
import { z } from "zod";

const energyPointSchema = z.object({
  timeMs: z.number().int().nonnegative(),
  energy: z.number().min(0).max(1),
});

const analysisSchema = z.object({
  bpm: z.number().min(40).max(240),
  bpmConfidence: z.number().min(0).max(1),
  key: z.string().regex(/^(?:[1-9]|1[0-2])[AB]$/),
  keyConfidence: z.number().min(0).max(1),
  energy: z.number().min(0).max(1),
  loudnessLufs: z.number().min(-70).max(3),
  peak: z.number().min(0),
  waveform: z.array(z.number().min(0)).max(512),
  cuePoints: z.object({
    introEndMs: z.number().int().nonnegative(),
    outroStartMs: z.number().int().nonnegative(),
    dropMs: z.number().int().nonnegative(),
    energyProfile: z.array(energyPointSchema).max(5_400),
  }),
  beatgrid: z.object({
    firstBeatMs: z.number().int().nonnegative(),
    beatIntervalMs: z.number().positive(),
    beatsMs: z.array(z.number().int().nonnegative()).max(5_000),
    downbeatsMs: z.array(z.number().int().nonnegative()).max(1_250),
    confidence: z.number().min(0).max(1),
  }),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ trackId: string }> },
) {
  try {
    const session = await requireSession();
    const { trackId } = await params;
    const track = await db().track.findFirst({
      where: { id: trackId, tenantId: session.tenantId },
      select: { id: true },
    });
    if (!track)
      return Response.json({ error: "TRACK_NOT_FOUND" }, { status: 404 });
    const body = analysisSchema.parse(await request.json());
    const values = {
      bpm: body.bpm,
      bpmConfidence: body.bpmConfidence,
      musicalKey: body.key,
      keyConfidence: body.keyConfidence,
      energy: body.energy,
      loudnessLufs: body.loudnessLufs,
      truePeakDb: 20 * Math.log10(Math.max(body.peak, 1e-8)),
      cueInMs: body.cuePoints.introEndMs,
      transitionOutMs: body.cuePoints.outroStartMs,
      cuePoints: body.cuePoints,
      beatgrid: body.beatgrid,
      waveform: { version: 2, peaks: body.waveform },
      analyzerVersion: "browser-professional-v2",
    };
    const analysis = await db().trackAnalysis.upsert({
      where: { trackId },
      create: { trackId, ...values },
      update: values,
    });
    return Response.json({ data: analysis });
  } catch (error) {
    return apiError(error);
  }
}
