-- Conserva una pista por archivo real de Drive y elimina únicamente las
-- copias redundantes creadas por sincronizaciones concurrentes.
WITH ranked_drive_assets AS (
  SELECT
    "trackId",
    ROW_NUMBER() OVER (PARTITION BY "storageKey" ORDER BY "id") AS duplicate_number
  FROM "AudioAsset"
  WHERE "storageKey" LIKE 'drive:%'
     OR "storageKey" LIKE 'drive02:%'
     OR "storageKey" LIKE 'drive03:%'
)
DELETE FROM "Track"
WHERE "id" IN (
  SELECT "trackId"
  FROM ranked_drive_assets
  WHERE duplicate_number > 1
);

CREATE UNIQUE INDEX "AudioAsset_storageKey_key" ON "AudioAsset"("storageKey");
