-- AlterTable
ALTER TABLE "Card" ALTER COLUMN "area" DROP NOT NULL,
ALTER COLUMN "area" DROP DEFAULT;


-- Cards inside a project take the area from it.
UPDATE "Card" SET "area" = NULL WHERE "projectId" IS NOT NULL;
