import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { openCard, openProject, projectCreate, sealFormerProject, slugWhere } from "./sealed";

export const CARD_W = 260;
export const CARD_H = 150;
const GAP = 20;
const PAD = 20;
const HEADER = 56;
const PROJECT_W = PAD * 2 + CARD_W * 3 + GAP * 2;
const PALETTE = ["#68ddfd", "#9e8cfc", "#f5d90a", "#4ade80", "#fb7185", "#fb923c"];

export const Area = z.enum(["PERSONAL", "WORK"]);
export const Status = z.enum(["IDEA", "PENDING", "DOING", "DONE"]);
export const Priority = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const Kind = z.enum(["TASK", "IDEA", "BUG", "RESEARCH", "NOTE"]);
const Link = z.object({ url: z.url(), label: z.string().max(120).optional() });

export const CardInput = z.object({
  title: z.string().trim().min(1).max(300),
  notes: z.string().max(20000).optional(),
  status: Status.optional(),
  priority: Priority.optional(),
  kind: Kind.optional(),
  area: Area.nullish(),
  links: z.array(Link).max(30).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  origin: z.string().max(40).optional(),
  session: z.string().max(2000).nullish(),
  agent: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,39}$/)
    .nullish(),
  /** Agent session ids are UUIDs or simple names; anything else could smuggle shell syntax. */
  sessionId: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/)
    .nullish(),
  cwd: z.string().max(500).nullish(),
  vaultNote: z.string().max(300).nullish(),
  /** GitHub "owner/name", in the shape GitHub allows for account and repository names. */
  repo: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/)
    .refine((r) => !/\/\.{1,2}$/.test(r), "not a repository name")
    .nullish(),
  /** Project id or slug. A new slug creates the project. */
  project: z.string().max(80).nullish(),
  x: z.number().optional(),
  y: z.number().optional(),
});
export const CardPatch = CardInput.partial();
/** An edit. `ifUpdatedAt` makes it conditional: it answers 409 if the card changed after that time. */
export const CardUpdate = CardPatch.extend({ ifUpdatedAt: z.iso.datetime().optional() });

export const ProjectInput = z.object({
  name: z.string().trim().min(1).max(80),
  area: Area.optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().min(300).max(6000).optional(),
  height: z.number().min(200).max(6000).optional(),
});
export const ProjectPatch = ProjectInput.partial();

export const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "proyecto";

type Box = { x: number; y: number };
const overlaps = (a: Box, b: Box) =>
  Math.abs(a.x - b.x) < CARD_W + GAP / 2 && Math.abs(a.y - b.y) < CARD_H + GAP / 2;

/** First grid slot that no card occupies. Positions are relative to the project. */
function freeSlot(taken: Box[], cols: number, origin: Box): Box {
  for (let i = 0; ; i++) {
    const slot = {
      x: origin.x + (i % cols) * (CARD_W + GAP),
      y: origin.y + Math.floor(i / cols) * (CARD_H + GAP),
    };
    if (!taken.some((t) => overlaps(t, slot))) return slot;
  }
}

/** A write lost a race with a concurrent change; the API answers 409 and the caller retries. */
export class ConflictError extends Error {}

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

async function insertProject(ownerId: string, slug: string, input: z.infer<typeof ProjectInput>) {
  const projects = await db.project.findMany({ where: { ownerId } });
  const right = projects.reduce((m, p) => Math.max(m, p.x + p.width), -80);
  const project = await db.project.create({
    data: {
      ...projectCreate(ownerId, { ...input, slug }),
      ownerId,
      color: input.color ?? PALETTE[projects.length % PALETTE.length],
      x: input.x ?? right + 80,
      y: input.y ?? 0,
      width: input.width ?? PROJECT_W,
      height: input.height ?? HEADER + CARD_H + PAD * 2,
    },
  });
  return openProject(ownerId, project);
}

/**
 * First of base, base-2, base-3… that none of the owner's projects uses. Slugs are stored
 * encrypted, so candidates are looked up by their blind index, fifty at a time.
 */
async function freeSlug(ownerId: string, base: string) {
  for (let from = 1; ; from += 50) {
    const candidates = Array.from({ length: 50 }, (_, i) => (from + i === 1 ? base : `${base}-${from + i}`));
    const taken = await db.project.findMany({
      where: { ownerId, OR: slugWhere(ownerId, candidates) },
      select: { slug: true, encrypted: true },
    });
    const used = new Set(taken.map((p) => openProject(ownerId, p).slug));
    const free = candidates.find((c) => !used.has(c));
    if (free) return free;
  }
}

