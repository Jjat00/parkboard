import type { Prisma } from "@/generated/prisma/client";
import { requireActor } from "@/lib/auth";
import { CardInput, placeCard, resolveProject, slugify, Status } from "@/lib/board";
import { db } from "@/lib/db";
import { parseBody, writeConflict } from "@/lib/http";

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
  if (project) where.project = { OR: [{ id: project }, { slug: slugify(project) }] };
  const q = params.get("q");
  if (q) {
    const n = /^#?(\d{1,9})$/.exec(q.trim());
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } },
      ...(n ? [{ number: Number(n[1]) }] : []),
    ];
  }
  const cards = await db.card.findMany({
    where,
    include: { project: { select: { slug: true, name: true, area: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: Math.min(Number(params.get("limit") ?? 100) || 100, 500),
  });
  return Response.json({ cards });
}

export async function POST(req: Request) {
  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const body = await parseBody(req, CardInput);
  if (body.error) return body.error;
  const { project, x, y, ...data } = body.data;
  const projectId = project ? (await resolveProject(actor.userId, project, data.area ?? undefined)).id : null;
  const pos = x !== undefined && y !== undefined ? { x, y } : await placeCard(actor.userId, projectId);
  const card = await db.card
    .create({
    data: {
      ...data,
      ...pos,
      // A card in a project takes the area from it.
      area: projectId ? null : (data.area ?? null),
      ownerId: actor.userId,
      projectId,
      origin: data.origin ?? (actor.via === "key" ? actor.name : "web"),
      doneAt: data.status === "DONE" ? new Date() : null,
    },
      include: { project: { select: { slug: true, name: true, area: true } } },
    })
    .catch((e: unknown) => writeConflict(e));
  if (card instanceof Response) return card;
  return Response.json({ card }, { status: 201 });
}
