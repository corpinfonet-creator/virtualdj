import { cookies } from "next/headers";
import { requireSession } from "@/server/auth/session";
import { apiError } from "@/server/http/api-error";
import { openDriveTokens } from "@/server/providers/google-drive";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSession();
    const encrypted = (await cookies()).get("autodj_drive")?.value;
    if (!encrypted)
      return Response.json({ data: { connected: false } }, { status: 401 });
    await openDriveTokens(encrypted);
    return Response.json({ data: { connected: true } });
  } catch (error) {
    return apiError(error);
  }
}
