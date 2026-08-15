CREATE INDEX "Track_tenantId_subgenre_idx" ON "Track"("tenantId", "subgenre");
CREATE INDEX "AudioAsset_storageKey_idx" ON "AudioAsset"("storageKey");
CREATE INDEX "AudioAsset_storageKey_pattern_idx" ON "AudioAsset"("storageKey" text_pattern_ops);
