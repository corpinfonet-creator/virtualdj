import { cookies } from "next/headers";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db/prisma";
import { apiError } from "@/server/http/api-error";
import { resolveDriveUserId } from "@/server/providers/drive-slots";
import {
  listDriveAudioFiles,
  inspectDriveFolder,
  openDriveTokens,
  refreshDriveTokens,
  sealDriveTokens,
  type DriveSlot,
} from "@/server/providers/google-drive";

export const runtime = "nodejs";

function metadata(name: string) {
  const base = name.replace(/\.[^.]+$/, "").trim();
  const parts = base.split(" - ");
  return parts.length > 1
    ? {
        artist: parts[0].trim() || "Artista desconocido",
        title: parts.slice(1).join(" - ").trim() || base,
      }
    : { artist: "Artista desconocido", title: base || name };
}

export async function POST(request: Request) {
  let failedSync:
    { tenantId: string; userId: string; slot: DriveSlot } | undefined;
  try {
    const session = await requireSession();
    const userId = await resolveDriveUserId(session);
    const requested = new URL(request.url).searchParams.get("drive");
    const slot: DriveSlot =
      requested === "02" || requested === "03" ? requested : "01";
    failedSync = {
      tenantId: session.tenantId,
      userId,
      slot,
    };
    const jar = await cookies();
    const encrypted = jar.get("autodj_drive")?.value;
    if (!encrypted) throw new Error("DRIVE_NOT_CONNECTED");
    const previous = await openDriveTokens(encrypted);
    const tokens = await refreshDriveTokens(previous);
    if (
      tokens.accessToken !== previous.accessToken ||
      tokens.refreshToken !== previous.refreshToken
    )
      jar.set("autodj_drive", await sealDriveTokens(tokens), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 2_592_000,
        path: "/",
      });
    const storagePrefix = slot === "01" ? "drive:" : `drive${slot}:`;
    const folderId = new URL(request.url).searchParams.get("folderId")?.trim();
    if (!folderId)
      return Response.json({ error: "FOLDER_ID_REQUIRED" }, { status: 400 });
    const folder = await inspectDriveFolder(tokens.accessToken, slot, folderId);
    // Persistimos el estado antes de recorrer Drive. En carpetas grandes, la
    // enumeración puede tardar y la UI debe seguir viendo el slot conectado.
    await db().driveSlotConfig.upsert({
      where: {
        tenantId_userId_slot: {
          tenantId: session.tenantId,
          userId,
          slot,
        },
      },
      create: {
        tenantId: session.tenantId,
        userId,
        slot,
        folderId,
        folderName: folder.name ?? `Drive ${slot}`,
        syncStatus: "syncing",
        syncProcessed: 0,
        syncTotal: 0,
        syncError: null,
        syncStartedAt: new Date(),
      },
      update: {
        folderId,
        folderName: folder.name ?? `Drive ${slot}`,
        syncStatus: "syncing",
        syncProcessed: 0,
        syncTotal: 0,
        syncError: null,
        syncStartedAt: new Date(),
      },
    });
    const files = await listDriveAudioFiles(tokens.accessToken, slot, folderId);
    const replace = new URL(request.url).searchParams.get("replace") === "1";
    let removed = 0;
    if (replace) {
      const result = await db().track.deleteMany({
        where: {
          tenantId: session.tenantId,
          assets: { some: { storageKey: { startsWith: storagePrefix } } },
        },
      });
      removed = result.count;
    }
    await db().driveSlotConfig.update({
      where: {
        tenantId_userId_slot: {
          tenantId: session.tenantId,
          userId,
          slot,
        },
      },
      data: { syncTotal: files.length },
    });
    const existingAssets = replace
      ? []
      : await db().audioAsset.findMany({
          where: {
            storageKey: { startsWith: storagePrefix },
            track: { tenantId: session.tenantId },
          },
          select: { storageKey: true, trackId: true },
        });
    const existingByKey = new Map(
      existingAssets.map((asset) => [asset.storageKey, asset.trackId]),
    );
    const existingFiles = files.filter((file) =>
      existingByKey.has(`${storagePrefix}${file.id}`),
    );
    const newFiles = files.filter(
      (file) => !existingByKey.has(`${storagePrefix}${file.id}`),
    );
    let processed = existingFiles.length;
    await db().driveSlotConfig.update({
      where: {
        tenantId_userId_slot: {
          tenantId: session.tenantId,
          userId,
          slot,
        },
      },
      data: { syncProcessed: processed },
    });
    for (let offset = 0; offset < existingFiles.length; offset += 25) {
      await Promise.all(
        existingFiles.slice(offset, offset + 25).map((file) =>
          db().track.update({
            where: { id: existingByKey.get(`${storagePrefix}${file.id}`)! },
            data: {
              genre: file.genre ?? "General",
              subgenre: file.folderPath || null,
            },
          }),
        ),
      );
    }
    for (let offset = 0; offset < newFiles.length; offset += 12) {
      const batch = newFiles.slice(offset, offset + 12);
      await Promise.all(
        batch.map((file) => {
          const parsed = metadata(file.name);
          return db()
            .track.create({
              data: {
                tenantId: session.tenantId,
                title: parsed.title,
                artist: parsed.artist,
                genre: file.genre ?? "General",
                subgenre: file.folderPath || null,
                durationMs: 180_000,
                assets: {
                  create: {
                    storageKey: `${storagePrefix}${file.id}`,
                    sha256: `drive-${slot}-${file.id}`,
                    mimeType: file.mimeType || "audio/mpeg",
                    status: "READY",
                    offlineAllowed: false,
                    licenseEvidence: {
                      type: "EXTERNAL_DRIVE",
                      reference: file.webViewLink ?? file.id,
                      assertedBy: userId,
                      assertedAt: new Date().toISOString(),
                      originalName: file.name,
                    },
                  },
                },
              },
            })
            .catch((error: unknown) => {
              // Otra sincronización de la misma ranura pudo insertar este
              // fileId entre la lectura y la creación. La restricción única
              // garantiza una sola pista; ese caso se considera ya existente.
              if (
                typeof error === "object" &&
                error &&
                "code" in error &&
                error.code === "P2002"
              )
                return null;
              throw error;
            });
        }),
      );
      processed += batch.length;
      await db().driveSlotConfig.update({
        where: {
          tenantId_userId_slot: {
            tenantId: session.tenantId,
            userId,
            slot,
          },
        },
        data: { syncProcessed: processed, trackCount: processed },
      });
    }
    const created = newFiles.length;
    const existing = existingFiles.length;
    await db().driveSlotConfig.upsert({
      where: {
        tenantId_userId_slot: {
          tenantId: session.tenantId,
          userId,
          slot,
        },
      },
      create: {
        tenantId: session.tenantId,
        userId,
        slot,
        folderId,
        folderName: folder.name ?? `Drive ${slot}`,
        trackCount: files.length,
        lastSyncAt: new Date(),
      },
      update: {
        folderId,
        folderName: folder.name ?? `Drive ${slot}`,
        trackCount: files.length,
        syncStatus: "connected",
        syncProcessed: files.length,
        syncTotal: files.length,
        syncError: null,
        lastSyncAt: new Date(),
      },
    });
    return Response.json({
      data: {
        drive: slot,
        folderId,
        folderName: folder.name,
        discovered: files.length,
        created,
        existing,
        removed,
      },
    });
  } catch (error) {
    if (failedSync) {
      const message = error instanceof Error ? error.message : "SYNC_FAILED";
      await db()
        .driveSlotConfig.updateMany({
          where: {
            tenantId: failedSync.tenantId,
            userId: failedSync.userId,
            slot: failedSync.slot,
          },
          data: { syncStatus: "error", syncError: message.slice(0, 500) },
        })
        .catch(() => undefined);
    }
    return apiError(error);
  }
}
