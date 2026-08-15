import { cookies } from "next/headers";
import { requireSession } from "@/server/auth/session";
import { apiError } from "@/server/http/api-error";
import { db } from "@/server/db/prisma";
import {
  removeDriveSlot,
  resolveDriveUserId,
  validDriveSlot,
} from "@/server/providers/drive-slots";
import {
  inspectDriveFolder,
  openDriveTokens,
  refreshDriveTokens,
  sealDriveTokens,
} from "@/server/providers/google-drive";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slot: string }> },
) {
  try {
    const session = await requireSession();
    const userId = await resolveDriveUserId(session);
    const slot = validDriveSlot((await params).slot);
    const body = (await request.json()) as {
      folderId?: string;
      folderName?: string;
      persist?: boolean;
    };
    const folderId = body.folderId?.trim();
    if (!folderId || !/^[a-zA-Z0-9_-]{10,}$/.test(folderId))
      return Response.json({ error: "INVALID_FOLDER_ID" }, { status: 400 });
    const confirmedFolderName = body.folderName?.trim().slice(0, 240);
    if (body.persist && confirmedFolderName) {
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
          folderName: confirmedFolderName,
          syncStatus: "syncing",
          syncProcessed: 0,
          syncTotal: 0,
          syncStartedAt: new Date(),
        },
        update: {
          folderId,
          folderName: confirmedFolderName,
          syncStatus: "syncing",
          syncProcessed: 0,
          syncTotal: 0,
          syncError: null,
          syncStartedAt: new Date(),
        },
      });
      return Response.json({
        data: { slot, id: folderId, name: confirmedFolderName },
      });
    }
    const jar = await cookies();
    const encrypted = jar.get("autodj_drive")?.value;
    if (!encrypted)
      return Response.json({ error: "DRIVE_NOT_CONNECTED" }, { status: 401 });
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
    const folder = await inspectDriveFolder(tokens.accessToken, slot, folderId);
    if (body.persist) {
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
    }
    return Response.json({ data: { slot, ...folder } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "DRIVE_ERROR";
    if (
      message.includes("DRIVE") ||
      message.includes("Google") ||
      message.includes("token") ||
      message.includes("Token") ||
      message.includes("invalid_grant")
    )
      return Response.json(
        { error: "GOOGLE_DRIVE_ERROR", message },
        { status: 502 },
      );
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : undefined;
    return Response.json(
      {
        error: "DRIVE_SLOT_SAVE_FAILED",
        message: code ? `${code}: ${message}` : message,
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slot: string }> },
) {
  try {
    const session = await requireSession();
    if (session.role === "OPERATOR")
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    const slot = validDriveSlot((await params).slot);
    const removed = await removeDriveSlot(session, slot);
    return Response.json({ data: { slot, removed } });
  } catch (error) {
    return apiError(error);
  }
}
