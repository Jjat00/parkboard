import { createHash, randomBytes } from "node:crypto";

export const hashKey = (raw: string) => createHash("sha256").update(raw).digest("hex");

export function newKey() {
  const raw = `pk_${randomBytes(24).toString("base64url")}`;
  return { raw, prefix: raw.slice(0, 8), hash: hashKey(raw) };
}
