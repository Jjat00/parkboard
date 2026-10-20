import { labels, VIEW_KEYS, viewOf, type AreaKey, type PriorityKey, type ViewKey } from "./labels";
import { LOCALE, type Lang } from "./lang-shared";
import { AGENT_LABEL } from "./session";
import type { CardDTO, ProjectDTO } from "./types";

/**
 * Everything the activity dashboard shows, computed in the browser from the board: it is small
 * (a few hundred cards) and the dates must be cut in the viewer's own time zone.
 *
 * Two events per card: it was parked (createdAt) and, if it is done, it was finished (doneAt).
 * A reopened card loses its doneAt, and a deleted card leaves no trace.
 *
 * Functions that produce display text take the viewer's language.
 */

export type Metric = "done" | "created";
export const METRIC: Record<Lang, Record<Metric, string>> = {
  es: { done: "Terminadas", created: "Parqueadas" },
  en: { done: "Done", created: "Parked" },
};
/** Validated for the dark surface (see the dataviz palette check): cyan and violet, CVD-safe. */
export const METRIC_COLOR: Record<Metric, string> = { done: "#35a2c8", created: "#7f6fe8" };

const DAY = 86_400_000;

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
/** Weeks start on Monday. */
export const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
/** Calendar days between two midnights, robust to daylight saving changes. */
export const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);

/** "2026-10-15" in local time. */
export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function parseDay(s: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) || isoDay(d) !== s ? null : d;
}

/** A half-open range of local days: [start, end). */
export type Range = { start: Date; end: Date };

export const PRESETS = {
  es: {
    today: "Hoy",
    yesterday: "Ayer",
    thisWeek: "Esta semana",
    lastWeek: "Semana anterior",
    last7: "Últimos 7 días",
    last30: "Últimos 30 días",
    thisMonth: "Este mes",
    lastMonth: "Mes anterior",
    last90: "Últimos 90 días",
    thisYear: "Este año",
    lastYear: "Año anterior",
    all: "Todo",
  },
  en: {
    today: "Today",
    yesterday: "Yesterday",
    thisWeek: "This week",
    lastWeek: "Last week",
    last7: "Last 7 days",
    last30: "Last 30 days",
    thisMonth: "This month",
    lastMonth: "Last month",
    last90: "Last 90 days",
    thisYear: "This year",
    lastYear: "Last year",
    all: "All time",
  },
} as const;
export type Preset = keyof typeof PRESETS.es;
export const PRESET_KEYS = Object.keys(PRESETS.es) as Preset[];

/** A preset or a custom range picked on the calendar. */
export type Period = { preset: Preset } | { preset: "custom"; range: Range };

export function presetRange(preset: Preset, now: Date, first: Date): Range {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  switch (preset) {
    case "today":
      return { start: today, end: tomorrow };
    case "yesterday":
      return { start: addDays(today, -1), end: today };
    case "thisWeek":
      return { start: startOfWeek(today), end: tomorrow };
    case "lastWeek":
      return { start: addDays(startOfWeek(today), -7), end: startOfWeek(today) };
    case "last7":
      return { start: addDays(today, -6), end: tomorrow };
    case "last30":
      return { start: addDays(today, -29), end: tomorrow };
    case "last90":
      return { start: addDays(today, -89), end: tomorrow };
    case "thisMonth":
      return { start: addMonths(today, 0), end: tomorrow };
    case "lastMonth":
      return { start: addMonths(today, -1), end: addMonths(today, 0) };
    case "thisYear":
      return { start: new Date(today.getFullYear(), 0, 1), end: tomorrow };
    case "lastYear":
      return { start: new Date(today.getFullYear() - 1, 0, 1), end: new Date(today.getFullYear(), 0, 1) };
    case "all":
      return { start: startOfDay(first < today ? first : today), end: tomorrow };
  }
}

export const periodRange = (p: Period, now: Date, first: Date) =>
  p.preset === "custom" ? p.range : presetRange(p.preset, now, first);

/**
 * The period to compare against: the same stretch of the previous week, month or year for the
 * calendar presets ("this month so far" against the same days of last month), otherwise the
 * same number of days right before.
 */
