export const STATUS = {
  IDEA: "Idea",
  PENDING: "Pendiente",
  DOING: "En curso",
  DONE: "Hecho",
} as const;

export const PRIORITY = {
  LOW: { label: "Baja", color: "#666666" },
  MEDIUM: { label: "Media", color: "#68ddfd" },
  HIGH: { label: "Alta", color: "#f5d90a" },
  URGENT: { label: "Urgente", color: "#fb7185" },
} as const;

export const KIND = {
  TASK: "Tarea",
  IDEA: "Idea",
  BUG: "Bug",
  RESEARCH: "Investigación",
  NOTE: "Nota",
} as const;

export const AREA = { PERSONAL: "Personal", WORK: "Trabajo" } as const;

/** The canvas shows one view at a time so ideas and notes do not crowd the tasks. */
export const VIEWS = {
  tasks: { label: "Tareas", kind: "TASK", placeholder: "Parquear algo para después…" },
  ideas: { label: "Ideas", kind: "IDEA", placeholder: "Anotar una idea…" },
  notes: { label: "Notas", kind: "NOTE", placeholder: "Anotar algo para tener en cuenta…" },
} as const satisfies Record<string, { label: string; kind: keyof typeof KIND; placeholder: string }>;

export type ViewKey = keyof typeof VIEWS;

/** Bugs and research live with the tasks. */
export function viewOf(card: { kind: keyof typeof KIND }): ViewKey {
  return card.kind === "IDEA" ? "ideas" : card.kind === "NOTE" ? "notes" : "tasks";
}

export type StatusKey = keyof typeof STATUS;
export type PriorityKey = keyof typeof PRIORITY;
export type KindKey = keyof typeof KIND;
export type AreaKey = keyof typeof AREA;
