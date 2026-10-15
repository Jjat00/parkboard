import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

/**
 * Field encryption at rest. Text a user writes is stored with AES-256-GCM under a key that lives
 * outside the database, so a dump or a backup of Postgres shows only ids, dates and enums.
 * The additional data binds every value to its owner and its column: a ciphertext copied into
 * another user's row or another field fails to decrypt instead of leaking.
 *
 * PARKBOARD_ENCRYPTION_KEYS is a keyring, "id:base64key,id:base64key", newest first. New values
 * use the first key; older keys still decrypt, so rotating means prepending a key and running
 * `pnpm encrypt:existing` to re-seal what the old one wrote.
 *
 * Stored format: enc:v1:<keyId>:<base64url(iv ‖ ciphertext ‖ tag)>
 */

const PREFIX = "enc:v1:";
const IV = 12;
const TAG = 16;

type Key = { id: string; enc: Buffer; index: Buffer };

let ring: Key[] | null = null;

function keyring(): Key[] {
  if (ring) return ring;
  const raw = process.env.PARKBOARD_ENCRYPTION_KEYS ?? "";
  const keys = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [id, b64] = entry.split(":");
      const secret = Buffer.from(b64 ?? "", "base64");
      if (!/^[a-z0-9]{1,16}$/i.test(id) || secret.length !== 32)
        throw new Error("PARKBOARD_ENCRYPTION_KEYS: each entry is id:base64 of 32 random bytes");
      // Separate subkeys, so the blind index never reuses the encryption key.
      const derive = (info: string) => Buffer.from(hkdfSync("sha256", secret, "", `parkboard ${info}`, 32));
      return { id, enc: derive("field encryption"), index: derive("blind index") };
    });
  if (!keys.length) throw new Error("PARKBOARD_ENCRYPTION_KEYS is not set (see .env.example)");
  if (new Set(keys.map((k) => k.id)).size !== keys.length) throw new Error("PARKBOARD_ENCRYPTION_KEYS: repeated key id");
  return (ring = keys);
}

const aad = (ownerId: string, field: string) => Buffer.from(`${ownerId}\0${field}`);

export const currentKeyId = () => keyring()[0].id;

export const isSealed = (value: string) => value.startsWith(PREFIX);

/** True when the value is plaintext or was sealed with a key other than the current one. */
export const needsSeal = (value: string) => !value.startsWith(`${PREFIX}${keyring()[0].id}:`);

export function seal(ownerId: string, field: string, value: string): string {
  const key = keyring()[0];
  const iv = randomBytes(IV);
  const cipher = createCipheriv("aes-256-gcm", key.enc, iv);
  cipher.setAAD(aad(ownerId, field));
  const body = Buffer.concat([iv, cipher.update(value, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `${PREFIX}${key.id}:${body.toString("base64url")}`;
}

/** Decrypts a sealed value. Plaintext passes through: rows written before encryption existed. */
export function open(ownerId: string, field: string, value: string): string {
  if (!isSealed(value)) return value;
  const [id, b64] = value.slice(PREFIX.length).split(":");
  const key = keyring().find((k) => k.id === id);
  if (!key) throw new Error(`no encryption key "${id}" in PARKBOARD_ENCRYPTION_KEYS`);
  const body = Buffer.from(b64 ?? "", "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key.enc, body.subarray(0, IV));
  decipher.setAAD(aad(ownerId, field));
  decipher.setAuthTag(body.subarray(body.length - TAG));
  return Buffer.concat([decipher.update(body.subarray(IV, body.length - TAG)), decipher.final()]).toString("utf8");
}

/**
 * Keyed hash of a value, to look it up and keep it unique without storing it in clear. One per
 * key in the ring, current first, so lookups keep working while a rotation is under way.
 */
export function blindIndexes(ownerId: string, field: string, value: string): string[] {
  return keyring().map((k) => `${k.id}:${createHmac("sha256", k.index).update(`${ownerId}\0${field}\0${value}`).digest("base64url")}`);
}

export const blindIndex = (ownerId: string, field: string, value: string) => blindIndexes(ownerId, field, value)[0];
