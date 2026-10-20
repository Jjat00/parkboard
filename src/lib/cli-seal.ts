import { createCipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from "node:crypto";

// X25519 public keys in SPKI DER are this fixed prefix plus the 32 raw bytes.
const X25519_SPKI = Buffer.from("302a300506032b656e032100", "hex");

/**
 * Seals a new API key for the terminal running `park login`, to the X25519 key it sent (`pub`, raw, base64url).
 * Output: our ephemeral public key (32 bytes), AES-256-GCM iv (12), tag (16) and ciphertext, base64url.
 * Only that terminal can open it, so the callback URL left in the browser's history is useless.
 * Mirrors openSealedKey in cli/park.mjs.
 */
export function sealForCli(raw: string, pub: string, state: string) {
  const peer = createPublicKey({ key: Buffer.concat([X25519_SPKI, Buffer.from(pub, "base64url")]), format: "der", type: "spki" });
  const eph = generateKeyPairSync("x25519");
  const secret = diffieHellman({ privateKey: eph.privateKey, publicKey: peer });
  const aes = Buffer.from(hkdfSync("sha256", secret, state, "parkboard-cli-login", 32));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aes, iv);
  const ct = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  const ephPub = eph.publicKey.export({ format: "der", type: "spki" }).subarray(X25519_SPKI.length);
  return Buffer.concat([ephPub, iv, cipher.getAuthTag(), ct]).toString("base64url");
}
