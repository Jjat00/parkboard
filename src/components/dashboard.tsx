"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, CalendarDays, Check, ChevronLeft, ChevronRight, CircleCheck, ExternalLink, Plus } from "lucide-react";
import { AREA, PRIORITY, type AreaKey, type ViewKey } from "@/lib/labels";
import {
  addDays,
  byArea,
  byKind,
  byOrigin,
  byPriority,
  byProject,
  currentStreak,
  daysBetween,
  durationLabel,
  events,
  filterCards,
  groupOf,
  inRange,
  isoDay,
  leadHistogram,
  leadHours,
  longestStreak,
  median,
  METRIC,
  METRIC_COLOR,
  NO_FILTERS,
  parseDay,
  perDay,
  periodRange,
  PRESETS,
  previousRange,
  rangeLabel,
  series,
  startOfDay,
  startOfWeek,
  unitFor,
  VIEW_OPTIONS,
  WEEKDAYS,
  weekHourGrid,
  type Bucket,
  type Event,
  type Filters,
  type Metric,
  type Period,
  type Preset,
  type Range,
  type Row,
} from "@/lib/stats";
import { AUTOPILOT_STATE, autopilotRows, type AutopilotRow, type AutopilotState } from "@/lib/autopilot";
import { ago } from "@/lib/time";
import type { CardDTO, ProjectDTO } from "@/lib/types";

const SURFACE = "#111110";
const GRID = "#232323";
const AXIS = "#666666";
const fmt = new Intl.NumberFormat("es-CO");

/* ───────────────────────── URL state ───────────────────────── */

type State = { period: Period; filters: Filters; metric: Metric };
const DEFAULT: State = { period: { preset: "thisWeek" }, filters: NO_FILTERS, metric: "done" };

/** The dashboard's state lives in the URL, so a view can be bookmarked or reloaded. */
function readUrl(search: string): State {
  const q = new URLSearchParams(search);
  const from = parseDay(q.get("from"));
  const to = parseDay(q.get("to"));
  const p = q.get("p");
  const period: Period =
    from && to
      ? { preset: "custom", range: from <= to ? { start: from, end: addDays(to, 1) } : { start: to, end: addDays(from, 1) } }
      : p && p in PRESETS
        ? { preset: p as Preset }
        : DEFAULT.period;
  const area = q.get("area");
  const view = q.get("view");
  return {
    period,
    filters: {
      area: area && area in AREA ? (area as AreaKey) : "ALL",
      view: VIEW_OPTIONS.some((v) => v.key === view) ? (view as ViewKey) : "ALL",
      project: q.get("project") ?? "",
    },
    metric: q.get("m") === "created" ? "created" : "done",
  };
}

function writeUrl(s: State) {
  const q = new URLSearchParams();
  if (s.period.preset === "custom") {
    q.set("from", isoDay(s.period.range.start));
    q.set("to", isoDay(addDays(s.period.range.end, -1)));
  } else if (s.period.preset !== DEFAULT.period.preset) q.set("p", s.period.preset);
  if (s.filters.area !== "ALL") q.set("area", s.filters.area);
  if (s.filters.view !== "ALL") q.set("view", s.filters.view);
  if (s.filters.project) q.set("project", s.filters.project);
  if (s.metric !== "done") q.set("m", s.metric);
  const qs = q.toString();
  history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
}

/* ───────────────────────── small pieces ───────────────────────── */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

type TipState = { x: number; y: number; body: ReactNode } | null;

/** One floating tooltip per chart; it follows the pointer and never covers it. */
function useTip() {
  const [tip, setTip] = useState<TipState>(null);
  const show = (e: { clientX: number; clientY: number }, body: ReactNode) => setTip({ x: e.clientX, y: e.clientY, body });
  const showAt = (el: Element, body: ReactNode) => {
    const r = el.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.top, body });
  };
  const node = tip && (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 max-w-[260px] rounded-lg border border-line bg-raised px-3 py-2 text-xs shadow-xl"
      style={{
        left: Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 9999) - 270),
        top: tip.y + 14,
      }}
    >
      {tip.body}
    </div>
  );
  return { show, showAt, hide: () => setTip(null), node };
}

function TipRow({ color, value, label }: { color?: string; value: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {color && <span className="h-0.5 w-3 rounded-full" style={{ background: color }} />}
      <span className="font-semibold text-fg tabular-nums">{value}</span>
      <span className="text-muted">{label}</span>
    </div>
  );
}

