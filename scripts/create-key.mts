// Creates an API key for a user. Usage: pnpm key:create <name> <clerk-user-id>
// Users can also create keys from the web (Keys button).
import { newKey } from "../src/lib/auth-key";
import { db } from "../src/lib/db";

const [name, ownerId] = process.argv.slice(2);
if (!name || !ownerId?.startsWith("user_")) {
  console.error("usage: pnpm key:create <name> <clerk-user-id>");
  process.exit(2);
}
const { raw, prefix, hash } = newKey();
await db.apiKey.create({ data: { ownerId, name, prefix, hash } });
console.log(raw);
process.exit(0);
