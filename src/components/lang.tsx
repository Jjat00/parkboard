"use client";

import { createContext, useContext, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LANG_COOKIE, type Lang } from "@/lib/lang-shared";

const LangContext = createContext<Lang>("es");

/** The root layout resolves the language on the server and hands it down to client components. */
export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

function saveLang(lang: Lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}

/** ES / EN toggle. The choice is a cookie for a year, so it wins over the browser language on every page. */
export function LangSwitch({ className = "" }: { className?: string }) {
  const lang = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (next: Lang) => {
    if (next === lang) return;
    saveLang(next);
    start(() => router.refresh());
  };
  return (
    <div
      role="group"
      aria-label={lang === "es" ? "Idioma" : "Language"}
      className={`flex items-center rounded-lg border border-line p-0.5 font-mono text-[11px] ${pending ? "opacity-60" : ""} ${className}`}
    >
      {(["es", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => pick(l)}
          aria-pressed={l === lang}
          className={`rounded-md px-2 py-1 uppercase transition-colors ${l === lang ? "bg-raised text-fg" : "text-faint hover:text-fg"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
