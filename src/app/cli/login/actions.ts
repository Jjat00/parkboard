"use server";

import { redirect } from "next/navigation";
import { actorFromSession } from "@/lib/auth";
import { newKey } from "@/lib/auth-key";
import { db } from "@/lib/db";
import { parseLoginRequest } from "./request";

/**
 * Creates a key for the terminal that ran `park login` and hands it to that terminal through its loopback
 * callback on 127.0.0.1, so only the computer that opened this page receives it.
 */
export async function authorizeCli(form: FormData) {
  const owner = await actorFromSession();
  if (!owner) redirect("/");
  const req = parseLoginRequest({
    port: form.get("port")?.toString(),
    state: form.get("state")?.toString(),
    name: form.get("name")?.toString(),
  });
  if (!req) redirect("/cli/login");
  const { raw, prefix, hash } = newKey();
  await db.apiKey.create({ data: { ownerId: owner.userId, name: `CLI · ${req.name}`, prefix, hash } });
  const callback = new URL(`http://127.0.0.1:${req.port}/callback`);
  callback.searchParams.set("state", req.state);
  callback.searchParams.set("key", raw);
  redirect(callback.toString());
}