export function previousRange(p: Period, r: Range): Range | null {
  const shiftMonths = (n: number) => {
    const shift = (d: Date) => {
      const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
      const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last));
    };
    return { start: shift(r.start), end: shift(r.end) };
  };
  switch (p.preset) {
    case "all":
      return null;
    case "thisMonth":
    case "lastMonth":
      return shiftMonths(-1);
    case "thisYear":
    case "lastYear":
      return shiftMonths(-12);
    default: {
      const n = daysBetween(r.start, r.end);
      return { start: addDays(r.start, -n), end: r.start };
    }
  }
}

/** Date formats per language, built once each. */
const formats = (lang: Lang) => {
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE[lang], o);
  return {
    day: f({ day: "numeric", month: "short" }),
    dayYear: f({ day: "numeric", month: "short", year: "numeric" }),
    weekday: f({ weekday: "short", day: "numeric", month: "short" }),
    month: f({ month: "short", year: "2-digit" }),
    monthLong: f({ month: "long", year: "numeric" }),
  };
};
const FMT = { es: formats("es"), en: formats("en") };

/** "1 oct – 15 oct 2026" ("Oct 1 – Oct 15, 2026"), or a single day. */
export function rangeLabel(r: Range, lang: Lang) {
  const { day: fmtDay, dayYear: fmtDayYear } = FMT[lang];
  const last = addDays(r.end, -1);
  if (daysBetween(r.start, last) === 0) return fmtDayYear.format(r.start);
  const sameYear = r.start.getFullYear() === last.getFullYear();
  return `${(sameYear ? fmtDay : fmtDayYear).format(r.start)} – ${fmtDayYear.format(last)}`;
}

/* ───────────────────────── who a card belongs to ───────────────────────── */

export type Group = { key: string; name: string; color: string; closed: boolean };
const LOOSE_NAME: Record<Lang, string> = { es: "Ideas sueltas", en: "Loose ideas" };

/** A card's project: the live one, the one it was in when that was deleted, or none. */
export function groupOf(card: CardDTO, projects: Map<string, ProjectDTO>, lang: Lang): Group {
  const p = card.projectId ? projects.get(card.projectId) : undefined;
  if (p) return { key: p.id, name: p.name, color: p.color, closed: false };
  if (card.formerProject) {
    const live = [...projects.values()].find((x) => x.name === card.formerProject);
    // Parked again under the same name: it is the same project.
    if (live) return { key: live.id, name: live.name, color: live.color, closed: false };
    return { key: `former:${card.formerProject}`, name: card.formerProject, color: card.formerColor ?? "#666666", closed: true };
  }
  return { key: "loose", name: LOOSE_NAME[lang], color: "#666666", closed: false };
}

export function areaOf(card: CardDTO, projects: Map<string, ProjectDTO>): AreaKey | null {
  return card.projectId ? (projects.get(card.projectId)?.area ?? card.area) : card.area;
}

/* ───────────────────────── filters ───────────────────────── */

export type Filters = { area: AreaKey | "ALL"; view: ViewKey | "ALL"; project: string };
export const NO_FILTERS: Filters = { area: "ALL", view: "ALL", project: "" };

export function filterCards(cards: CardDTO[], projects: Map<string, ProjectDTO>, f: Filters) {
  return cards.filter(
    (c) =>
      (f.area === "ALL" || areaOf(c, projects) === f.area) &&
      (f.view === "ALL" || viewOf(c) === f.view) &&
      // Only the key matters here, which is the same in every language.
      (!f.project || groupOf(c, projects, "es").key === f.project),
  );
}

/* ───────────────────────── events ───────────────────────── */

export type Event = { card: CardDTO; at: Date; metric: Metric };

