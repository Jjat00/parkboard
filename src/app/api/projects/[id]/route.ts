import { requireActor } from "@/lib/auth";
import { deleteProject, ProjectPatch } from "@/lib/board";
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
  const deleted = await deleteProject(actor.userId, id);
  return deleted ? Response.json({ ok: true }) : notFound();
}
