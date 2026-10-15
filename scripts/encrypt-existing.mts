// Encrypts rows written before field encryption, and re-seals rows under an older key after a
// rotation. Idempotent: run it after deploying, and again after prepending a key to the ring.
// Usage: pnpm encrypt:existing [--dry-run]
// Prints counts only, never contents.
import { currentKeyId, needsSeal } from "../src/lib/crypto";
import { db } from "../src/lib/db";
import { openCard, openProject, sealCard, sealProject } from "../src/lib/sealed";

const dryRun = process.argv.includes("--dry-run");
const current = `${currentKeyId()}:`;

const projectIsStale = (p: { slug: string; name: string; slugIndex: string | null }) =>
  needsSeal(p.slug) || needsSeal(p.name) || !p.slugIndex?.startsWith(current);

const cardIsStale = (c: Awaited<ReturnType<typeof db.card.findMany>>[number]) =>
  [c.title, c.notes, c.session, c.sessionId, c.cwd, c.vaultNote].some((v) => typeof v === "string" && v !== "" && needsSeal(v)) ||
  typeof c.links !== "string" ||
  needsSeal(c.links) ||
  c.tags.length !== 1 ||
  needsSeal(c.tags[0]);

/**
 * Writes only if the row is unchanged since it was read (same updatedAt), and keeps that
 * updatedAt so sorting by "last updated" is not disturbed. A row edited meanwhile is read again.
 */
async function migrate<T extends { id: string; updatedAt: Date }>(
  label: string,
  read: () => Promise<T[]>,
  stale: (row: T) => boolean,
  write: (row: T) => Promise<number>,
) {
  let done = 0;
  for (let pass = 0; pass < 5; pass++) {
    const rows = (await read()).filter(stale);
    if (!rows.length) break;
    if (dryRun) {
      console.log(`${label}: ${rows.length} to encrypt`);
      return;
    }
    for (const row of rows) done += await write(row);
  }
  const left = (await read()).filter(stale).length;
  console.log(`${label}: ${done} encrypted${left ? `, ${left} still pending (edited meanwhile; run again)` : ""}`);
}

await migrate(
  "projects",
  () => db.project.findMany(),
  projectIsStale,
  async (row) => {
    const plain = openProject(row.ownerId, row);
    const { count } = await db.project.updateMany({
      where: { id: row.id, updatedAt: row.updatedAt },
      data: { ...sealProject(row.ownerId, { slug: plain.slug, name: plain.name }), updatedAt: row.updatedAt },
    });
    return count;
  },
);

await migrate(
  "cards",
  () => db.card.findMany(),
  cardIsStale,
  async (row) => {
    const c = openCard(row);
    const { title, notes, session, sessionId, cwd, vaultNote, links, tags } = c;
    const { count } = await db.card.updateMany({
      where: { id: row.id, updatedAt: row.updatedAt },
      data: {
        ...sealCard(row.ownerId, { title, notes, session, sessionId, cwd, vaultNote, links, tags }),
        updatedAt: row.updatedAt,
      },
    });
    return count;
  },
);

process.exit(0);
