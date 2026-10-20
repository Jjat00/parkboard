import { setupMd } from "@/lib/agent-setup";

export const dynamic = "force-static";

export function GET() {
  return new Response(setupMd(), { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}
