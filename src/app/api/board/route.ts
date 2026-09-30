import { requireActor } from "@/lib/auth";
import { getBoard } from "@/lib/board";

export async function GET(req: Request) {
  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  return Response.json(await getBoard(actor.userId));
}
