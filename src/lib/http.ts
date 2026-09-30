import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { ConflictError } from "./board";

export async function parseBody<T extends z.ZodType>(req: Request, schema: T) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (parsed.success) return { data: parsed.data as z.infer<T> };
  return { error: Response.json({ error: "invalid_body", issues: z.treeifyError(parsed.error) }, { status: 400 }) };
}

export const notFound = () => Response.json({ error: "not_found" }, { status: 404 });

/**
 * A write that lost a race: the card or its target project was deleted meanwhile (P2025, or a
 * foreign key P2003 when a project is deleted while a card moves into it). Anything else is a bug.
 */
export function writeConflict(e: unknown): Response {
  if (
    e instanceof ConflictError ||
    (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2025" || e.code === "P2003"))
  ) {
    return Response.json({ error: "conflict", detail: "the card or its project changed meanwhile; retry" }, { status: 409 });
  }
  throw e;
}
