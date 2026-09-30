import { requireActor } from "@/lib/auth";
import { cardRef, CardPatch, placeCard, resolveProject } from "@/lib/board";
import { db } from "@/lib/db";
import { notFound, parseBody } from "@/lib/http";

export async function GET(req: Request, ctx: RouteContext<"/api/cards/[id]">) {
  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const card = await db.card.findFirst({ where: cardRef(actor.userId, id), include: { project: true } });
  return card ? Response.json({ card }) : notFound();
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/cards/[id]">) {
  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const current = await db.card.findFirst({ where: cardRef(actor.userId, id) });
  if (!current) return notFound();
  const body = await parseBody(req, CardPatch);
  if (body.error) return body.error;
  const { project, ...data } = body.data;

  let projectId = current.projectId;
  if (project !== undefined) projectId = project ? (await resolveProject(actor.userId, project, data.area ?? undefined)).id : null;
  const moved = projectId !== current.projectId;
  const pos = moved && data.x === undefined ? await placeCard(actor.userId, projectId) : {};
  const doneAt =
    data.status === undefined ? undefined : data.status === "DONE" ? (current.doneAt ?? new Date()) : null;

  const card = await db.card.update({
    where: { id: current.id },
    data: { ...data, ...pos, projectId, doneAt, ...(projectId ? { area: null } : {}) },
    include: { project: { select: { slug: true, name: true, area: true } } },
  });
  return Response.json({ card });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/cards/[id]">) {
  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const deleted = await db.card.deleteMany({ where: cardRef(actor.userId, id) });
  return deleted.count ? Response.json({ ok: true }) : notFound();
}
