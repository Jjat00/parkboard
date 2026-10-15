import { requireActor } from "@/lib/auth";
import { deleteProject, ProjectPatch } from "@/lib/board";
import { db } from "@/lib/db";
import { notFound, parseBody } from "@/lib/http";
import { openProject, projectUpdate } from "@/lib/sealed";

export async function PATCH(req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const body = await parseBody(req, ProjectPatch);
  if (body.error) return body.error;
  const current = await db.project.findFirst({ where: { id, ownerId: actor.userId } });
  if (!current) return notFound();
  const write = projectUpdate(actor.userId, current, body.data);
  const updated = await db.project.updateMany({ where: { id, ownerId: actor.userId, ...write.guard }, data: write.data });
  if (!updated.count) {
    return Response.json({ error: "conflict", detail: "the project changed meanwhile; retry" }, { status: 409 });
  }
  const project = await db.project.findUnique({ where: { id } });
  return Response.json({ project: project && openProject(actor.userId, project) });
}

/** Deleting a project keeps its cards: they move to loose ideas, keeping the project's area. */
export async function DELETE(req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const deleted = await deleteProject(actor.userId, id);
  return deleted ? Response.json({ ok: true }) : notFound();
}
