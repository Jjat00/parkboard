"use server";

import { redirect } from "next/navigation";
import { actorFromSession } from "@/lib/auth";
import { newKey } from "@/lib/auth-key";
import { sealForCli } from "@/lib/cli-seal";
import { db } from "@/lib/db";
import { parseLoginRequest } from "./request";

/**
 * Creates a key for the terminal that ran `park login` and hands it back through its loopback callback on
 * 127.0.0.1, sealed to the terminal's own X25519 key so the URL in the browser's history holds only ciphertext.
 */
export async function authorizeCli(form: FormData) {
  const owner = await actorFromSession();
  if (!owner) redirect("/");
  const req = parseLoginRequest({
    port: form.get("port")?.toString(),
    state: form.get("state")?.toString(),
    pub: form.get("pub")?.toString(),
    name: form.get("name")?.toString(),
  });
  if (!req) redirect("/cli/login");
  const { raw, prefix, hash } = newKey();
  // Sealed first: a public key that cannot be used must not leave an orphan key behind.
  const sealed = sealForCli(raw, req.pub, req.state);
  await db.apiKey.create({ data: { ownerId: owner.userId, name: `CLI · ${req.name}`, prefix, hash } });
  const callback = new URL(`http://127.0.0.1:${req.port}/callback`);
  callback.searchParams.set("state", req.state);
  callback.searchParams.set("sealed", sealed);
  redirect(callback.toString());
}
