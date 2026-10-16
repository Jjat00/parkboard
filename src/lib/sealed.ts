import type { Card, Project } from "@/generated/prisma/client";
import { blindIndex, open, seal } from "./crypto";
import type { Link } from "./types";

/**
 * Which columns hold what a user wrote, and how they go in and out of the database encrypted.
 * Everything else (ids, numbers, enums, dates, canvas positions, colors, the agent name) stays
 * in clear: the server needs it to filter, order and lay out the board.
 *
 * Each row says whether it is sealed in its `encrypted` column. Rows written before encryption
 * (or by the previous deployment during a rollout) have it false and are read as plaintext,
 * whatever their text looks like; `pnpm encrypt:existing` seals them.
 *
 * Rollout bridge: with PARKBOARD_ENCRYPT_WRITES=false new rows and edits of rows in clear stay in
 * clear, while edits of sealed rows are still sealed. That version is compatible with both the
 * one before encryption (which never sees a sealed row) and the one after (which it can read and
 * never corrupts), so the two are never live together with the old one.
 */
const CARD_TEXT = ["title", "notes", "session", "sessionId", "cwd", "vaultNote", "repo", "origin", "formerProject"] as const;
type CardText = (typeof CARD_TEXT)[number];

type CardFields = { [K in CardText]?: string | null } & { links?: Link[]; tags?: string[] };

/** The project columns a card response carries. */
export const CARD_PROJECT = { select: { slug: true, name: true, area: true, encrypted: true } } as const;

/**
 * Encrypts the fields present in a card write. `links` (a Json column) holds one sealed string
 * and `tags` (a text[] column) a single sealed element, so neither column changes type. Empty
 * values (the column defaults "", [] and null) carry nothing and stay as they are.
 */
export function sealCard<T extends CardFields>(ownerId: string, data: T) {
  const out: Record<string, unknown> = { ...data };
  for (const f of CARD_TEXT) {
    const v = data[f];
    if (v) out[f] = seal(ownerId, `Card.${f}`, v);
  }
  if (data.links) out.links = data.links.length ? seal(ownerId, "Card.links", JSON.stringify(data.links)) : [];
  if (data.tags) out.tags = data.tags.length ? [seal(ownerId, "Card.tags", JSON.stringify(data.tags))] : [];
  return out as Omit<T, "links" | "tags"> & { links?: string | never[]; tags?: string[] };
}

type ProjectRow = { slug?: string; name?: string; encrypted?: boolean; slugIndex?: string | null };

export function openProject<T extends ProjectRow>(ownerId: string, row: T) {
  const out: Record<string, unknown> = { ...row };
  // Storage details, of no use to clients.
  delete out.slugIndex;
  delete out.encrypted;
  if (row.encrypted) {
    if (row.slug !== undefined) out.slug = open(ownerId, "Project.slug", row.slug);
    if (row.name !== undefined) out.name = open(ownerId, "Project.name", row.name);
  }
  return out as Omit<T, "slugIndex" | "encrypted">;
}

export function openCard<T extends Card & { project?: ProjectRow | null }>(row: T) {
  const o = row.ownerId;
  const out: Record<string, unknown> = { ...row };
  delete out.encrypted;
  if (row.encrypted) {
    for (const f of CARD_TEXT) {
      const v = row[f];
      if (v) out[f] = open(o, `Card.${f}`, v);
    }
    out.links = typeof row.links === "string" ? JSON.parse(open(o, "Card.links", row.links)) : row.links;
    out.tags = row.tags.length ? JSON.parse(open(o, "Card.tags", row.tags[0])) : [];
  }
  if (row.project) out.project = openProject(o, row.project);
  return out as Omit<T, "links" | "tags" | "encrypted"> & { links: Link[]; tags: string[] };
}

/** Every encrypted field of an opened card, to seal a plaintext row whole. */
export function cardText(card: ReturnType<typeof openCard>) {
  const { title, notes, session, sessionId, cwd, vaultNote, repo, origin, formerProject, links, tags } = card;
  return { title, notes, session, sessionId, cwd, vaultNote, repo, origin, formerProject, links, tags };
}

/** Encrypts a project's name and slug; the slug also gets the blind index used to find it. */
export function sealProject<T extends { slug?: string; name?: string }>(ownerId: string, data: T) {
  return {
    ...data,
    ...(data.name !== undefined && { name: seal(ownerId, "Project.name", data.name) }),
    ...(data.slug !== undefined && {
      slug: seal(ownerId, "Project.slug", data.slug),
      slugIndex: blindIndex(ownerId, "Project.slug", data.slug),
    }),
  };
}

/** Matches the owner's projects with any of these slugs, sealed or not yet. */
export function slugWhere(ownerId: string, slugs: string[]) {
  return [
    { slugIndex: { in: slugs.map((s) => blindIndex(ownerId, "Project.slug", s)) } },
    { encrypted: false, slug: { in: slugs } },
  ];
}

/** False only while bridging a rollout (see above). */
const sealsNewRows = () => process.env.PARKBOARD_ENCRYPT_WRITES !== "false";

export function cardCreate<T extends CardFields>(ownerId: string, data: T) {
  return sealsNewRows() ? { ...sealCard(ownerId, data), encrypted: true } : { ...data, encrypted: false };
}

/**
 * The write for an edit of `current`, and the extra where-clause it needs. A card still in clear
 * is sealed whole, and only if nobody changed it since it was read: its other fields are written
 * back from that read (a lost race answers 409).
 */
export function cardUpdate<T extends CardFields>(ownerId: string, current: Card, data: T) {
  if (current.encrypted) return { data: sealCard(ownerId, data), guard: {} };
  // Only while the row is still in clear: if the next version sealed it meanwhile, plaintext
  // would land in a sealed row. Losing that race answers 409.
  if (!sealsNewRows()) return { data, guard: { encrypted: false } };
  return {
    data: { ...sealCard(ownerId, { ...cardText(openCard(current)), ...data }), encrypted: true },
    guard: { updatedAt: current.updatedAt },
  };
}

export function projectCreate<T extends { slug: string; name: string }>(ownerId: string, data: T) {
  if (sealsNewRows()) return { ...sealProject(ownerId, data), encrypted: true };
  return { ...data, slugIndex: blindIndex(ownerId, "Project.slug", data.slug), encrypted: false };
}

/** Like cardUpdate, for a project. */
/** Seals a deleted project's name for its cards, which keep it as `formerProject`. */
export const sealFormerProject = (ownerId: string, name: string) => seal(ownerId, "Card.formerProject", name);

export function projectUpdate<T extends { name?: string }>(ownerId: string, current: Project, data: T) {
  if (current.encrypted) return { data: sealProject(ownerId, data), guard: {} };
  // Only while the row is still in clear: if the next version sealed it meanwhile, plaintext
  // would land in a sealed row. Losing that race answers 409.
  if (!sealsNewRows()) return { data, guard: { encrypted: false } };
  const { slug, name } = openProject(ownerId, current);
  return {
    data: { ...sealProject(ownerId, { slug, name, ...data }), encrypted: true },
    guard: { updatedAt: current.updatedAt },
  };
}
