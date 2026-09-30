-- Short per-owner number for each card (#1, #2…), assigned by creation order.
ALTER TABLE "Card" ADD COLUMN "number" INTEGER NOT NULL DEFAULT 0;

UPDATE "Card" c
SET "number" = n.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "ownerId" ORDER BY "createdAt", "id") AS rn
  FROM "Card"
) n
WHERE c."id" = n."id";

CREATE UNIQUE INDEX "Card_ownerId_number_key" ON "Card"("ownerId", "number");

-- The database assigns the next number on insert, so every writer (and older app
-- versions that do not know the column) gets one. The unique index catches races.
CREATE FUNCTION card_next_number() RETURNS trigger AS $$
BEGIN
  IF NEW."number" IS NULL OR NEW."number" = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW."ownerId"));
    SELECT COALESCE(MAX("number"), 0) + 1 INTO NEW."number" FROM "Card" WHERE "ownerId" = NEW."ownerId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER card_number BEFORE INSERT ON "Card"
FOR EACH ROW EXECUTE FUNCTION card_next_number();
