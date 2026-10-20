export type LoginRequest = { port: number; state: string; pub: string; name: string };

/** What `park login` sends in the URL. Anything off is rejected rather than fixed up. */
export function parseLoginRequest(q: { port?: string; state?: string; pub?: string; name?: string }): LoginRequest | null {
  const port = Number(q.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return null;
  if (!q.state || !/^[A-Za-z0-9_-]{16,64}$/.test(q.state)) return null;
  // The terminal's X25519 public key: 32 raw bytes in base64url.
  if (!q.pub || !/^[A-Za-z0-9_-]{43}$/.test(q.pub)) return null;
  // The machine name only labels the key; keep it short and printable.
  const name = (q.name ?? "").replace(/[^\p{L}\p{N} ._-]/gu, "").trim().slice(0, 40) || "terminal";
  return { port, state: q.state, pub: q.pub, name };
}
