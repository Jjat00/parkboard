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

export type StatusKey = keyof typeof STATUS;
export type PriorityKey = keyof typeof PRIORITY;
export type KindKey = keyof typeof KIND;
export type AreaKey = keyof typeof AREA;