function Card({ title, sub, right, children, className = "" }: { title: string; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-xl border border-line bg-panel p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-fg">{title}</h2>
          {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
        </div>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex items-center rounded-lg border border-line p-0.5 text-xs" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`rounded-md px-2.5 py-1 whitespace-nowrap ${value === o.key ? "bg-white/10 text-fg" : "text-muted hover:text-fg"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Column with a 4px rounded data end and a square foot on the baseline. */
function colPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** A clean axis maximum and its ticks: 0, 2, 4… */
function niceScale(max: number, count = 4) {
  if (max <= 0) return { top: 4, ticks: [0, 1, 2, 3, 4] };
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw && Number.isInteger(s)) ?? Math.ceil(raw);
  const top = Math.ceil(max / step) * step;
  return { top, ticks: Array.from({ length: top / step + 1 }, (_, i) => i * step) };
}

/* ───────────────────────── period picker ───────────────────────── */

const fmtMonthTitle = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" });

function MonthGrid({ month, from, to, onPick }: { month: Date; from: Date | null; to: Date | null; onPick: (d: Date) => void }) {
  const first = startOfWeek(month);
  const today = startOfDay(new Date());
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  return (
    <div className="w-[238px]">
      <p className="mb-2 text-center text-xs font-medium text-fg first-letter:uppercase">{fmtMonthTitle.format(month)}</p>
      <div className="grid grid-cols-7 gap-y-0.5 text-center text-[10px] text-faint">
        {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
        {days.map((d) => {
          const out = d.getMonth() !== month.getMonth();
          const isFrom = from && +d === +from;
          const isTo = to && +d === +to;
          const inside = from && to && d > from && d < to;
          return (
            <button
              key={+d}
              onClick={() => onPick(d)}
              className={`h-8 text-xs tabular-nums ${out ? "invisible" : ""} ${
                isFrom || isTo
                  ? "rounded-md bg-cyan font-semibold text-ink"
                  : inside
                    ? "bg-cyan/15 text-fg"
                    : "rounded-md text-muted hover:bg-white/10 hover:text-fg"
              } ${+d === +today && !isFrom && !isTo ? "underline decoration-cyan underline-offset-4" : ""}`}
              aria-label={d.toLocaleDateString("es-CO")}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PeriodPicker({ period, range, onChange }: { period: Period; range: Range; onChange: (p: Period) => void }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(range.start.getFullYear(), range.start.getMonth(), 1));
  const [from, setFrom] = useState<Date | null>(range.start);
  const [to, setTo] = useState<Date | null>(addDays(range.end, -1));
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      // Start the calendar from what is selected now.
      setFrom(range.start);
      setTo(addDays(range.end, -1));
      setMonth(new Date(addDays(range.end, -1).getFullYear(), addDays(range.end, -1).getMonth() - 1, 1));
    }
    setOpen(!open);
  };

  // First click picks the start, the second the end (in either order).
  const pick = (d: Date) => {
    if (!from || to) {
      setFrom(d);
      setTo(null);
    } else {
      const [a, b] = d < from ? [d, from] : [from, d];
      setFrom(a);
      setTo(b);
    }
  };
  const apply = () => {
    if (!from) return;
    onChange({ preset: "custom", range: { start: from, end: addDays(to ?? from, 1) } });
    setOpen(false);
  };
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);

  return (
    <div ref={box} className="relative">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-1.5 text-xs text-fg hover:border-cyan/60"
      >
        <CalendarDays size={14} className="text-cyan" />
        <span>{period.preset === "custom" ? "Personalizado" : PRESETS[period.preset]}</span>
        <span className="hidden text-muted sm:inline">· {rangeLabel(range)}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-40 mt-2 flex max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl sm:flex-row">
          <ul className="grid grid-cols-2 border-b border-line p-1.5 sm:block sm:w-44 sm:border-r sm:border-b-0">
            {(Object.keys(PRESETS) as Preset[]).map((p) => (
              <li key={p}>
                <button
                  onClick={() => {
                    onChange({ preset: p });
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-muted hover:bg-white/5 hover:text-fg"
                >
                  <span className="w-4">{period.preset === p && <Check size={14} strokeWidth={3} className="text-cyan" />}</span>
                  {PRESETS[p]}
                </button>
              </li>
            ))}
          </ul>
          <div className="space-y-3 p-4">
            <div className="flex items-start gap-2">
              <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="mt-0.5 text-faint hover:text-fg" aria-label="Mes anterior">
                <ChevronLeft size={16} />
              </button>
              <div className="flex gap-5">
                <MonthGrid month={month} from={from} to={to} onPick={pick} />
                <div className="hidden md:block">
                  <MonthGrid month={next} from={from} to={to} onPick={pick} />
                </div>
              </div>
              <button onClick={() => setMonth(next)} className="mt-0.5 text-faint hover:text-fg" aria-label="Mes siguiente">
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs">
              <input
                type="date"
                value={from ? isoDay(from) : ""}
                onChange={(e) => {
                  const d = parseDay(e.target.value);
                  if (d) setFrom(d);
                }}
                className="rounded-md border border-line bg-ink px-2 py-1 text-fg [color-scheme:dark]"
                aria-label="Desde"
              />
              <span className="text-faint">a</span>
              <input
                type="date"
                value={to ? isoDay(to) : ""}
                onChange={(e) => {
                  const d = parseDay(e.target.value);
                  if (d) setTo(d);
                }}
                className="rounded-md border border-line bg-ink px-2 py-1 text-fg [color-scheme:dark]"
                aria-label="Hasta"
              />
              <button
                onClick={apply}
                disabled={!from || (to !== null && to < from)}
                className="ml-auto rounded-md bg-cyan px-3 py-1 font-medium text-ink disabled:opacity-40"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── stat tiles ───────────────────────── */

function Delta({ now, before, goodWhenUp = true }: { now: number; before: number | null; goodWhenUp?: boolean }) {
  if (before === null) return null;
  const diff = now - before;
  if (diff === 0) return <span className="text-faint">igual que antes</span>;
  const good = diff > 0 === goodWhenUp;
  const pct = before ? ` (${diff > 0 ? "+" : ""}${Math.round((diff / before) * 100)} %)` : "";
  return (
    <span className={good ? "text-[#4ade80]" : "text-[#fb7185]"}>
      {diff > 0 ? "▲" : "▼"} {fmt.format(Math.abs(diff))}
      <span className="text-faint">{pct}</span>
    </span>
  );
}

function Tile({ label, value, hint, delta, accent }: { label: string; value: ReactNode; hint?: ReactNode; delta?: ReactNode; accent?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-panel p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted">
        {accent && <span className="h-2 w-2 rounded-sm" style={{ background: accent }} />}
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-fg">{value}</p>
      <p className="mt-1 min-h-4 truncate text-[11px] text-faint">{delta ?? hint}</p>
      {delta && hint && <p className="truncate text-[11px] text-faint">{hint}</p>}
    </div>
  );
}

/* ───────────────────────── charts ───────────────────────── */

function ActivityChart({ buckets, onDrill }: { buckets: Bucket[]; onDrill?: (b: Bucket) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const tip = useTip();
  const [hover, setHover] = useState<number | null>(null);
  const H = 230;
  const m = { l: 30, r: 4, t: 10, b: 24 };
  const pw = Math.max(0, width - m.l - m.r);
  const ph = H - m.t - m.b;
  const { top, ticks } = niceScale(Math.max(1, ...buckets.map((b) => Math.max(b.done, b.created))));
  const band = buckets.length ? pw / buckets.length : 0;
  const bw = Math.max(2, Math.min(12, (band - 6) / 2));
  const y = (v: number) => m.t + ph - (v / top) * ph;
  const every = Math.max(1, Math.ceil((buckets.length * 30) / Math.max(pw, 1)));

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label="Terminadas y parqueadas en el tiempo" onPointerLeave={() => (setHover(null), tip.hide())}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={GRID} />
              <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={AXIS} className="tabular-nums">
                {t}
              </text>
            </g>
          ))}
          {buckets.map((b, i) => {
            const x0 = m.l + i * band;
            const cx = x0 + band / 2;
            return (
              <g key={+b.start}>
                {hover === i && <rect x={x0} y={m.t} width={band} height={ph} fill="#ffffff" opacity={0.04} />}
                <path d={colPath(cx - bw - 1, y(b.done), bw, y(0) - y(b.done))} fill={METRIC_COLOR.done} />
                <path d={colPath(cx + 1, y(b.created), bw, y(0) - y(b.created))} fill={METRIC_COLOR.created} />
                {i % every === 0 && (
                  <text x={cx} y={H - 6} textAnchor="middle" fontSize={10} fill={AXIS}>
                    {b.label}
                  </text>
                )}
                <rect
                  x={x0}
                  y={m.t}
                  width={band}
                  height={ph}
                  fill="transparent"
                  className={onDrill ? "cursor-pointer" : ""}
                  onPointerMove={(e) => {
                    setHover(i);
                    tip.show(
                      e,
                      <>
                        <p className="mb-1 text-[11px] text-muted first-letter:uppercase">{b.tip}</p>
                        <TipRow color={METRIC_COLOR.done} value={b.done} label="terminadas" />
                        <TipRow color={METRIC_COLOR.created} value={b.created} label="parqueadas" />
                        {onDrill && <p className="mt-1 text-[10px] text-faint">Clic para ver solo este periodo</p>}
                      </>,
                    );
                  }}
                  onClick={() => onDrill?.(b)}
                />
              </g>
            );
          })}
          <line x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} stroke="#3a3a38" />
        </svg>
      )}
      {tip.node}
    </div>
  );
}

function OpenChart({ buckets }: { buckets: Bucket[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const tip = useTip();
  const [hover, setHover] = useState<number | null>(null);
  const H = 180;
  const m = { l: 30, r: 12, t: 12, b: 24 };
  const pw = Math.max(0, width - m.l - m.r);
  const ph = H - m.t - m.b;
  const values = buckets.map((b) => b.open);
  const lo = Math.min(...values, 0);
  const { top, ticks } = niceScale(Math.max(1, ...values));
  const x = (i: number) => m.l + (buckets.length > 1 ? (i / (buckets.length - 1)) * pw : pw / 2);
  const y = (v: number) => m.t + ph - ((v - lo) / (top - lo)) * ph;
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("");
  const area = `${line}L${x(values.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const every = Math.max(1, Math.ceil((buckets.length * 30) / Math.max(pw, 1)));
  const color = "#9085e9";

  return (
    <div ref={ref} className="relative">
      {width > 0 && buckets.length > 0 && (
        <svg
          width={width}
          height={H}
          role="img"
          aria-label="Pendientes abiertas en el tiempo"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const i = Math.round(((e.clientX - r.left - m.l) / Math.max(pw, 1)) * (buckets.length - 1));
            const k = Math.max(0, Math.min(buckets.length - 1, i));
            setHover(k);
            tip.show(
              e,
              <>
                <p className="mb-1 text-[11px] text-muted first-letter:uppercase">{buckets[k].tip}</p>
                <TipRow color={color} value={buckets[k].open} label="abiertas al cierre" />
              </>,
            );
          }}
          onPointerLeave={() => (setHover(null), tip.hide())}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={GRID} />
              <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={AXIS}>
                {t}
              </text>
            </g>
          ))}
          {buckets.map(
            (b, i) =>
              i % every === 0 && (
                <text key={+b.start} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill={AXIS}>
                  {b.label}
                </text>
              ),
          )}
          <path d={area} fill={color} opacity={0.1} />
          <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hover !== null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ph} stroke="#3a3a38" />
              <circle cx={x(hover)} cy={y(values[hover])} r={4} fill={color} stroke={SURFACE} strokeWidth={2} />
            </>
          )}
          <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={4} fill={color} stroke={SURFACE} strokeWidth={2} />
        </svg>
      )}
      {tip.node}
    </div>
  );
}

function Histogram({ bins }: { bins: { label: string; count: number }[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const tip = useTip();
  const H = 200;
  const m = { l: 4, r: 4, t: 18, b: 24 };
  const pw = Math.max(0, width - m.l - m.r);
  const ph = H - m.t - m.b;
  const max = Math.max(1, ...bins.map((b) => b.count));
  const total = bins.reduce((s, b) => s + b.count, 0);
  const band = pw / bins.length;
  const bw = Math.min(band - 2, 40);
  const y = (v: number) => m.t + ph - (v / max) * ph;
  const peak = bins.findIndex((b) => b.count === max);

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label="Histograma del tiempo de cierre" onPointerLeave={tip.hide}>
          {bins.map((b, i) => {
            const cx = m.l + i * band + band / 2;
            return (
              <g key={b.label}>
                <path d={colPath(cx - bw / 2, y(b.count), bw, y(0) - y(b.count))} fill={METRIC_COLOR.done} />
                {i === peak && b.count > 0 && (
                  <text x={cx} y={y(b.count) - 6} textAnchor="middle" fontSize={11} fill="#ededed" fontWeight={600}>
                    {b.count}
                  </text>
                )}
                <text x={cx} y={H - 6} textAnchor="middle" fontSize={band < 44 ? 8.5 : 10} fill={AXIS}>
                  {b.label}
                </text>
                <rect
                  x={m.l + i * band}
                  y={m.t}
                  width={band}
                  height={ph}
                  fill="transparent"
                  onPointerMove={(e) =>
                    tip.show(
                      e,
                      <>
                        <p className="mb-1 text-[11px] text-muted">Se cerraron en {b.label}</p>
                        <TipRow color={METRIC_COLOR.done} value={b.count} label={`tarjetas · ${total ? Math.round((b.count / total) * 100) : 0} %`} />
                      </>,
                    )
                  }
                />
              </g>
            );
          })}
          <line x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} stroke="#3a3a38" />
        </svg>
      )}
      {tip.node}
    </div>
  );
}

/** Sequential steps of one hue for counts: the surface is "nothing", the full hue is the most. */
const shade = (color: string, v: number, max: number) => {
  if (!v) return "#1a1a19";
  const t = 0.25 + 0.75 * (v / Math.max(1, max));
  return `color-mix(in oklab, ${color} ${Math.round(t * 100)}%, #1a1a19)`;
};

function Heatmap({ grid, metric }: { grid: number[][]; metric: Metric }) {
  const tip = useTip();
  const max = Math.max(...grid.flat());
  const color = METRIC_COLOR[metric];
  return (
    <div className="relative">
      <div className="grid grid-cols-[28px_repeat(24,minmax(0,1fr))] gap-[2px] text-[9px] text-faint" onPointerLeave={tip.hide}>
        {grid.map((row, d) => (
          <div key={d} className="contents">
            <span className="self-center">{WEEKDAYS[d]}</span>
            {row.map((v, h) => (
              <span
                key={h}
                className="aspect-square min-h-[10px] rounded-[3px] hover:outline hover:outline-1 hover:outline-fg/60"
                style={{ background: shade(color, v, max) }}
                onPointerMove={(e) =>
                  tip.show(
                    e,
                    <>
                      <p className="mb-1 text-[11px] text-muted">
                        {WEEKDAYS[d]} · {h}:00 – {h + 1}:00
                      </p>
                      <TipRow color={color} value={v} label={METRIC[metric].toLowerCase()} />
                    </>,
                  )
                }
              />
            ))}
          </div>
        ))}
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="text-center">
            {h % 6 === 0 ? h : ""}
          </span>
        ))}
      </div>
      <Scale color={color} />
      {tip.node}
    </div>
  );
}

function Scale({ color }: { color: string }) {
  return (
    <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-faint">
      menos
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: shade(color, i, 4) }} />
      ))}
      más
    </div>
  );
}

