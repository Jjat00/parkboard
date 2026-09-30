import { requireActor } from "@/lib/auth";
import { createProject, ProjectInput } from "@/lib/board";
import { db } from "@/lib/db";
import { parseBody } from "@/lib/http";

export async function GET(req: Request) {
  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const projects = await db.project.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { cards: { where: { status: { not: "DONE" } } } } } },
  });
  return Response.json({ projects });
}

export async function POST(req: Request) {
  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const body = await parseBody(req, ProjectInput);
  if (body.error) return body.error;
  return Response.json({ project: await createProject(body.data) }, { status: 201 });
}
