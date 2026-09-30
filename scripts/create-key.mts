// Creates an API key for the CLI or an agent. Usage: pnpm key:create <name>
import { newKey } from "../src/lib/auth-key";
import { db } from "../src/lib/db";

const name = process.argv[2] ?? "cli";
const { raw, prefix, hash } = newKey();
await db.apiKey.create({ data: { name, prefix, hash } });
console.log(raw);
process.exit(0);