/** Creates a new project; a repeated name gets the first free suffix (a, a-2, a-3…). */
export async function createProject(ownerId: string, input: z.infer<typeof ProjectInput>) {
  const base = slugify(input.name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = await freeSlug(ownerId, base);
    try {
      return await insertProject(ownerId, slug, input);
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // someone took it meanwhile: look again
    }
  }
  throw new Error("could not find a free project slug");
}

/**
 * Resolves one of the owner's projects by id or slug; an unknown slug creates exactly that
 * project. Idempotent under concurrency: two agents parking into the same new project end up
 * in one project.
 */
export async function resolveProject(ownerId: string, ref: string, area?: z.infer<typeof Area>) {
  const slug = slugify(ref);
  const find = async () => {
    const p = await db.project.findFirst({ where: { ownerId, OR: [{ id: ref }, ...slugWhere(ownerId, [slug])] } });
    return p && openProject(ownerId, p);
  };
  const found = await find();
  if (found) return found;
  try {
    return await insertProject(ownerId, slug, { name: ref, area });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    // Created by someone else meanwhile, unless it was also deleted meanwhile.
    const again = await find();
    if (!again) throw new ConflictError("project deleted while resolving it");
    return again;
  }
}

/**
 * Deletes a project, keeping its cards: they move to loose ideas with the project's area.
 * With `onlyIfEmpty`, it only goes when no open card is left (done cards don't keep it alive).
 * Returns false when the project doesn't exist or still has open cards.
 */
export async function deleteProject(ownerId: string, id: string, { onlyIfEmpty = false } = {}) {
  return db.$transaction(async (tx) => {
    // Lock the project row: a card being created in it or moved into it waits on this lock
    // (its foreign key check), so no card slips in between the check, the move and the delete.
    const locked = await tx.$queryRaw<
      { area: z.infer<typeof Area>; name: string; color: string; encrypted: boolean }[]
    >`
      SELECT "area", "name", "color", "encrypted" FROM "Project" WHERE "id" = ${id} AND "ownerId" = ${ownerId} FOR UPDATE`;
    if (!locked.length) return false;
    if (onlyIfEmpty && (await tx.card.count({ where: { ownerId, projectId: id, status: { not: "DONE" } } })))
      return false;
    const { area, color } = locked[0];
    const { name } = openProject(ownerId, locked[0]);
    // The cards remember the project's name and color, so the dashboard still counts them for it.
    // A sealed card gets it sealed and a card still in clear gets it in clear, as its flag says.
    const moved = { projectId: null, area, formerColor: color };
    await tx.card.updateMany({
      where: { ownerId, projectId: id, encrypted: true },
      data: { ...moved, formerProject: sealFormerProject(ownerId, name) },
    });
    await tx.card.updateMany({ where: { ownerId, projectId: id, encrypted: false }, data: { ...moved, formerProject: name } });
    await tx.project.delete({ where: { id } });
    return true;
  });
}

/** A project lives only while it has open cards: drop it once the last one is done, moved or deleted. */
export async function pruneProject(ownerId: string, projectId: string | null) {
  return projectId ? deleteProject(ownerId, projectId, { onlyIfEmpty: true }) : false;
}

/** Where a new card goes when the caller gives no position, growing the project to fit. */
export async function placeCard(ownerId: string, projectId: string | null) {
  const cards = await db.card.findMany({ where: { ownerId, projectId }, select: { x: true, y: true } });
  if (!projectId) return freeSlot(cards, 1, { x: -CARD_W - 120, y: HEADER });
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId, ownerId } });
  const cols = Math.max(1, Math.floor((project.width - PAD * 2 + GAP) / (CARD_W + GAP)));
  const slot = freeSlot(cards, cols, { x: PAD, y: HEADER });
  const needed = slot.y + CARD_H + PAD;
  if (needed > project.height) await db.project.update({ where: { id: projectId }, data: { height: needed } });
  return slot;
}

export async function getBoard(ownerId: string) {
  const [projects, cards] = await Promise.all([
    db.project.findMany({ where: { ownerId }, orderBy: { createdAt: "asc" } }),
    db.card.findMany({ where: { ownerId }, orderBy: { createdAt: "asc" } }),
  ]);
  return { projects: projects.map((p) => openProject(ownerId, p)), cards: cards.map(openCard) };
}

/** Where-clause for one of the owner's cards by id or by its short number ("12" or "#12"). */
export function cardRef(ownerId: string, ref: string) {
  const n = /^#?(\d{1,9})$/.exec(decodeURIComponent(ref).trim());
  return n ? { ownerId, number: Number(n[1]) } : { ownerId, id: ref };
}
