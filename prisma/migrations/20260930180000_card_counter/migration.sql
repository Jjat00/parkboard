-- Card numbers come from a counter per owner that only grows, so deleting the last card
-- (#12) never hands #12 to a new card that an old reference would then hit.
CREATE TABLE "CardCounter" (
    "ownerId" TEXT NOT NULL,
    "last" INTEGER NOT NULL,

    CONSTRAINT "CardCounter_pkey" PRIMARY KEY ("ownerId")
);

INSERT INTO "CardCounter" ("ownerId", "last")
SELECT "ownerId", MAX("number") FROM "Card" GROUP BY "ownerId";

-- The upsert takes the counter row's lock, which serializes concurrent inserts per owner.
CREATE OR REPLACE FUNCTION card_next_number() RETURNS trigger AS $$
BEGIN
  IF NEW."number" IS NULL OR NEW."number" = 0 THEN
    INSERT INTO "CardCounter" ("ownerId", "last") VALUES (NEW."ownerId", 1)
    ON CONFLICT ("ownerId") DO UPDATE SET "last" = "CardCounter"."last" + 1
    RETURNING "last" INTO NEW."number";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
