import { headers } from "next/headers";

export type Lang = "es" | "en";

/** Spanish when the browser prefers it over English, English otherwise. */
export async function preferredLang(): Promise<Lang> {
  const accept = (await headers()).get("accept-language") ?? "";
  const ranked = accept
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().toLowerCase().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { tag, q: q ? Number(q.trim().slice(2)) || 0 : 1 };
    })
    .sort((a, b) => b.q - a.q);
  const first = ranked.find((r) => r.tag.startsWith("es") || r.tag.startsWith("en"));
  return first?.tag.startsWith("es") ? "es" : "en";
}
