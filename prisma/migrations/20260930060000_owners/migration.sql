-- DropIndex
DROP INDEX "Card_status_idx";

-- DropIndex
DROP INDEX "Project_slug_key";

-- AlterTable
-- Existing rows belong to the first owner (Jaime); the default is dropped right after.
ALTER TABLE "ApiKey" ADD COLUMN     "ownerId" TEXT NOT NULL DEFAULT 'user_3K27zdB9GtA0QQBhKHzDEUmwxqg';
ALTER TABLE "ApiKey" ALTER COLUMN "ownerId" DROP DEFAULT;

-- AlterTable
-- Existing rows belong to the first owner (Jaime); the default is dropped right after.
ALTER TABLE "Card" ADD COLUMN     "ownerId" TEXT NOT NULL DEFAULT 'user_3K27zdB9GtA0QQBhKHzDEUmwxqg';
ALTER TABLE "Card" ALTER COLUMN "ownerId" DROP DEFAULT;

-- AlterTable
-- Existing rows belong to the first owner (Jaime); the default is dropped right after.
ALTER TABLE "Project" ADD COLUMN     "ownerId" TEXT NOT NULL DEFAULT 'user_3K27zdB9GtA0QQBhKHzDEUmwxqg';
ALTER TABLE "Project" ALTER COLUMN "ownerId" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "ApiKey_ownerId_idx" ON "ApiKey"("ownerId");

-- CreateIndex
CREATE INDEX "Card_ownerId_status_idx" ON "Card"("ownerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Project_ownerId_slug_key" ON "Project"("ownerId", "slug");