const fmtMonthShort = new Intl.DateTimeFormat("es-CO", { month: "short" });
const fmtLongDay = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** A year of days, GitHub style, ending with the week of `end`. */
function YearCalendar({ days, end, range, metric, onPick }: { days: Map<string, number>; end: Date; range: Range; metric: Metric; onPick: (d: Date) => void }) {
  const tip = useTip();
  const last = startOfWeek(end);
  const first = addDays(last, -52 * 7);
  const weeks = Array.from({ length: 53 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)));
  const visible = weeks.flat().filter((d) => d <= end);
  const max = Math.max(1, ...visible.map((d) => days.get(isoDay(d)) ?? 0));
  const color = METRIC_COLOR[metric];
  const total = visible.reduce((s, d) => s + (days.get(isoDay(d)) ?? 0), 0);
  const active = visible.filter((d) => days.get(isoDay(d))).length;

  return (
    <div className="relative">
      <p className="mb-3 text-xs text-muted">
        <span className="font-semibold text-fg">{fmt.format(total)}</span> {METRIC[metric].toLowerCase()} en el último año ·{" "}
        <span className="font-semibold text-fg">{active}</span> días con actividad
      </p>
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex gap-[3px]" onPointerLeave={tip.hide}>
          <div className="mr-1 grid grid-rows-[14px_repeat(7,11px)] gap-[3px] text-[9px] text-faint">
            <span />
            {WEEKDAYS.map((d, i) => (
              <span key={d} className="leading-[11px]">
                {i % 2 === 0 ? d : ""}
              </span>
            ))}
          </div>
          {weeks.map((week, w) => (
            <div key={w} className="grid grid-rows-[14px_repeat(7,11px)] gap-[3px]">
              <span className="text-[9px] whitespace-nowrap text-faint">
                {week[0].getDate() <= 7 || w === 0 ? fmtMonthShort.format(week[0]) : ""}
              </span>
              {week.map((d) => {
                if (d > end) return <span key={+d} />;
                const v = days.get(isoDay(d)) ?? 0;
                const inside = inRange(d, range);
                return (
                  <button
                    key={+d}
                    onClick={() => onPick(d)}
                    aria-label={`${fmtLongDay.format(d)}: ${v}`}
                    className={`h-[11px] w-[11px] rounded-[3px] hover:outline hover:outline-1 hover:outline-fg/70 ${inside ? "" : "opacity-45"}`}
                    style={{ background: shade(color, v, max) }}
                    onPointerMove={(e) =>
                      tip.show(
                        e,
                        <>
                          <p className="mb-1 text-[11px] text-muted first-letter:uppercase">{fmtLongDay.format(d)}</p>
                          <TipRow color={color} value={v} label={METRIC[metric].toLowerCase()} />
                        </>,
                      )
                    }
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="mt-3 text-[10px] text-faint">Lo que queda fuera del periodo se ve atenuado. Clic en un día para verlo.</p>
        <Scale color={color} />
      </div>
      {tip.node}
    </div>
  );
}

function Bars({ rows, color, empty = "Nada en este periodo." }: { rows: Row[]; color: string; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (!rows.length) return <p className="text-xs text-faint">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="text-xs">
          <div className="mb-1 flex items-baseline gap-2">
            {r.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />}
            <span className="truncate text-muted">{r.label}</span>
            <span className="ml-auto font-semibold text-fg tabular-nums">{r.count}</span>
            <span className="w-9 text-right text-faint tabular-nums">{Math.round((r.count / total) * 100)} %</span>
          </div>
          <svg width="100%" height={6} className="block">
            <rect width="100%" height={6} rx={3} fill="#1a1a19" />
            <rect width={`${(r.count / max) * 100}%`} height={6} rx={3} fill={color} />
          </svg>
        </li>
      ))}
    </ul>
  );
}

function ProjectTable({ rows, onPick }: { rows: ReturnType<typeof byProject>; onPick: (key: string) => void }) {
  const tip = useTip();
  const max = Math.max(1, ...rows.map((r) => Math.max(r.done, r.created)));
  if (!rows.length) return <p className="text-xs text-faint">Ningún proyecto tuvo movimiento en este periodo.</p>;
  return (
    <div className="relative -mx-1 overflow-x-auto">
      <table className="w-full min-w-[460px] text-xs">
        <thead>
          <tr className="text-left text-[10px] tracking-wide text-faint uppercase">
            <th className="px-1 pb-2 font-normal">Proyecto</th>
            <th className="w-[38%] px-1 pb-2 font-normal">Actividad</th>
            <th className="px-1 pb-2 text-right font-normal">Hechas</th>
            <th className="px-1 pb-2 text-right font-normal">Nuevas</th>
            <th className="px-1 pb-2 text-right font-normal">Abiertas</th>
            <th className="hidden px-1 pb-2 text-right font-normal sm:table-cell">Último mov.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="group border-t border-line/60">
              <td className="max-w-[180px] px-1 py-2">
                <button onClick={() => onPick(r.key)} className="flex max-w-full items-center gap-2 text-left hover:text-cyan" title="Filtrar por este proyecto">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
                  <span className="truncate text-fg group-hover:text-cyan">{r.name}</span>
                  {r.closed && <span className="shrink-0 rounded border border-line px-1 text-[9px] text-faint">cerrado</span>}
                </button>
              </td>
              <td className="px-1 py-2" onPointerLeave={tip.hide}>
                <svg
                  width="100%"
                  height={16}
                  className="block"
                  onPointerMove={(e) =>
                    tip.show(
                      e,
                      <>
                        <p className="mb-1 text-[11px] text-muted">{r.name}</p>
                        <TipRow color={METRIC_COLOR.done} value={r.done} label="terminadas" />
                        <TipRow color={METRIC_COLOR.created} value={r.created} label="parqueadas" />
                      </>,
                    )
                  }
                >
                  <rect y={1} width={`${(r.done / max) * 100}%`} height={6} rx={3} fill={METRIC_COLOR.done} />
                  <rect y={9} width={`${(r.created / max) * 100}%`} height={6} rx={3} fill={METRIC_COLOR.created} />
                </svg>
              </td>
              <td className="px-1 py-2 text-right font-semibold text-fg tabular-nums">{r.done}</td>
              <td className="px-1 py-2 text-right text-muted tabular-nums">{r.created}</td>
              <td className="px-1 py-2 text-right text-muted tabular-nums">{r.open}</td>
              <td className="hidden px-1 py-2 text-right text-faint sm:table-cell">{r.lastAt ? ago(r.lastAt.toISOString()) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {tip.node}
    </div>
  );
}

const fmtTime = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" });
const fmtLogDay = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" });

function Log({ evts, projects }: { evts: Event[]; projects: Map<string, ProjectDTO> }) {
  const [limit, setLimit] = useState(60);
  const shown = [...evts].reverse().slice(0, limit);
  const groups = new Map<string, Event[]>();
  for (const e of shown) {
    const k = isoDay(e.at);
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  if (!evts.length) return <p className="text-xs text-faint">Sin movimiento en este periodo.</p>;
  return (
    <div className="space-y-4">
      {[...groups].map(([day, items]) => (
        <section key={day}>
          <h3 className="mb-1.5 text-[11px] text-faint first-letter:uppercase">
            {fmtLogDay.format(parseDay(day)!)} · {items.filter((e) => e.metric === "done").length} hechas, {items.filter((e) => e.metric === "created").length} nuevas
          </h3>
          <ul className="space-y-1">
            {items.map((e) => {
              const g = groupOf(e.card, projects);
              const lead = e.metric === "done" ? leadHours(e.card) : null;
              return (
                <li key={`${e.card.id}-${e.metric}`} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-raised">
                  {e.metric === "done" ? (
                    <CircleCheck size={14} className="mt-px shrink-0" style={{ color: METRIC_COLOR.done }} aria-label="Terminada" />
                  ) : (
                    <Plus size={14} className="mt-px shrink-0" style={{ color: METRIC_COLOR.created }} aria-label="Parqueada" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="leading-snug text-fg">
                      <span className="font-mono text-faint">#{e.card.number}</span> {e.card.title}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-faint">
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: g.color }} />
                        {g.name}
                      </span>
                      {lead !== null && <span>tomó {durationLabel(lead)}</span>}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[10.5px] text-faint">{fmtTime.format(e.at)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {evts.length > limit && (
        <button onClick={() => setLimit(limit + 100)} className="w-full rounded-lg border border-line py-2 text-xs text-muted hover:bg-raised hover:text-fg">
          Mostrar más ({evts.length - limit} restantes)
        </button>
      )}
    </div>
  );
}

/* ───────────────────────── the page ───────────────────────── */

/** What Parkboard Autopilot is doing: how many cards in each state and each one with its PR and last note. */
function AutopilotPanel({ rows }: { rows: AutopilotRow[] }) {
  const [only, setOnly] = useState<AutopilotState | null>(null);
  const count = (s: AutopilotState) => rows.filter((r) => r.state === s).length;
  const shown = only ? rows.filter((r) => r.state === only) : rows;
  return (
    <Card
      title="Autopilot"
      sub="Tarjetas que Claude toma solo: las que tienen la etiqueta auto y lo que hizo con ellas. Estado actual, no depende del periodo."
      right={<Bot size={16} className="text-faint" />}
    >
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {(Object.keys(AUTOPILOT_STATE) as AutopilotState[]).map((s) => {
          const meta = AUTOPILOT_STATE[s];
          const active = only === s;
          return (
            <button
              key={s}
              onClick={() => setOnly(active ? null : s)}
              title={meta.hint}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${active ? "border-fg/40 bg-fg/5" : "border-line hover:border-fg/20"}`}
            >
              <span className="flex items-center gap-1.5 text-[11px] text-muted">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
                {meta.label}
              </span>
              <span className="mt-0.5 block text-lg font-semibold tabular-nums text-fg">{count(s)}</span>
            </button>
          );
        })}
      </div>
      {shown.length ? (
        <ul className="divide-y divide-line">
          {shown.map(({ card, state, pr, note }) => {
            const meta = AUTOPILOT_STATE[state];
            return (
              <li key={card.id} className="py-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="rounded-full px-2 py-0.5 text-[10.5px] font-medium" style={{ background: `${meta.color}22`, color: meta.color }}>
                    {meta.label}
                  </span>
                  <span className="font-mono text-faint">#{card.number}</span>
                  <span className="min-w-0 flex-1 truncate text-fg" title={card.title}>
                    {card.title}
                  </span>
                  {card.repo && <span className="font-mono text-[10.5px] text-faint">{card.repo}</span>}
                  {pr && (
                    <a href={pr} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-cyan hover:underline">
                      PR <ExternalLink size={11} />
                    </a>
                  )}
                  <span className="text-[10.5px] text-faint">{ago(card.updatedAt)}</span>
                </div>
                {note && state !== "queued" && <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted">{note.text}</p>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-faint">
          {rows.length ? "Ninguna tarjeta en este estado." : "Ninguna tarjeta tiene la etiqueta auto todavía. Ponla en una task o bug con repo para que Autopilot la tome."}
        </p>
      )}
    </Card>
  );
}

export function Dashboard({ cards, projects }: { cards: CardDTO[]; projects: ProjectDTO[] }) {
  const autopilot = useMemo(() => autopilotRows(cards), [cards]);
  // Dates are cut in the viewer's time zone, which the server does not know: render after mount.
  const [now, setNow] = useState<Date | null>(null);
  const [state, setState] = useState<State>(DEFAULT);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setState(readUrl(location.search));
    setNow(new Date());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  const update = (patch: Partial<State>) => {
    const next = { ...state, ...patch };
    setState(next);
    writeUrl(next);
  };

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const first = useMemo(() => (cards.length ? new Date(Math.min(...cards.map((c) => +new Date(c.createdAt)))) : new Date()), [cards]);

  const view = useMemo(() => {
    if (!now) return null;
    const { period, filters, metric } = state;
    const range = periodRange(period, now, first);
    const prev = previousRange(period, range);
    const scoped = filterCards(cards, byId, filters);
    const all = events(scoped);
    const evts = all.filter((e) => inRange(e.at, range));
    const done = evts.filter((e) => e.metric === "done");
    const created = evts.filter((e) => e.metric === "created");
    const before = prev && all.filter((e) => inRange(e.at, prev));
    const count = (es: Event[] | null, m: Metric) => (es ? es.filter((e) => e.metric === m).length : null);
    const unit = unitFor(range);
    const leads = done.map((e) => leadHours(e.card)).filter((h): h is number => h !== null);
    const prevLeads = before?.filter((e) => e.metric === "done").map((e) => leadHours(e.card)!) ?? [];
    const metricEvts = evts.filter((e) => e.metric === metric);
    const doneDays = perDay(all.filter((e) => e.metric === "done"));
    const metricDays = perDay(all.filter((e) => e.metric === metric));
    const span = daysBetween(range.start, range.end);
    const activeDays = new Set(evts.map((e) => isoDay(e.at))).size;
    const projectRows = byProject(scoped, byId, range);
    const grid = weekHourGrid(metricEvts);
    const peak = (() => {
      let best = { d: 0, h: 0, v: 0 };
      grid.forEach((row, d) => row.forEach((v, h) => v > best.v && (best = { d, h, v })));
      return best.v ? best : null;
    })();
    const weekdayTotals = grid.map((row) => row.reduce((s, v) => s + v, 0));
    const bestDay = Math.max(...weekdayTotals) > 0 ? weekdayTotals.indexOf(Math.max(...weekdayTotals)) : null;
    const open = scoped.filter((c) => c.status !== "DONE");
    const oldest = [...open].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, 6);
    return {
      range,
      prev,
      evts,
      done,
      created,
      unit,
      buckets: series(scoped, range, unit),
      doneN: done.length,
      createdN: created.length,
      prevDone: count(before, "done"),
      prevCreated: count(before, "created"),
      median: median(leads),
      prevMedian: median(prevLeads),
      bins: leadHistogram(done.map((e) => e.card)),
      projectRows,
      liveProjects: projects.filter((p) => filters.area === "ALL" || p.area === filters.area).length,
      grid,
      peak,
      bestDay,
      metricCards: metricEvts.map((e) => e.card),
      metricDays,
      streak: currentStreak(doneDays, now),
      longest: longestStreak(doneDays),
      activeDays,
      span,
      open,
      urgent: open.filter((c) => c.priority === "URGENT" || c.priority === "HIGH").length,
      oldest,
    };
  }, [now, state, cards, byId, first, projects]);

  const drill = (b: Bucket) => update({ period: { preset: "custom", range: { start: b.start, end: b.end } } });
  const pickDay = (d: Date) => update({ period: { preset: "custom", range: { start: d, end: addDays(d, 1) } } });

  const groups = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of cards) {
      const g = groupOf(c, byId);
      if (!seen.has(g.key)) seen.set(g.key, g.closed ? `${g.name} (cerrado)` : g.name);
    }
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [cards, byId]);

  return (
    <div className="min-h-full bg-ink">
      <header className="z-30 sm:sticky sm:top-0 border-b border-line bg-ink/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:bg-raised hover:text-fg">
            <ArrowLeft size={14} /> Tablero
          </Link>
          <h1 className="pr-2 text-lg font-semibold tracking-tight">
            <span className="text-gradient">Actividad</span>
          </h1>
          {view && (
            <>
              <PeriodPicker period={state.period} range={view.range} onChange={(period) => update({ period })} />
              <Segmented
                label="Área"
                value={state.filters.area}
                options={[
                  { key: "ALL", label: "Todo" },
                  { key: "PERSONAL", label: AREA.PERSONAL },
                  { key: "WORK", label: AREA.WORK },
                ]}
                onChange={(area) => update({ filters: { ...state.filters, area } })}
              />
              <Segmented label="Vista" value={state.filters.view} options={VIEW_OPTIONS} onChange={(v) => update({ filters: { ...state.filters, view: v } })} />
              <select
                value={state.filters.project}
                onChange={(e) => update({ filters: { ...state.filters, project: e.target.value } })}
                className="max-w-[180px] rounded-lg border border-line bg-panel px-2 py-1.5 text-xs text-muted outline-none"
                aria-label="Proyecto"
              >
                <option value="">Todos los proyectos</option>
                {groups.map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
              {(state.filters.area !== "ALL" || state.filters.view !== "ALL" || state.filters.project) && (
                <button onClick={() => update({ filters: NO_FILTERS })} className="text-xs text-faint hover:text-fg">
                  Quitar filtros
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {!view ? (
        <p className="p-8 text-sm text-faint">Cargando…</p>
      ) : (
        <main className="mx-auto max-w-7xl space-y-4 px-4 py-5">
          <p className="text-xs text-muted">
            <span className="text-fg first-letter:uppercase">{rangeLabel(view.range)}</span>
            {view.prev && <> · comparado con {rangeLabel(view.prev)}</>}
          </p>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Tile label="Terminadas" accent={METRIC_COLOR.done} value={fmt.format(view.doneN)} delta={<Delta now={view.doneN} before={view.prevDone} />} />
            <Tile label="Parqueadas" accent={METRIC_COLOR.created} value={fmt.format(view.createdN)} delta={<Delta now={view.createdN} before={view.prevCreated} goodWhenUp={false} />} />
            <Tile
              label="Balance"
              value={`${view.doneN - view.createdN > 0 ? "+" : ""}${fmt.format(view.doneN - view.createdN)}`}
              hint={view.doneN >= view.createdN ? "cerraste más de lo que entró" : "entró más de lo que cerraste"}
            />
            <Tile
              label="Proyectos con actividad"
              value={view.projectRows.length}
              hint={`${view.liveProjects} proyectos abiertos en el tablero`}
            />
            <Tile
              label="Tiempo típico de cierre"
              value={durationLabel(view.median)}
              hint={view.prevMedian !== null ? `antes ${durationLabel(view.prevMedian)} · mediana` : "mediana de lo terminado"}
            />
            <Tile
              label="Racha"
              value={`${view.streak} ${view.streak === 1 ? "día" : "días"}`}
              hint={`récord ${view.longest} · activo ${view.activeDays}/${view.span} días`}
            />
          </div>

          <AutopilotPanel rows={autopilot} />

          <Card
            title="Actividad en el tiempo"
            sub={`Por ${{ hour: "hora", day: "día", week: "semana", month: "mes" }[view.unit]}. ${view.unit !== "hour" ? "Clic en una columna para verla sola." : ""}`}
            right={<Legend items={[{ label: "Terminadas", color: METRIC_COLOR.done }, { label: "Parqueadas", color: METRIC_COLOR.created }]} />}
          >
            <ActivityChart buckets={view.buckets} onDrill={view.unit === "hour" ? undefined : drill} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card
              className="lg:col-span-2"
              title="Por proyecto"
              sub={`${view.projectRows.length} con movimiento · clic en uno para filtrar`}
              right={<Legend items={[{ label: "Terminadas", color: METRIC_COLOR.done }, { label: "Parqueadas", color: METRIC_COLOR.created }]} />}
            >
              <ProjectTable rows={view.projectRows} onPick={(key) => update({ filters: { ...state.filters, project: key } })} />
            </Card>
            <Card title="Cuánto tardas en cerrar" sub={view.done.length ? `De parqueada a terminada · mediana ${durationLabel(view.median)}` : "Sin tarjetas terminadas en el periodo"}>
              <Histogram bins={view.bins} />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Pendientes abiertas" sub={`Hoy hay ${view.open.length} abiertas · ${view.urgent} urgentes o altas`}>
              <OpenChart buckets={view.buckets} />
            </Card>
            <Card
              title="Cuándo trabajas"
              sub={
                view.peak
                  ? `Más ${METRIC[state.metric].toLowerCase()} los ${WEEKDAYS[view.bestDay!].toLowerCase()} · hora pico ${view.peak.h}:00`
                  : "Sin datos en el periodo"
              }
              right={<Segmented label="Medir" value={state.metric} options={[{ key: "done", label: "Terminadas" }, { key: "created", label: "Parqueadas" }]} onChange={(metric) => update({ metric })} />}
            >
              <Heatmap grid={view.grid} metric={state.metric} />
            </Card>
          </div>

          <Card
            title="Tu año"
            right={<Segmented label="Medir" value={state.metric} options={[{ key: "done", label: "Terminadas" }, { key: "created", label: "Parqueadas" }]} onChange={(metric) => update({ metric })} />}
          >
            <YearCalendar
              days={view.metricDays}
              end={startOfDay(addDays(view.range.end, -1) < now! ? addDays(view.range.end, -1) : now!)}
              range={view.range}
              metric={state.metric}
              onPick={pickDay}
            />
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card title="Por tipo" sub={`${METRIC[state.metric]} en el periodo`}>
              <Bars rows={byKind(view.metricCards)} color={METRIC_COLOR[state.metric]} />
            </Card>
            <Card title="Por prioridad" sub={`${METRIC[state.metric]} en el periodo`}>
              <Bars rows={byPriority(view.metricCards).map((r) => ({ ...r, color: PRIORITY[r.key as keyof typeof PRIORITY].color }))} color={METRIC_COLOR[state.metric]} />
            </Card>
            <Card title="Por área" sub={`${METRIC[state.metric]} en el periodo`}>
              <Bars rows={byArea(view.metricCards, byId)} color={METRIC_COLOR[state.metric]} />
            </Card>
            <Card title="Quién la parqueó" sub={`${METRIC[state.metric]} en el periodo`}>
              <Bars rows={byOrigin(view.metricCards)} color={METRIC_COLOR[state.metric]} />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2" title="Bitácora" sub={`${view.evts.length} movimientos en el periodo, lo más reciente arriba`}>
              <Log evts={view.evts} projects={byId} />
            </Card>
            <Card title="Lo que más lleva esperando" sub="Pendientes abiertas más antiguas">
              {view.oldest.length ? (
                <ul className="space-y-2">
                  {view.oldest.map((c) => {
                    const g = groupOf(c, byId);
                    return (
                      <li key={c.id} className="rounded-lg border border-line px-3 py-2 text-xs">
                        <p className="leading-snug text-fg">
                          <span className="font-mono text-faint">#{c.number}</span> {c.title}
                        </p>
                        <p className="mt-1 flex items-center gap-2 text-[10.5px] text-faint">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: g.color }} />
                          {g.name}
                          <span className="ml-auto">{ago(c.createdAt).replace("hace ", "")}</span>
                        </p>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-xs text-faint">No hay pendientes abiertas.</p>
              )}
            </Card>
          </div>
        </main>
      )}
    </div>
  );
}
