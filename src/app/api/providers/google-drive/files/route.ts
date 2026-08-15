import { cookies } from "next/headers";
import { requireSession } from "@/server/auth/session";
import { apiError } from "@/server/http/api-error";
import {
  listDriveAudioFiles,
  openDriveTokens,
  type DriveSlot,
} from "@/server/providers/google-drive";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireSession();
    const encrypted = (await cookies()).get("autodj_drive")?.value;
    if (!encrypted)
      return Response.json({ error: "DRIVE_NOT_CONNECTED" }, { status: 401 });
    const tokens = await openDriveTokens(encrypted);
    const requested = new URL(request.url).searchParams.get("drive");
    const slot: DriveSlot =
      requested === "02" || requested === "03" ? requested : "01";
    const folderId = new URL(request.url).searchParams.get("folderId")?.trim();
    return Response.json({
      data: await listDriveAudioFiles(tokens.accessToken, slot, folderId),
      meta: { drive: slot },
    });
  } catch (error) {
    return apiError(error);
  }
}
