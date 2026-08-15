import { z } from "zod";

export const createTrackSchema = z.object({
  title: z.string().trim().min(1).max(180),
  artist: z.string().trim().min(1).max(180),
  genre: z.string().trim().max(80).optional(),
  durationMs: z.number().int().min(1_000).max(21_600_000),
});
