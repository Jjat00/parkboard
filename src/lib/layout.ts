import type { CardDTO, ProjectDTO } from "./types";

export const CARD_W = 240;
export const INBOX_ID = "__inbox";
export const COMPACT_H = 64;
export const EXPANDED_H = 196;
const GAP = 10;
const PAD = 14;
const HEADER = 46;
/** Space between the header line and the first card. */
const TOP = 12;
const MAX_COLS = 3;
const EMPTY_H = 44;

const STATUS_ORDER = { DOING: 0, PENDING: 1, IDEA: 2, DONE: 3 } as const;
const PRIORITY_ORDER = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;

export const SORT_MODES = {
  auto: "En curso y prioridad",
  newest: "Más recientes",
  oldest: "Más antiguas",
  updated: "Última actualización",
} as const;
export type SortMode = keyof typeof SORT_MODES;

/** auto: in progress first, then by priority, then oldest first. The rest sort by date. */
export function sortCards(cards: CardDTO[], mode: SortMode = "auto") {
  const by = {
    auto: (a: CardDTO, b: CardDTO) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      a.createdAt.localeCompare(b.createdAt),
    newest: (a: CardDTO, b: CardDTO) => b.createdAt.localeCompare(a.createdAt),
    oldest: (a: CardDTO, b: CardDTO) => a.createdAt.localeCompare(b.createdAt),
    updated: (a: CardDTO, b: CardDTO) => b.updatedAt.localeCompare(a.updatedAt),
  }[mode];
  return [...cards].sort(by);
}

export type ProjectLayout = {
  width: number;
  height: number;
  /** Card positions relative to the project. */
  cards: Map<string, { x: number; y: number; h: number }>;
};

/**
 * Packs a project's visible cards in up to three columns, each card going to the
 * shortest column, and sizes the project to fit them.
 */
export function layoutProject(
  cards: CardDTO[],
  isExpanded: (id: string) => boolean,
  mode: SortMode = "auto",
): ProjectLayout {
  const cols = Math.max(1, Math.min(MAX_COLS, cards.length));
  const heights = Array<number>(cols).fill(0);
  const positions = new Map<string, { x: number; y: number; h: number }>();
  for (const card of sortCards(cards, mode)) {
    const h = isExpanded(card.id) ? EXPANDED_H : COMPACT_H;
    const col = heights.indexOf(Math.min(...heights));
    positions.set(card.id, { x: PAD + col * (CARD_W + GAP), y: HEADER + TOP + heights[col], h });
    heights[col] += h + GAP;
  }
  const content = cards.length ? Math.max(...heights) - GAP : EMPTY_H;
  return {
    width: PAD * 2 + cols * CARD_W + (cols - 1) * GAP,
    height: HEADER + TOP + content + PAD,
    cards: positions,
  };
}

/**
 * Stacks projects in columns so auto-sized projects never overlap: each project keeps its
 * column (by x) and is pushed down below the one above it.
 */
export function resolveOverlaps(projects: ProjectDTO[], sizes: Map<string, { width: number; height: number }>) {
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const out = new Map<string, { x: number; y: number }>();
  for (const p of [...projects].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const size = sizes.get(p.id)!;
    let y = p.y;
    let moved = true;
    while (moved) {
      moved = false;
      for (const o of placed) {
        const overlapX = p.x < o.x + o.w && p.x + size.width > o.x;
        const overlapY = y < o.y + o.h + 24 && y + size.height + 24 > o.y;
        if (overlapX && overlapY) {
          y = o.y + o.h + 24;
          moved = true;
        }
      }
    }
    placed.push({ x: p.x, y, w: size.width, h: size.height });
    out.set(p.id, { x: p.x, y });
  }
  return out;
}

/**
 * Tidy layout for the "Acomodar" button: work projects first, then personal, each project
 * going to the shortest of two or three columns.
 */
export function arrangeProjects(projects: ProjectDTO[], sizes: Map<string, { width: number; height: number }>) {
  const order = [...projects].sort(
    (a, b) => (a.area === b.area ? 0 : a.area === "WORK" ? -1 : 1) || a.createdAt.localeCompare(b.createdAt),
  );
  const cols = order.length <= 4 ? 2 : 3;
  const heights = Array<number>(cols).fill(0);
  const widths = Array<number>(cols).fill(0);
  const column = new Map<string, { col: number; y: number }>();
  for (const p of order) {
    const size = sizes.get(p.id)!;
    const col = heights.indexOf(Math.min(...heights));
    column.set(p.id, { col, y: heights[col] });
    heights[col] += size.height + 32;
    widths[col] = Math.max(widths[col], size.width);
  }
  // Each column is as wide as its widest project.
  const xs = widths.map((_, i) => widths.slice(0, i).reduce((sum, w) => sum + (w ? w + 48 : 0), 0));
  const out = new Map<string, { x: number; y: number }>();
  for (const [id, { col, y }] of column) out.set(id, { x: xs[col], y });
  return out;
}
