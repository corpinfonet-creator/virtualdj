import { cookies } from "next/headers";
import { requireSession } from "@/server/auth/session";
import { apiError } from "@/server/http/api-error";
import { db } from "@/server/db/prisma";
import {
  driveStoragePrefix,
  listDriveSlots,
  resolveDriveUserId,
} from "@/server/providers/drive-slots";
import {
  inspectDriveFolder,
  inspectDriveRoot,
  openDriveTokens,
  refreshDriveTokens,
  sealDriveTokens,
} from "@/server/providers/google-drive";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireSession();
    const userId = await resolveDriveUserId(session);
    const jar = await cookies();
    const encrypted = jar.get("autodj_drive")?.value;
    let connected = false;
    let tokens: Awaited<ReturnType<typeof openDriveTokens>> | undefined;
    if (encrypted) {
      try {
        const previous = await openDriveTokens(encrypted);
        tokens = await refreshDriveTokens(previous);
        if (tokens.accessToken !== previous.accessToken)
          jar.set("autodj_drive", await sealDriveTokens(tokens), {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 2_592_000,
            path: "/",
          });
        connected = true;
      } catch {
        connected = false;
      }
    }
    let configured = await listDriveSlots(session);
    // Compatibilidad con instalaciones anteriores: OAuth y Drive 01 podían
    // existir antes de que se introdujera la tabla persistente de slots.
    if (connected && tokens && !configured.some((item) => item.slot === "01")) {
      try {
        const configuredFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
        const folder = configuredFolderId
          ? await inspectDriveFolder(
              tokens.accessToken,
              "01",
              configuredFolderId,
            )
          : await inspectDriveRoot(tokens.accessToken);
        const folderId = folder.id!;
        const trackCount = await db().track.count({
          where: {
            tenantId: session.tenantId,
            assets: {
              some: {
                storageKey: { startsWith: driveStoragePrefix("01") },
              },
            },
          },
        });
        await db().driveSlotConfig.create({
          data: {
            tenantId: session.tenantId,
            userId,
            slot: "01",
            folderId,
            folderName: folder.name ?? "Google Drive",
            trackCount,
            lastSyncAt: new Date(),
          },
        });
        configured = await listDriveSlots(session);
      } catch {
        // Si la carpeta histórica ya no es accesible, el slot permanece libre
        // y la UI permite vincular una nueva sin romper los otros slots.
      }
    }
    const slots = (["01", "02", "03"] as const).map((slot) => {
      const item = configured.find((candidate) => candidate.slot === slot);
      return item
        ? {
            slot,
            status:
              item.syncStatus === "syncing"
                ? ("syncing" as const)
                : item.syncStatus === "error"
                  ? ("error" as const)
                  : ("connected" as const),
            folderId: item.folderId,
            folderName: item.folderName,
            trackCount: item.trackCount,
            syncProcessed: item.syncProcessed,
            syncTotal: item.syncTotal,
            syncPercent: item.syncTotal
              ? Math.min(
                  100,
                  Math.round((item.syncProcessed / item.syncTotal) * 100),
                )
              : item.syncStatus === "connected"
                ? 100
                : 0,
            error: item.syncError,
            updatedAt: item.updatedAt.toISOString(),
            lastSyncAt: item.lastSyncAt?.toISOString(),
          }
        : { slot, status: "empty" as const, trackCount: 0 };
    });
    return Response.json({ data: { connected, slots } });
  } catch (error) {
    return apiError(error);
  }
}
