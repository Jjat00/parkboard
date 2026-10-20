import { cookies, headers } from "next/headers";
import { LANG_COOKIE, type Lang } from "./lang-shared";

export type { Lang } from "./lang-shared";

/** The language picked with the ES/EN switch, else Spanish when the browser prefers it over English, else English. */
export async function preferredLang(): Promise<Lang> {
  const chosen = (await cookies()).get(LANG_COOKIE)?.value;
  if (chosen === "es" || chosen === "en") return chosen;
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
