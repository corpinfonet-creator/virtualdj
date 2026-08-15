import { db } from "@/server/db/prisma";
import type { SessionClaims } from "@/server/auth/session";
import type { DriveSlot } from "@/server/providers/google-drive";

export function driveStoragePrefix(slot: DriveSlot) {
  return slot === "01" ? "drive:" : `drive${slot}:`;
}

export function validDriveSlot(value: string | null): DriveSlot {
  return value === "02" || value === "03" ? value : "01";
}

export function driveSlotFromSource(value: string | null): DriveSlot | null {
  if (value === "drive01") return "01";
  if (value === "drive02") return "02";
  if (value === "drive03") return "03";
  return null;
}

export async function resolveDriveUserId(session: SessionClaims) {
  const user = await db().user.findFirst({
    where: {
      email: session.email.toLowerCase(),
      memberships: { some: { tenantId: session.tenantId } },
    },
    select: { id: true },
  });
  if (!user) throw new Error("DRIVE_SESSION_USER_NOT_FOUND");
  return user.id;
}

export async function listDriveSlots(session: SessionClaims) {
  const userId = await resolveDriveUserId(session);
  return db().driveSlotConfig.findMany({
    where: { tenantId: session.tenantId, userId },
    orderBy: { slot: "asc" },
  });
}

export async function removeDriveSlot(session: SessionClaims, slot: DriveSlot) {
  const userId = await resolveDriveUserId(session);
  const prefix = driveStoragePrefix(slot);
  const [, removed] = await db().$transaction([
    db().driveSlotConfig.deleteMany({
      where: { tenantId: session.tenantId, userId, slot },
    }),
    db().track.deleteMany({
      where: {
        tenantId: session.tenantId,
        assets: { some: { storageKey: { startsWith: prefix } } },
      },
    }),
  ]);
  return removed.count;
}
