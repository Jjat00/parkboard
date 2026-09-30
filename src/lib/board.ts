import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";

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
  /** Project id or slug. A new slug creates the project. */
  project: z.string().max(80).nullish(),
  x: z.number().optional(),
  y: z.number().optional(),
});
export const CardPatch = CardInput.partial();

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
  return db.project.create({
    data: {
      ...input,
      ownerId,
      slug,
      color: input.color ?? PALETTE[projects.length % PALETTE.length],
      x: input.x ?? right + 80,
      y: input.y ?? 0,
      width: input.width ?? PROJECT_W,
      height: input.height ?? HEADER + CARD_H + PAD * 2,
    },
  });
}

/** Creates a new project; a repeated name gets the first free suffix (a, a-2, a-3…). */
export async function createProject(ownerId: string, input: z.infer<typeof ProjectInput>) {
  const base = slugify(input.name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const taken = new Set(
      (await db.project.findMany({ where: { ownerId, slug: { startsWith: base } }, select: { slug: true } })).map(
        (p) => p.slug,
      ),
    );
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
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
  const find = () => db.project.findFirst({ where: { ownerId, OR: [{ id: ref }, { slug }] } });
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
  return { projects, cards };
}

/** Where-clause for one of the owner's cards by id or by its short number ("12" or "#12"). */
export function cardRef(ownerId: string, ref: string) {
  const n = /^#?(\d{1,9})$/.exec(decodeURIComponent(ref).trim());
  return n ? { ownerId, number: Number(n[1]) } : { ownerId, id: ref };
}
