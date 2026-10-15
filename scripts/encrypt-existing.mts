// Seals rows still in clear (written before encryption, or by the previous deployment during the
// rollout) and re-seals rows under an older key after a rotation. Idempotent: run it once the
// new deployment serves all traffic, and again after prepending a key to the ring.
// Usage: pnpm encrypt:existing [--dry-run]
// Prints counts and ids only, never contents. Exits 1 if anything is left undone.
import { Prisma } from "../src/generated/prisma/client";
import { needsSeal } from "../src/lib/crypto";
import { db } from "../src/lib/db";
import { cardText, openCard, openProject, sealCard, sealProject } from "../src/lib/sealed";

const dryRun = process.argv.includes("--dry-run");
let failed = false;

type ProjectRow = Awaited<ReturnType<typeof db.project.findMany>>[number];
type CardRow = Awaited<ReturnType<typeof db.card.findMany>>[number];

const projectIsStale = (p: ProjectRow) => !p.encrypted || !p.slugIndex || needsSeal(p.slug) || needsSeal(p.name);

const cardIsStale = (c: CardRow) =>
  !c.encrypted ||
  [c.title, c.notes, c.session, c.sessionId, c.cwd, c.vaultNote, c.origin, c.formerProject].some((v) => v && needsSeal(v)) ||
  (typeof c.links === "string" && needsSeal(c.links)) ||
  (c.tags.length > 0 && needsSeal(c.tags[0]));

/**
 * A project created in clear by the previous deployment while the new one created the same slug
 * encrypted leaves two projects with one slug. Sealing either would hit the unique index, and
 * merging them is a decision for a person: stop before writing anything.
 */
async function duplicateSlugs() {
  const seen = new Map<string, string>();
  const dupes: string[] = [];
  for (const p of await db.project.findMany()) {
    let slug: string;
    try {
      slug = openProject(p.ownerId, p).slug;
    } catch (e) {
      // Uniqueness cannot be checked without it: stop before writing anything.
      dupes.push(`${p.id} cannot be read: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    const key = `${p.ownerId}\0${slug}`;
    if (seen.has(key)) dupes.push(`${seen.get(key)} = ${p.id}`);
    else seen.set(key, p.id);
  }
  return dupes;
}

/**
 * Writes only if the row is unchanged since it was read (same updatedAt), and keeps that
 * updatedAt so sorting by "last updated" is not disturbed. A row edited meanwhile is read again.
 */
async function migrate<T extends { id: string }>(
  label: string,
  read: () => Promise<T[]>,
  stale: (row: T) => boolean,
  write: (row: T) => Promise<number>,
) {
  let done = 0;
  for (let pass = 0; pass < 5; pass++) {
    const rows = (await read()).filter(stale);
    if (!rows.length) break;
    if (dryRun) return console.log(`${label}: ${rows.length} to seal`);
    for (const row of rows) {
      try {
        done += await write(row);
      } catch (e) {
        // Reported by id and left as it is: a slug collision to merge by hand, or a sealed value
        // that does not open (wrong key, tampering). Messages carry no contents.
        const why =
          e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
            ? "collides with another row's slug; merge them by hand"
            : `cannot be read: ${e instanceof Error ? e.message : e}`;
        console.error(`${label}: ${row.id} ${why}`);
        failed = true;
      }
    }
  }
  const left = (await read()).filter(stale).length;
  console.log(`${label}: ${done} sealed${left ? `, ${left} still pending` : ""}`);
  if (left) failed = true;
}

const dupes = await duplicateSlugs();
if (dupes.length) {
  console.error(`cannot check project slugs: ${dupes.join("; ")}. Fix or merge them, then run again.`);
  process.exit(1);
}

await migrate(
  "projects",
  () => db.project.findMany(),
  projectIsStale,
  async (row) => {
    const { slug, name } = openProject(row.ownerId, row);
    const { count } = await db.project.updateMany({
      where: { id: row.id, updatedAt: row.updatedAt },
      data: { ...sealProject(row.ownerId, { slug, name }), encrypted: true, updatedAt: row.updatedAt },
    });
    return count;
  },
);

await migrate(
  "cards",
  () => db.card.findMany(),
  cardIsStale,
  async (row) => {
    const { count } = await db.card.updateMany({
      where: { id: row.id, updatedAt: row.updatedAt },
      data: { ...sealCard(row.ownerId, cardText(openCard(row))), encrypted: true, updatedAt: row.updatedAt },
    });
    return count;
  },
);

process.exit(failed ? 1 : 0);
