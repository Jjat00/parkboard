import { requireActor } from "@/lib/auth";
import { cardRef, CardPatch, placeCard, resolveProject } from "@/lib/board";
import { db } from "@/lib/db";
import { notFound, parseBody, writeConflict } from "@/lib/http";

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

  const doneAt =
    data.status === undefined ? undefined : data.status === "DONE" ? (current.doneAt ?? new Date()) : null;

  try {
    // Only touch projectId when the caller asks for a move: writing back the value read above
    // would undo a move made by a concurrent request.
    let move = {};
    // Without a move, the write only applies if the card is still where we read it, so an
    // area edit is never judged against a stale project (a lost race answers 409).
    let where: { projectId: string | null } | object = {};
    if (project !== undefined) {
      const projectId = project ? (await resolveProject(actor.userId, project, data.area ?? undefined)).id : null;
      const pos = projectId !== current.projectId && data.x === undefined ? await placeCard(actor.userId, projectId) : {};
      move = { projectId, ...pos, ...(projectId ? { area: null } : {}) };
    } else if (data.area !== undefined) {
      where = { projectId: current.projectId };
      // A card inside a project takes its area from the project: it has none of its own.
      if (current.projectId) data.area = null;
    }

    const card = await db.card.update({
      where: { id: current.id, ownerId: actor.userId, ...where },
      data: { ...data, ...move, doneAt },
      include: { project: { select: { slug: true, name: true, area: true } } },
    });
    return Response.json({ card });
  } catch (e) {
    return writeConflict(e);
  }
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/cards/[id]">) {
  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const deleted = await db.card.deleteMany({ where: cardRef(actor.userId, id) });
  return deleted.count ? Response.json({ ok: true }) : notFound();
}
