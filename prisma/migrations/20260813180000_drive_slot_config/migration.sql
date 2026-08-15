CREATE TABLE "DriveSlotConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "folderName" TEXT NOT NULL,
    "trackCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DriveSlotConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DriveSlotConfig_tenantId_userId_slot_key" ON "DriveSlotConfig"("tenantId", "userId", "slot");
CREATE INDEX "DriveSlotConfig_tenantId_userId_idx" ON "DriveSlotConfig"("tenantId", "userId");
ALTER TABLE "DriveSlotConfig" ADD CONSTRAINT "DriveSlotConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
