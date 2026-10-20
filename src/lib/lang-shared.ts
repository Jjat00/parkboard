// Safe to import from client and server code alike (no next/headers here).

export type Lang = "es" | "en";

/** Set by the ES/EN switch; wins over the browser's Accept-Language. */
export const LANG_COOKIE = "parkboard-lang";

/** Locale for dates and numbers. */
export const LOCALE: Record<Lang, string> = { es: "es-CO", en: "en-US" };
