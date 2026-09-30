import { requireActor } from "@/lib/auth";
import { ProjectPatch } from "@/lib/board";
import { db } from "@/lib/db";
import { notFound, parseBody } from "@/lib/http";

export async function PATCH(req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const body = await parseBody(req, ProjectPatch);
  if (body.error) return body.error;
  const updated = await db.project.updateMany({ where: { id, ownerId: actor.userId }, data: body.data });
  if (!updated.count) return notFound();
  return Response.json({ project: await db.project.findUnique({ where: { id } }) });
}

/** Deleting a project keeps its cards: they move to loose ideas, keeping the project's area. */
export async function DELETE(req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const deleted = await db.$transaction(async (tx) => {
    // Lock the project row: a card being created in it or moved into it waits on this lock
    // (its foreign key check), so no card slips in between the move below and the delete.
    const locked = await tx.$queryRaw<{ area: "PERSONAL" | "WORK" }[]>`
      SELECT "area" FROM "Project" WHERE "id" = ${id} AND "ownerId" = ${actor.userId} FOR UPDATE`;
    if (!locked.length) return false;
    await tx.card.updateMany({
      where: { ownerId: actor.userId, projectId: id },
      data: { projectId: null, area: locked[0].area },
    });
    await tx.project.delete({ where: { id } });
    return true;
  });
  return deleted ? Response.json({ ok: true }) : notFound();
}
