import { auth, currentUser } from "@clerk/nextjs/server";
import { hashKey } from "./auth-key";
import { db } from "./db";

export type Actor = { kind: "user"; email: string } | { kind: "key"; name: string };

/** Emails allowed in the UI. Empty list means nobody: the board is private by default. */
function allowedEmails() {
  return (process.env.PARKBOARD_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Signed-in owner from Clerk, or null. */
export async function ownerFromSession(): Promise<Actor | null> {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return null;
  const user = await currentUser();
  const emails = user?.emailAddresses.map((e) => e.emailAddress.toLowerCase()) ?? [];
  const email = emails.find((e) => allowedEmails().includes(e));
  return email ? { kind: "user", email } : null;
}

/** API key from `Authorization: Bearer pk_…`, or null. */
async function actorFromKey(req: Request): Promise<Actor | null> {
  const header = req.headers.get("authorization") ?? "";
  const raw = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!raw.startsWith("pk_")) return null;
  const key = await db.apiKey.findUnique({ where: { hash: hashKey(raw) } });
  if (!key || key.revokedAt) return null;
  await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return { kind: "key", name: key.name };
}

/** For route handlers: API key first (CLI, agents), then the Clerk session (web). */
export async function requireActor(req: Request): Promise<Actor | Response> {
  const actor = (await actorFromKey(req)) ?? (await ownerFromSession());
  return actor ?? Response.json({ error: "unauthorized" }, { status: 401 });
}
