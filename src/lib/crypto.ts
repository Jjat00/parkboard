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
 * PARKBOARD_INDEX_KEY (base64) keys the blind index and is not rotated with the keyring: one
 * stable index keeps a slug unique per owner even while two key versions are live.
 *
 * Stored format: enc:v1:<keyId>:<base64url(iv ‖ ciphertext ‖ tag)>. Whether a row is sealed is
 * recorded in its own `encrypted` column, never guessed from this prefix.
 */

const PREFIX = "enc:v1:";
const IV = 12;
const TAG = 16;

type Key = { id: string; enc: Buffer };

let ring: Key[] | null = null;
let indexKey: Buffer | null = null;

const decode32 = (b64: string | undefined) => {
  const secret = Buffer.from(b64 ?? "", "base64");
  return secret.length === 32 ? secret : null;
};

function keyring(): Key[] {
  if (ring) return ring;
  const raw = process.env.PARKBOARD_ENCRYPTION_KEYS ?? "";
  const keys = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [id, b64] = entry.split(":");
      const secret = decode32(b64);
      if (!/^[a-z0-9]{1,16}$/i.test(id) || !secret)
        throw new Error("PARKBOARD_ENCRYPTION_KEYS: each entry is id:base64 of 32 random bytes");
      return { id, enc: Buffer.from(hkdfSync("sha256", secret, "", "parkboard field encryption", 32)) };
    });
  if (!keys.length) throw new Error("PARKBOARD_ENCRYPTION_KEYS is not set (see .env.example)");
  if (new Set(keys.map((k) => k.id)).size !== keys.length) throw new Error("PARKBOARD_ENCRYPTION_KEYS: repeated key id");
  return (ring = keys);
}

const aad = (ownerId: string, field: string) => Buffer.from(`${ownerId}\0${field}`);

export const currentKeyId = () => keyring()[0].id;

/** True when a sealed value was written with a key other than the current one. */
export const needsSeal = (value: string) => !value.startsWith(`${PREFIX}${keyring()[0].id}:`);

export function seal(ownerId: string, field: string, value: string): string {
  const key = keyring()[0];
  const iv = randomBytes(IV);
  const cipher = createCipheriv("aes-256-gcm", key.enc, iv);
  cipher.setAAD(aad(ownerId, field));
  const body = Buffer.concat([iv, cipher.update(value, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `${PREFIX}${key.id}:${body.toString("base64url")}`;
}

/** Decrypts a sealed value; anything else is an error, never passed through as plaintext. */
export function open(ownerId: string, field: string, value: string): string {
  if (!value.startsWith(PREFIX)) throw new Error(`${field} is not a sealed value`);
  const [id, b64] = value.slice(PREFIX.length).split(":");
  const key = keyring().find((k) => k.id === id);
  if (!key) throw new Error(`no encryption key "${id}" in PARKBOARD_ENCRYPTION_KEYS`);
  const body = Buffer.from(b64 ?? "", "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key.enc, body.subarray(0, IV));
  decipher.setAAD(aad(ownerId, field));
  decipher.setAuthTag(body.subarray(body.length - TAG));
  return Buffer.concat([decipher.update(body.subarray(IV, body.length - TAG)), decipher.final()]).toString("utf8");
}

/** Keyed hash of a value, to look it up and keep it unique without storing it in clear. */
export function blindIndex(ownerId: string, field: string, value: string): string {
  if (!indexKey) {
    const secret = decode32(process.env.PARKBOARD_INDEX_KEY);
    if (!secret) throw new Error("PARKBOARD_INDEX_KEY must be base64 of 32 random bytes (see .env.example)");
    indexKey = Buffer.from(hkdfSync("sha256", secret, "", "parkboard blind index", 32));
  }
  return createHmac("sha256", indexKey).update(`${ownerId}\0${field}\0${value}`).digest("base64url");
}
