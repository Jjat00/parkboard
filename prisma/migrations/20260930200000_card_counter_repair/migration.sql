-- The counter was seeded from MAX("number") without blocking inserts, so a card committed
-- by the previous trigger during that migration could sit above its owner's counter and
-- make every later insert collide. Block inserts, raise each counter to at least the
-- highest existing number (never lower it), and make the trigger self-healing so the
-- counter can never fall behind again.
LOCK TABLE "Card" IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO "CardCounter" ("ownerId", "last")
SELECT "ownerId", MAX("number") FROM "Card" GROUP BY "ownerId"
ON CONFLICT ("ownerId") DO UPDATE SET "last" = GREATEST("CardCounter"."last", EXCLUDED."last");

CREATE OR REPLACE FUNCTION card_next_number() RETURNS trigger AS $$
BEGIN
  IF NEW."number" IS NULL OR NEW."number" = 0 THEN
    -- The upsert locks the owner's counter row, serializing concurrent inserts. GREATEST with
    -- the current maximum (an index lookup on the unique (ownerId, number) index) keeps it
    -- ahead of any number assigned by other means.
    INSERT INTO "CardCounter" ("ownerId", "last")
    VALUES (NEW."ownerId", COALESCE((SELECT MAX("number") FROM "Card" WHERE "ownerId" = NEW."ownerId"), 0) + 1)
    ON CONFLICT ("ownerId") DO UPDATE SET "last" = GREATEST(
      "CardCounter"."last",
      COALESCE((SELECT MAX("number") FROM "Card" WHERE "ownerId" = NEW."ownerId"), 0)
    ) + 1
    RETURNING "last" INTO NEW."number";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
