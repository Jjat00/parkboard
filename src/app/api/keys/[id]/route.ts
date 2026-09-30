import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound } from "@/lib/http";

export async function DELETE(_: Request, ctx: RouteContext<"/api/keys/[id]">) {
  const actor = await requireSession();
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const revoked = await db.apiKey.updateMany({
    where: { id, ownerId: actor.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return revoked.count ? Response.json({ ok: true }) : notFound();
}
