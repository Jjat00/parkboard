import type { AreaKey, KindKey, PriorityKey, StatusKey } from "./labels";

export type Link = { url: string; label?: string };

export type ProjectDTO = {
  id: string;
  slug: string;
  name: string;
  area: AreaKey;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CardDTO = {
  id: string;
  title: string;
  notes: string;
  status: StatusKey;
  priority: PriorityKey;
  kind: KindKey;
  /** Only for cards without project; null = loose idea. */
  area: AreaKey | null;
  links: Link[];
  tags: string[];
  origin: string;
  session: string | null;
  agent: string | null;
  sessionId: string | null;
  cwd: string | null;
  vaultNote: string | null;
  projectId: string | null;
  x: number;
  y: number;
  createdAt: string;
  doneAt: string | null;
};
