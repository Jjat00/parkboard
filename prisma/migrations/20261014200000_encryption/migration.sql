-- Project names and slugs are now stored encrypted, so a project is found by a keyed hash of
-- its slug. Nullable until `pnpm encrypt:existing` fills it for rows written before.
ALTER TABLE "Project" ADD COLUMN "slugIndex" TEXT;

CREATE UNIQUE INDEX "Project_ownerId_slugIndex_key" ON "Project"("ownerId", "slugIndex");
