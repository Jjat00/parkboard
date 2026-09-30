import { z } from "zod";

export async function parseBody<T extends z.ZodType>(req: Request, schema: T) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (parsed.success) return { data: parsed.data as z.infer<T> };
  return { error: Response.json({ error: "invalid_body", issues: z.treeifyError(parsed.error) }, { status: 400 }) };
}

export const notFound = () => Response.json({ error: "not_found" }, { status: 404 });
