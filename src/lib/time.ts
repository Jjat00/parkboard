import { LOCALE, type Lang } from "./lang-shared";

const rtf = {
  es: new Intl.RelativeTimeFormat("es", { numeric: "auto", style: "narrow" }),
  en: new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "narrow" }),
};
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86400],
  ["month", 30 * 86400],
  ["week", 7 * 86400],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

/** "hace 3 d", "ayer", "hace 2 h" (or "3d ago", "yesterday"…). */
export function ago(iso: string, lang: Lang, now = Date.now()) {
  const seconds = (new Date(iso).getTime() - now) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf[lang].format(Math.round(seconds / size), unit);
  }
  return lang === "es" ? "ahora" : "now";
}

/** "Hoy", "Ayer" or "lunes 28 de septiembre" (or "Today", "Yesterday", "Monday, September 28"). */
export function dayLabel(iso: string, lang: Lang, now = new Date()) {
  const d = new Date(iso);
  const key = (x: Date) => x.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key(d) === key(now)) return lang === "es" ? "Hoy" : "Today";
  if (key(d) === key(yesterday)) return lang === "es" ? "Ayer" : "Yesterday";
  return d.toLocaleDateString(LOCALE[lang], { weekday: "long", day: "numeric", month: "long" });
}
