import { z } from "zod";
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
  area: Area.optional(),
  links: z.array(Link).max(30).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  origin: z.string().max(40).optional(),
  session: z.string().max(2000).nullish(),
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

export async function createProject(input: z.infer<typeof ProjectInput>) {
  const projects = await db.project.findMany();
  let slug = slugify(input.name);
  if (projects.some((p) => p.slug === slug)) slug = `${slug}-${projects.length + 1}`;
  const right = projects.reduce((m, p) => Math.max(m, p.x + p.width), -80);
  return db.project.create({
    data: {
      ...input,
      slug,
      color: input.color ?? PALETTE[projects.length % PALETTE.length],
      x: input.x ?? right + 80,
      y: input.y ?? 0,
      width: input.width ?? PROJECT_W,
      height: input.height ?? HEADER + CARD_H + PAD * 2,
    },
  });
}

/** Resolves a project by id or slug; an unknown slug creates it. */
export async function resolveProject(ref: string, area?: z.infer<typeof Area>) {
  const found = await db.project.findFirst({ where: { OR: [{ id: ref }, { slug: slugify(ref) }] } });
  return found ?? createProject({ name: ref, area });
}

/** Where a new card goes when the caller gives no position, growing the project to fit. */
export async function placeCard(projectId: string | null) {
  const cards = await db.card.findMany({ where: { projectId }, select: { x: true, y: true } });
  if (!projectId) return freeSlot(cards, 1, { x: -CARD_W - 120, y: HEADER });
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const cols = Math.max(1, Math.floor((project.width - PAD * 2 + GAP) / (CARD_W + GAP)));
  const slot = freeSlot(cards, cols, { x: PAD, y: HEADER });
  const needed = slot.y + CARD_H + PAD;
  if (needed > project.height) await db.project.update({ where: { id: projectId }, data: { height: needed } });
  return slot;
}

export async function getBoard() {
  const [projects, cards] = await Promise.all([
    db.project.findMany({ orderBy: { createdAt: "asc" } }),
    db.card.findMany({ orderBy: { createdAt: "asc" } }),
  ]);
  return { projects, cards };
}
