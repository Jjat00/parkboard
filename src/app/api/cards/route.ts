import type { Prisma } from "@/generated/prisma/client";
import { requireActor } from "@/lib/auth";
import { CardInput, placeCard, resolveProject, slugify, Status } from "@/lib/board";
import { db } from "@/lib/db";
import { parseBody, writeConflict } from "@/lib/http";
import { CARD_PROJECT, cardCreate, openCard, slugWhere } from "@/lib/sealed";

export async function GET(req: Request) {
  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const params = new URL(req.url).searchParams;
  const where: Prisma.CardWhereInput = { ownerId: actor.userId };
  const status = params.get("status");
  if (status === "open") where.status = { not: "DONE" };
  else if (status) {
    const parsed = Status.safeParse(status.toUpperCase());
    if (!parsed.success) return Response.json({ error: "invalid_status" }, { status: 400 });
    where.status = parsed.data;
  }
  const project = params.get("project");
  if (project) where.project = { OR: [{ id: project }, ...slugWhere(actor.userId, [slugify(project)])] };
  const limit = Math.min(Number(params.get("limit") ?? 100) || 100, 500);
  const q = params.get("q")?.trim().toLowerCase();
  /**
   * Cards with exactly this tag, or with a tag starting with this prefix. Like q they look at every
   * card, and unlike q they return every match: an agent's queue must not hide old cards.
   */
  const tag = params.get("tag")?.trim();
  const tagPrefix = params.get("tagPrefix")?.trim();
  /** Cards with no tag starting with this: e.g. the ones an agent has never touched. */
  const withoutTagPrefix = params.get("withoutTagPrefix")?.trim();
  const byTag = Boolean(tag || tagPrefix || withoutTagPrefix);
  const rows = await db.card.findMany({
    where,
    include: { project: CARD_PROJECT },
    orderBy: [{ createdAt: "desc" }],
    // Title and notes are encrypted, so a text search decrypts the owner's cards and filters here.
    take: q || byTag ? undefined : limit,
  });
  let cards = rows.map(openCard);
  if (tag) cards = cards.filter((c) => c.tags.includes(tag));
  if (tagPrefix) cards = cards.filter((c) => c.tags.some((t) => t.startsWith(tagPrefix)));
  if (withoutTagPrefix) cards = cards.filter((c) => !c.tags.some((t) => t.startsWith(withoutTagPrefix)));
  if (q) {
    const n = /^#?(\d{1,9})$/.exec(q);
    cards = cards
      .filter((c) => (n && c.number === Number(n[1])) || `${c.title}\n${c.notes}`.toLowerCase().includes(q));
  }
  if (q && !byTag) cards = cards.slice(0, limit);
  return Response.json({ cards });
}

export async function POST(req: Request) {
  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const body = await parseBody(req, CardInput);
  if (body.error) return body.error;
  const { project, x, y, ...data } = body.data;
  try {
    // Resolving and placing also read the project: all of it can lose a race with its deletion.
    const projectId = project ? (await resolveProject(actor.userId, project, data.area ?? undefined)).id : null;
    const pos = x !== undefined && y !== undefined ? { x, y } : await placeCard(actor.userId, projectId);
    const card = await db.card.create({
      data: {
        ...cardCreate(actor.userId, { ...data, origin: data.origin ?? (actor.via === "key" ? actor.name : "web") }),
        ...pos,
        // A card in a project takes the area from it.
        area: projectId ? null : (data.area ?? null),
        ownerId: actor.userId,
        projectId,
        doneAt: data.status === "DONE" ? new Date() : null,
      },
      include: { project: CARD_PROJECT },
    });
    return Response.json({ card: openCard(card) }, { status: 201 });
  } catch (e) {
    return writeConflict(e);
  }
}