export function events(cards: CardDTO[]): Event[] {
  const out: Event[] = [];
  for (const c of cards) {
    out.push({ card: c, at: new Date(c.createdAt), metric: "created" });
    if (c.status === "DONE" && c.doneAt) out.push({ card: c, at: new Date(c.doneAt), metric: "done" });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export const inRange = (at: Date, r: Range) => at >= r.start && at < r.end;

/* ───────────────────────── time series ───────────────────────── */

export type Unit = "hour" | "day" | "week" | "month";
export type Bucket = { start: Date; end: Date; label: string; tip: string; done: number; created: number; open: number };

export function unitFor(r: Range): Unit {
  const days = daysBetween(r.start, r.end);
  if (days <= 1) return "hour";
  if (days <= 62) return "day";
  if (days <= 26 * 7) return "week";
  return "month";
}

function bucketStarts(r: Range, unit: Unit): Date[] {
  const out: Date[] = [];
  if (unit === "hour") {
    for (let h = 0; h < 24; h++) out.push(new Date(r.start.getFullYear(), r.start.getMonth(), r.start.getDate(), h));
    return out;
  }
  let d = unit === "week" ? startOfWeek(r.start) : unit === "month" ? addMonths(r.start, 0) : r.start;
  while (d < r.end) {
    out.push(d);
    d = unit === "day" ? addDays(d, 1) : unit === "week" ? addDays(d, 7) : addMonths(d, 1);
  }
  return out;
}

/**
 * Done and parked per bucket, plus how many cards were open at the end of each one (parked
 * before then and not done by then; cards done before they were parked count as never open).
 */
export function series(cards: CardDTO[], r: Range, unit: Unit, lang: Lang): Bucket[] {
  const { day: fmtDay, weekday: fmtWeekday, month: fmtMonth, monthLong: fmtMonthLong } = FMT[lang];
  const starts = bucketStarts(r, unit);
  const buckets: Bucket[] = starts.map((start, i) => {
    const end = starts[i + 1] ?? (unit === "hour" ? r.end : unit === "day" ? addDays(start, 1) : unit === "week" ? addDays(start, 7) : addMonths(start, 1));
    const label =
      unit === "hour"
        ? String(start.getHours())
        : unit === "day"
          ? String(start.getDate())
          : unit === "week"
            ? fmtDay.format(start)
            : fmtMonth.format(start);
    const tip =
      unit === "hour"
        ? `${start.getHours()}:00 – ${start.getHours() + 1}:00`
        : unit === "day"
          ? fmtWeekday.format(start)
          : unit === "week"
            ? `${lang === "es" ? "Semana del" : "Week of"} ${fmtDay.format(start)}`
            : fmtMonthLong.format(start);
    return { start, end, label, tip, done: 0, created: 0, open: 0 };
  });
  const find = (at: Date) => {
    // Buckets are few (≤ 62): a linear scan is fine.
    for (const b of buckets) if (at >= b.start && at < b.end) return b;
    return null;
  };
  for (const c of cards) {
    const created = new Date(c.createdAt);
    const done = c.status === "DONE" && c.doneAt ? new Date(c.doneAt) : null;
    if (inRange(created, r)) {
      const b = find(created);
      if (b) b.created++;
    }
    if (done && inRange(done, r)) {
      const b = find(done);
      if (b) b.done++;
    }
    for (const b of buckets) {
      const at = b.end < r.end ? b.end : r.end;
      if (created < at && !(done && done < at)) b.open++;
    }
  }
  return buckets;
}

/* ───────────────────────── time to finish ───────────────────────── */

/** Hours from parked to done. */
export const leadHours = (c: CardDTO) =>
  c.doneAt ? Math.max(0, (new Date(c.doneAt).getTime() - new Date(c.createdAt).getTime()) / 3_600_000) : null;

export const LEAD_BINS = [
  { label: "< 1 h", max: 1 },
  { label: "1–6 h", max: 6 },
  { label: "6–24 h", max: 24 },
  { label: "1–3 d", max: 72 },
  { label: "3–7 d", max: 168 },
  { label: { es: "1–2 sem", en: "1–2 wk" }, max: 336 },
  { label: { es: "2–4 sem", en: "2–4 wk" }, max: 672 },
  { label: { es: "> 4 sem", en: "> 4 wk" }, max: Infinity },
] as const;

export function leadHistogram(done: CardDTO[], lang: Lang) {
  const counts = LEAD_BINS.map((b) => ({ label: typeof b.label === "string" ? b.label : b.label[lang], count: 0 }));
  for (const c of done) {
    const h = leadHours(c);
    if (h === null) continue;
    counts[LEAD_BINS.findIndex((b) => h < b.max)].count++;
  }
  return counts;
}

export function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** "45 min", "5 h", "3,2 d" ("3.2 d"). */
export function durationLabel(hours: number | null, lang: Lang) {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  const days = hours / 24;
  return `${days < 10 ? days.toLocaleString(LOCALE[lang], { maximumFractionDigits: 1 }) : Math.round(days)} d`;
}

/* ───────────────────────── breakdowns ───────────────────────── */

export type Row = { key: string; label: string; count: number; color?: string };

function countBy(cards: CardDTO[], key: (c: CardDTO) => { key: string; label: string; color?: string }): Row[] {
  const rows = new Map<string, Row>();
  for (const c of cards) {
    const k = key(c);
    const row = rows.get(k.key) ?? { ...k, count: 0 };
    row.count++;
    rows.set(k.key, row);
  }
  return [...rows.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export const byKind = (cards: CardDTO[], lang: Lang) => countBy(cards, (c) => ({ key: c.kind, label: labels(lang).KIND[c.kind] }));
export const byPriority = (cards: CardDTO[], lang: Lang) => {
  const { PRIORITY } = labels(lang);
  return countBy(cards, (c) => ({ key: c.priority, label: PRIORITY[c.priority].label, color: PRIORITY[c.priority].color })).sort(
    (a, b) => Object.keys(PRIORITY).indexOf(b.key as PriorityKey) - Object.keys(PRIORITY).indexOf(a.key as PriorityKey),
  );
};
export const byArea = (cards: CardDTO[], projects: Map<string, ProjectDTO>, lang: Lang) =>
  countBy(cards, (c) => {
    const a = areaOf(c, projects);
    return a ? { key: a, label: labels(lang).AREA[a] } : { key: "none", label: lang === "es" ? "Sin área" : "No area" };
  });
/** Who parked it: an agent, the web or the CLI by hand. Names, so the same in every language. */
export const byOrigin = (cards: CardDTO[]) =>
  countBy(cards, (c) => {
    const who = c.agent ?? c.origin ?? "web";
    return { key: who, label: AGENT_LABEL[who] ?? (who === "web" ? "Web" : who === "cli" ? "CLI" : who) };
  });

export type ProjectRow = Group & { done: number; created: number; open: number; lastAt: Date | null };

/** Activity per project in the range, with what is still open in each one today. */
export function byProject(all: CardDTO[], projects: Map<string, ProjectDTO>, r: Range, lang: Lang): ProjectRow[] {
  const rows = new Map<string, ProjectRow>();
  for (const c of all) {
    const g = groupOf(c, projects, lang);
    const row = rows.get(g.key) ?? { ...g, done: 0, created: 0, open: 0, lastAt: null };
    const created = new Date(c.createdAt);
    const done = c.status === "DONE" && c.doneAt ? new Date(c.doneAt) : null;
    if (inRange(created, r)) row.created++;
    if (done && inRange(done, r)) row.done++;
    if (c.status !== "DONE") row.open++;
    for (const at of [created, done]) if (at && inRange(at, r) && (!row.lastAt || at > row.lastAt)) row.lastAt = at;
    rows.set(g.key, row);
  }
  return [...rows.values()]
    .filter((p) => p.done || p.created)
    .sort((a, b) => b.done - a.done || b.created - a.created || a.name.localeCompare(b.name));
}

/* ───────────────────────── rhythm ───────────────────────── */

/** Monday-first weekday × hour counts. */
export function weekHourGrid(evts: Event[]) {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const e of evts) grid[(e.at.getDay() + 6) % 7][e.at.getHours()]++;
  return grid;
}

/** Monday-first weekday names: "Lun", "Mar"… ("Mon", "Tue"…), or "lunes"… with style long. */
export function weekdays(lang: Lang, style: "short" | "long" = "short") {
  const fmt = new Intl.DateTimeFormat(LOCALE[lang], { weekday: style });
  // 2024-01-01 was a Monday.
  const names = Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)).replace(/\.$/, ""));
  return style === "short" ? names.map((n) => n.charAt(0).toUpperCase() + n.slice(1)) : names;
}

/** Count per local day ("2026-10-15"). */
export function perDay(evts: Event[]) {
  const m = new Map<string, number>();
  for (const e of evts) {
    const k = isoDay(e.at);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/** Consecutive days with at least one event, ending today (or yesterday, if today has none yet). */
export function currentStreak(days: Map<string, number>, now: Date) {
  let d = startOfDay(now);
  if (!days.get(isoDay(d))) d = addDays(d, -1);
  let n = 0;
  while (days.get(isoDay(d))) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function longestStreak(days: Map<string, number>) {
  const sorted = [...days.keys()].filter((k) => days.get(k)).sort();
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const k of sorted) {
    const d = parseDay(k)!;
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function viewOptions(lang: Lang): { key: ViewKey | "ALL"; label: string }[] {
  const { VIEWS } = labels(lang);
  return [{ key: "ALL", label: lang === "es" ? "Todo" : "All" }, ...VIEW_KEYS.map((k) => ({ key: k, label: VIEWS[k].label }))];
}
