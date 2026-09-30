import type { CardDTO, ProjectDTO } from "./types";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  board: () => call<{ projects: ProjectDTO[]; cards: CardDTO[] }>("GET", "/api/board"),
  createCard: (data: Partial<CardDTO> & { title: string; project?: string | null }) =>
    call<{ card: CardDTO }>("POST", "/api/cards", data),
  updateCard: (id: string, data: Partial<Omit<CardDTO, "projectId">> & { project?: string | null }) =>
    call<{ card: CardDTO }>("PATCH", `/api/cards/${id}`, data),
  deleteCard: (id: string) => call<{ ok: true }>("DELETE", `/api/cards/${id}`),
  createProject: (data: Partial<ProjectDTO> & { name: string }) =>
    call<{ project: ProjectDTO }>("POST", "/api/projects", data),
  updateProject: (id: string, data: Partial<ProjectDTO>) =>
    call<{ project: ProjectDTO }>("PATCH", `/api/projects/${id}`, data),
  deleteProject: (id: string) => call<{ ok: true }>("DELETE", `/api/projects/${id}`),
};
