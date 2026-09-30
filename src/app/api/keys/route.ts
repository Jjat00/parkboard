import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { newKey } from "@/lib/auth-key";
import { db } from "@/lib/db";
import { parseBody } from "@/lib/http";

const select = { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true } as const;

export async function GET() {
  const actor = await requireSession();
  if (actor instanceof Response) return actor;
  const keys = await db.apiKey.findMany({
    where: { ownerId: actor.userId, revokedAt: null },
    select,
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ keys });
}

/** Returns the raw key once; only its hash is stored. */
export async function POST(req: Request) {
  const actor = await requireSession();
  if (actor instanceof Response) return actor;
  const body = await parseBody(req, z.object({ name: z.string().trim().min(1).max(60) }));
  if (body.error) return body.error;
  const { raw, prefix, hash } = newKey();
  const key = await db.apiKey.create({ data: { ownerId: actor.userId, name: body.data.name, prefix, hash }, select });
  return Response.json({ key, secret: raw }, { status: 201 });
}
