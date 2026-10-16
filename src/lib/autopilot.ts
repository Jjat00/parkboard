import type { CardDTO } from "./types";

/**
 * Where a card stands with Parkboard Autopilot (autopilot/), read from its tags: `auto` queues
 * it, `auto-en-curso-…` is a run holding it, `auto-pr` and `auto-main` are its results and
 * `auto-bloqueada` means it was handed back. Each run follows the open PRs on GitHub and turns
 * `auto-pr` into `auto-pr-fusionado` or `auto-pr-cerrado`. Cards that never touched Autopilot have none.
 */
export type AutopilotState = "queued" | "working" | "pr" | "prMerged" | "prClosed" | "main" | "blocked" | "done";

export const AUTOPILOT_STATE: Record<AutopilotState, { label: string; color: string; hint: string }> = {
  queued: { label: "En cola", color: "#8b8ba3", hint: "con auto, esperando la próxima pasada" },
  working: { label: "Trabajando", color: "#f5d90a", hint: "una ejecución la tiene ahora" },
  pr: { label: "PR por revisar", color: "#9e8cfc", hint: "PR abierto que revisas tú" },
  prMerged: { label: "PR fusionado", color: "#4ade80", hint: "fusionaste su PR" },
  prClosed: { label: "PR cerrado", color: "#a1a1aa", hint: "su PR se cerró sin fusionar" },
  main: { label: "En main", color: "#4ade80", hint: "cambio trivial fusionado solo" },
  blocked: { label: "Devuelta", color: "#fb7185", hint: "no la pudo hacer; el motivo está en sus notas" },
  done: { label: "Cerrada", color: "#a1a1aa", hint: "la cerraste antes de que se viera qué pasó con su PR" },
};

export function autopilotState(card: CardDTO): AutopilotState | null {
  const t = card.tags;
  if (t.some((x) => x.startsWith("auto-en-curso"))) return "working";
  if (t.includes("auto-main")) return "main";
  if (t.includes("auto-pr-fusionado")) return "prMerged";
  if (t.includes("auto-pr-cerrado")) return "prClosed";
  // A closed card is no longer waiting for review, whatever its PR did.
  if (t.includes("auto-pr")) return card.status === "DONE" ? "done" : "pr";
  if (t.includes("auto-bloqueada")) return "blocked";
  if (t.includes("auto") && card.status !== "DONE") return "queued";
  return null;
}

const NOTE = "**Autopilot (";

/**
 * The last entry Autopilot wrote in the notes: its date and what it said. An entry runs until the
 * first blank line (Autopilot never writes one inside an entry), so whatever Jaime wrote after it
 * is not taken as Autopilot's, even after a truncated ``` block.
 */
export function lastAutopilotNote(notes: string): { date: string; text: string } | null {
  const i = notes.lastIndexOf(NOTE);
  if (i < 0) return null;
  const m = /^\*\*Autopilot \((\d{4}-\d{2}-\d{2})\):\*\* ([^\n]*(?:\n(?![ \t]*\n)[^\n]*)*)/.exec(notes.slice(i));
  return m ? { date: m[1], text: m[2].trim() } : null;
}

/** The PR Autopilot opened for the card, if any (the newest one). */
export const autopilotPr = (card: CardDTO) => [...card.links].reverse().find((l) => l.label === "PR de Autopilot")?.url ?? null;

export type AutopilotRow = { card: CardDTO; state: AutopilotState; pr: string | null; note: { date: string; text: string } | null };

/** Every card Autopilot has touched or will take, the most recently moved first. */
export function autopilotRows(cards: CardDTO[]): AutopilotRow[] {
  return cards
    .map((card) => ({ card, state: autopilotState(card) }))
    .filter((r): r is { card: CardDTO; state: AutopilotState } => r.state !== null)
    .map((r) => ({ ...r, pr: autopilotPr(r.card), note: lastAutopilotNote(r.card.notes) }))
    .sort((a, b) => b.card.updatedAt.localeCompare(a.card.updatedAt));
}
