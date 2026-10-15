-- What users write is now stored encrypted (src/lib/sealed.ts). Each row records whether it is
-- sealed, so rows written in clear before (or by the previous deployment during the rollout)
-- keep reading as plaintext until `pnpm encrypt:existing` seals them. Projects are found by a
-- keyed hash of their slug. Everything is additive: the previous deployment keeps working.
ALTER TABLE "Project" ADD COLUMN "slugIndex" TEXT;
ALTER TABLE "Project" ADD COLUMN "encrypted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Card" ADD COLUMN "encrypted" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Project_ownerId_slugIndex_key" ON "Project"("ownerId", "slugIndex");
