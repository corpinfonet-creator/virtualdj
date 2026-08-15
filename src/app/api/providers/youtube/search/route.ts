import { requireSession } from "@/server/auth/session";
import { searchYouTubeMusic } from "@/server/providers/youtube";

export const dynamic = "force-dynamic";
const attempts = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(key: string) {
  const now = Date.now(); const current = attempts.get(key);
  if (!current || current.resetAt <= now) { attempts.set(key, { count: 1, resetAt: now + 60_000 }); return false; }
  return ++current.count > 10;
}
export async function GET(request: Request) {
  try {
    const session = await requireSession();
    if (isRateLimited(`${session.tenantId}:${session.sub}`)) return Response.json({ error: "Demasiadas búsquedas. Espera un minuto." }, { status: 429 });
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (query.length < 2 || query.length > 100) return Response.json({ error: "La búsqueda debe contener entre 2 y 100 caracteres." }, { status: 400 });
    return Response.json({ data: await searchYouTubeMusic(query) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message === "UNAUTHORIZED" || message === "INVALID_SESSION") return Response.json({ error: "Sesión requerida." }, { status: 401 });
    if (message === "YOUTUBE_NOT_CONFIGURED") return Response.json({ error: "YouTube aún no está configurado en el servidor.", code: message }, { status: 503 });
    console.error("YouTube discovery error", error);
    return Response.json({ error: "YouTube no respondió. La reproducción local continúa sin interrupciones." }, { status: 502 });
  }
}
