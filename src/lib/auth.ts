import { auth, currentUser } from "@clerk/nextjs/server";
import { hashKey } from "./auth-key";
import { db } from "./db";

/** Who is calling. Every query is scoped to `userId`: each user has their own board. */
export type Actor = { userId: string; via: "session" } | { userId: string; via: "key"; name: string };

/**
 * Optional allowlist. When PARKBOARD_ALLOWED_EMAILS is set, only those emails can use the web;
 * when it is empty, anyone who signs in gets their own empty board.
 */
function allowedEmails() {
  return (process.env.PARKBOARD_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Signed-in user from Clerk, or null (not signed in, or not in the allowlist). */
export async function actorFromSession(): Promise<Actor | null> {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) return null;
  const allowed = allowedEmails();
  if (allowed.length) {
    const user = await currentUser();
    const emails = user?.emailAddresses.map((e) => e.emailAddress.toLowerCase()) ?? [];
    if (!emails.some((e) => allowed.includes(e))) return null;
  }
  return { userId, via: "session" };
}

/** API key from `Authorization: Bearer pk_…`, or null. The key acts as its owner. */
async function actorFromKey(req: Request): Promise<Actor | null> {
  const header = req.headers.get("authorization") ?? "";
  const raw = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!raw.startsWith("pk_")) return null;
  const key = await db.apiKey.findUnique({ where: { hash: hashKey(raw) } });
  if (!key || key.revokedAt) return null;
  await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return { userId: key.ownerId, via: "key", name: key.name };
}

/** For route handlers: API key first (CLI, agents), then the Clerk session (web). */
export async function requireActor(req: Request): Promise<Actor | Response> {
  const actor = (await actorFromKey(req)) ?? (await actorFromSession());
  return actor ?? Response.json({ error: "unauthorized" }, { status: 401 });
}

/** Only a signed-in person, never an API key (e.g. to create or revoke keys). */
export async function requireSession(): Promise<Actor | Response> {
  return (await actorFromSession()) ?? Response.json({ error: "unauthorized" }, { status: 401 });
}
