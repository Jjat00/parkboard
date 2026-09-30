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
  const updated = await db.project.updateMany({ where: { id }, data: body.data });
  if (!updated.count) return notFound();
  return Response.json({ project: await db.project.findUnique({ where: { id } }) });
}

/** Deleting a project keeps its cards: they move to the inbox. */
export async function DELETE(req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const project = await db.project.findUnique({ where: { id } });
  if (!project) return notFound();
  const cards = await db.card.findMany({ where: { projectId: id } });
  await db.$transaction([
    ...cards.map((c) =>
      db.card.update({ where: { id: c.id }, data: { projectId: null, area: project.area, x: project.x + c.x, y: project.y + c.y } }),
    ),
    db.project.delete({ where: { id } }),
  ]);
  return Response.json({ ok: true });
}
