import type { Prisma } from "@/generated/prisma/client";
import { requireActor } from "@/lib/auth";
import { CardInput, placeCard, resolveProject, slugify, Status } from "@/lib/board";
import { db } from "@/lib/db";
import { parseBody } from "@/lib/http";

export async function GET(req: Request) {
  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const params = new URL(req.url).searchParams;
  const where: Prisma.CardWhereInput = {};
  const status = params.get("status");
  if (status === "open") where.status = { not: "DONE" };
  else if (status) where.status = Status.parse(status.toUpperCase());
  const project = params.get("project");
  if (project) where.project = { OR: [{ id: project }, { slug: slugify(project) }] };
  const q = params.get("q");
  if (q) where.OR = [{ title: { contains: q, mode: "insensitive" } }, { notes: { contains: q, mode: "insensitive" } }];
  const cards = await db.card.findMany({
    where,
    include: { project: { select: { slug: true, name: true, area: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: Math.min(Number(params.get("limit") ?? 100), 500),
  });
  return Response.json({ cards });
}

export async function POST(req: Request) {
  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const body = await parseBody(req, CardInput);
  if (body.error) return body.error;
  const { project, x, y, ...data } = body.data;
  const projectId = project ? (await resolveProject(project, data.area)).id : null;
  const pos = x !== undefined && y !== undefined ? { x, y } : await placeCard(projectId);
  const card = await db.card.create({
    data: {
      ...data,
      ...pos,
      projectId,
      origin: data.origin ?? (actor.kind === "key" ? actor.name : "web"),
      doneAt: data.status === "DONE" ? new Date() : null,
    },
    include: { project: { select: { slug: true, name: true, area: true } } },
  });
  return Response.json({ card }, { status: 201 });
}
