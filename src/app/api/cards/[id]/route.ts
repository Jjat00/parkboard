import { requireActor } from "@/lib/auth";
import { CardPatch, placeCard, resolveProject } from "@/lib/board";
import { db } from "@/lib/db";
import { notFound, parseBody } from "@/lib/http";

export async function GET(req: Request, ctx: RouteContext<"/api/cards/[id]">) {
  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const card = await db.card.findUnique({ where: { id }, include: { project: true } });
  return card ? Response.json({ card }) : notFound();
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/cards/[id]">) {
  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const current = await db.card.findUnique({ where: { id } });
  if (!current) return notFound();
  const body = await parseBody(req, CardPatch);
  if (body.error) return body.error;
  const { project, ...data } = body.data;

  let projectId = current.projectId;
  if (project !== undefined) projectId = project ? (await resolveProject(project, data.area)).id : null;
  const moved = projectId !== current.projectId;
  const pos = moved && data.x === undefined ? await placeCard(projectId) : {};
  const doneAt =
    data.status === undefined ? undefined : data.status === "DONE" ? (current.doneAt ?? new Date()) : null;

  const card = await db.card.update({
    where: { id },
    data: { ...data, ...pos, projectId, doneAt },
    include: { project: { select: { slug: true, name: true, area: true } } },
  });
  return Response.json({ card });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/cards/[id]">) {
  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const deleted = await db.card.deleteMany({ where: { id } });
  return deleted.count ? Response.json({ ok: true }) : notFound();
}
