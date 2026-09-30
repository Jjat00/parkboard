const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto", style: "narrow" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86400],
  ["month", 30 * 86400],
  ["week", 7 * 86400],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

/** "hace 3 d", "ayer", "hace 2 h". */
export function ago(iso: string, now = Date.now()) {
  const seconds = (new Date(iso).getTime() - now) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "ahora";
}

/** "Hoy", "Ayer" or "lunes 28 de septiembre". */
export function dayLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  const key = (x: Date) => x.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key(d) === key(now)) return "Hoy";
  if (key(d) === key(yesterday)) return "Ayer";
  return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
}
