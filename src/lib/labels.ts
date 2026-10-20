import type { Lang } from "./lang-shared";

const COLORS = { LOW: "#666666", MEDIUM: "#68ddfd", HIGH: "#f5d90a", URGENT: "#fb7185" } as const;

const TEXT = {
  es: {
    STATUS: { IDEA: "Idea", PENDING: "Pendiente", DOING: "En curso", DONE: "Hecho" },
    PRIORITY: { LOW: "Baja", MEDIUM: "Media", HIGH: "Alta", URGENT: "Urgente" },
    KIND: { TASK: "Tarea", IDEA: "Idea", BUG: "Bug", RESEARCH: "Investigación", NOTE: "Nota" },
    AREA: { PERSONAL: "Personal", WORK: "Trabajo" },
    VIEWS: {
      tasks: { label: "Tareas", placeholder: "Parquear algo para después…" },
      ideas: { label: "Ideas", placeholder: "Anotar una idea…" },
      notes: { label: "Notas", placeholder: "Anotar algo para tener en cuenta…" },
    },
  },
  en: {
    STATUS: { IDEA: "Idea", PENDING: "Pending", DOING: "In progress", DONE: "Done" },
    PRIORITY: { LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent" },
    KIND: { TASK: "Task", IDEA: "Idea", BUG: "Bug", RESEARCH: "Research", NOTE: "Note" },
    AREA: { PERSONAL: "Personal", WORK: "Work" },
    VIEWS: {
      tasks: { label: "Tasks", placeholder: "Park something for later…" },
      ideas: { label: "Ideas", placeholder: "Jot down an idea…" },
      notes: { label: "Notes", placeholder: "Note something to keep in mind…" },
    },
  },
} as const;

const VIEW_KIND = { tasks: "TASK", ideas: "IDEA", notes: "NOTE" } as const;

/**
 * Labels in one language, keyed like the database enums. Pass the language from useLang() on the
 * client or preferredLang() on the server.
 */
export function labels(lang: Lang) {
  const t = TEXT[lang];
  return {
    STATUS: t.STATUS,
    PRIORITY: Object.fromEntries(
      (Object.keys(COLORS) as (keyof typeof COLORS)[]).map((k) => [k, { label: t.PRIORITY[k], color: COLORS[k] }]),
    ) as { [K in keyof typeof COLORS]: { label: string; color: (typeof COLORS)[K] } },
    KIND: t.KIND,
    AREA: t.AREA,
    /** The canvas shows one view at a time so ideas and notes do not crowd the tasks. */
    VIEWS: {
      tasks: { ...t.VIEWS.tasks, kind: VIEW_KIND.tasks },
      ideas: { ...t.VIEWS.ideas, kind: VIEW_KIND.ideas },
      notes: { ...t.VIEWS.notes, kind: VIEW_KIND.notes },
    },
  };
}

export const VIEW_KEYS = ["tasks", "ideas", "notes"] as const;
export type ViewKey = (typeof VIEW_KEYS)[number];

/** Bugs and research live with the tasks. */
export function viewOf(card: { kind: KindKey }): ViewKey {
  return card.kind === "IDEA" ? "ideas" : card.kind === "NOTE" ? "notes" : "tasks";
}

export type StatusKey = keyof typeof TEXT.es.STATUS;
export type PriorityKey = keyof typeof COLORS;
export type KindKey = keyof typeof TEXT.es.KIND;
export type AreaKey = keyof typeof TEXT.es.AREA;
