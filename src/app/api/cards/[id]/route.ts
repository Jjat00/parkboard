import { requireActor } from "@/lib/auth";
import { cardRef, CardUpdate, placeCard, pruneProject, resolveProject } from "@/lib/board";
import { db } from "@/lib/db";
import { notFound, parseBody, writeConflict } from "@/lib/http";
import { CARD_PROJECT, cardUpdate, openCard } from "@/lib/sealed";

export async function GET(req: Request, ctx: RouteContext<"/api/cards/[id]">) {
  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const card = await db.card.findFirst({ where: cardRef(actor.userId, id), include: { project: CARD_PROJECT } });
  return card ? Response.json({ card: openCard(card) }) : notFound();
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/cards/[id]">) {
  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const current = await db.card.findFirst({ where: cardRef(actor.userId, id) });
  if (!current) return notFound();
  const body = await parseBody(req, CardUpdate);
  if (body.error) return body.error;
  const { project, ifUpdatedAt, ...data } = body.data;

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

    const include = { project: CARD_PROJECT };
    const write = cardUpdate(actor.userId, current, data);
    const card = await db.card.update({
      where: {
        id: current.id,
        ownerId: actor.userId,
        ...where,
        ...write.guard,
        // Compare-and-set for agents: the write only applies to the version they read.
        ...(ifUpdatedAt ? { updatedAt: new Date(ifUpdatedAt) } : {}),
      },
      data: { ...write.data, ...move, doneAt },
      include,
    });
    // Closing or moving out the last open card deletes the project it leaves behind.
    const left = card.status === "DONE" || card.projectId !== current.projectId;
    if (left && (await pruneProject(actor.userId, current.projectId)) && card.projectId === current.projectId) {
      // The card was closed inside it: it is now a loose done card.
      const loose = await db.card.findUnique({ where: { id: card.id }, include });
      return Response.json({ card: loose && openCard(loose) });
    }
    return Response.json({ card: openCard(card) });
  } catch (e) {
    return writeConflict(e);
  }
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/cards/[id]">) {
  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const card = await db.card.findFirst({ where: cardRef(actor.userId, id), select: { id: true, projectId: true } });
  if (!card) return notFound();
  const deleted = await db.card.deleteMany({ where: { id: card.id, ownerId: actor.userId } });
  if (!deleted.count) return notFound();
  await pruneProject(actor.userId, card.projectId);
  return Response.json({ ok: true });
}
