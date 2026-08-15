-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'DJ', 'OPERATOR');

-- CreateEnum
CREATE TYPE "SessionMode" AS ENUM ('AUTO', 'HYBRID', 'MANUAL');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('UPCOMING', 'NEXT', 'PLAYING', 'PLAYED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('QUARANTINED', 'ANALYZING', 'READY', 'FAILED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SelectionType" AS ENUM ('AUTODJ', 'MANUAL', 'REQUEST', 'JINGLE', 'FALLBACK');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'PLAYED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "settings" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT,
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Track" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "genre" TEXT,
    "subgenre" TEXT,
    "durationMs" INTEGER NOT NULL,
    "releaseDate" TIMESTAMP(3),
    "blocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioAsset" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'QUARANTINED',
    "licenseEvidence" JSONB NOT NULL,
    "offlineAllowed" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AudioAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackAnalysis" (
    "trackId" TEXT NOT NULL,
    "bpm" DOUBLE PRECISION,
    "bpmConfidence" DOUBLE PRECISION,
    "musicalKey" TEXT,
    "keyConfidence" DOUBLE PRECISION,
    "energy" DOUBLE PRECISION,
    "loudnessLufs" DOUBLE PRECISION,
    "truePeakDb" DOUBLE PRECISION,
    "cueInMs" INTEGER,
    "transitionOutMs" INTEGER,
    "waveform" JSONB,
    "analyzerVersion" TEXT NOT NULL,

    CONSTRAINT "TrackAnalysis_pkey" PRIMARY KEY ("trackId")
);

-- CreateTable
CREATE TABLE "Playlist" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaylistItem" (
    "playlistId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "PlaylistItem_pkey" PRIMARY KEY ("playlistId","trackId")
);

-- CreateTable
CREATE TABLE "DjSession" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "mode" "SessionMode" NOT NULL DEFAULT 'AUTO',
    "intent" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "DjSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'UPCOMING',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "selectionType" "SelectionType" NOT NULL,
    "scoreBreakdown" JSONB,
    "addedById" TEXT,

    CONSTRAINT "QueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayHistory" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "selectionType" "SelectionType" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "playedMs" INTEGER NOT NULL DEFAULT 0,
    "skipReason" TEXT,

    CONSTRAINT "PlayHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongRequest" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "votes" INTEGER NOT NULL DEFAULT 1,
    "requesterHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SongRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "correlationId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Venue_tenantId_idx" ON "Venue"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_tenantId_userId_key" ON "Membership"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "Track_tenantId_artist_idx" ON "Track"("tenantId", "artist");

-- CreateIndex
CREATE UNIQUE INDEX "AudioAsset_trackId_sha256_key" ON "AudioAsset"("trackId", "sha256");

-- CreateIndex
CREATE INDEX "Playlist_tenantId_idx" ON "Playlist"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistItem_playlistId_position_key" ON "PlaylistItem"("playlistId", "position");

-- CreateIndex
CREATE INDEX "DjSession_venueId_startedAt_idx" ON "DjSession"("venueId", "startedAt");

-- CreateIndex
CREATE INDEX "QueueItem_sessionId_status_idx" ON "QueueItem"("sessionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QueueItem_sessionId_position_key" ON "QueueItem"("sessionId", "position");

-- CreateIndex
CREATE INDEX "PlayHistory_sessionId_startedAt_idx" ON "PlayHistory"("sessionId", "startedAt");

-- CreateIndex
CREATE INDEX "SongRequest_venueId_status_createdAt_idx" ON "SongRequest"("venueId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Track" ADD CONSTRAINT "Track_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioAsset" ADD CONSTRAINT "AudioAsset_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackAnalysis" ADD CONSTRAINT "TrackAnalysis_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistItem" ADD CONSTRAINT "PlaylistItem_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistItem" ADD CONSTRAINT "PlaylistItem_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DjSession" ADD CONSTRAINT "DjSession_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueItem" ADD CONSTRAINT "QueueItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DjSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueItem" ADD CONSTRAINT "QueueItem_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayHistory" ADD CONSTRAINT "PlayHistory_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DjSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongRequest" ADD CONSTRAINT "SongRequest_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongRequest" ADD CONSTRAINT "SongRequest_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
