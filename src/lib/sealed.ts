import type { Card } from "@/generated/prisma/client";
import { blindIndex, blindIndexes, open, seal } from "./crypto";
import type { Link } from "./types";

/**
 * Which columns hold what a user wrote, and how they go in and out of the database encrypted.
 * Everything else (ids, numbers, enums, dates, canvas positions, colors, the agent name) stays
 * in clear: the server needs it to filter, order and lay out the board.
 */
const CARD_TEXT = ["title", "notes", "session", "sessionId", "cwd", "vaultNote"] as const;
type CardText = (typeof CARD_TEXT)[number];

type CardFields = { [K in CardText]?: string | null } & { links?: Link[]; tags?: string[] };

/**
 * Encrypts the fields present in a card write. `links` (a Json column) holds one sealed string
 * and `tags` (a text[] column) a single sealed element, so neither column changes type.
 */
export function sealCard<T extends CardFields>(ownerId: string, data: T) {
  const out: Record<string, unknown> = { ...data };
  for (const f of CARD_TEXT) {
    const v = data[f];
    if (typeof v === "string") out[f] = seal(ownerId, `Card.${f}`, v);
  }
  if (data.links) out.links = seal(ownerId, "Card.links", JSON.stringify(data.links));
  if (data.tags) out.tags = [seal(ownerId, "Card.tags", JSON.stringify(data.tags))];
  return out as Omit<T, "links" | "tags"> & { links?: string; tags?: string[] };
}

type ProjectText = { slug?: string; name?: string };

export function openProject<T extends ProjectText>(ownerId: string, row: T) {
  const out: Record<string, unknown> = { ...row };
  delete out.slugIndex; // a hash, of no use to clients
  if (row.slug !== undefined) out.slug = open(ownerId, "Project.slug", row.slug);
  if (row.name !== undefined) out.name = open(ownerId, "Project.name", row.name);
  return out as Omit<T, "slugIndex">;
}

export function openCard<T extends Card & { project?: ProjectText | null }>(row: T) {
  const o = row.ownerId;
  const out: Record<string, unknown> = { ...row };
  for (const f of CARD_TEXT) {
    const v = row[f];
    if (typeof v === "string") out[f] = open(o, `Card.${f}`, v);
  }
  // Rows written before encryption keep their plain array.
  out.links = typeof row.links === "string" ? JSON.parse(open(o, "Card.links", row.links)) : row.links;
  out.tags = row.tags.length === 1 && row.tags[0].startsWith("enc:") ? JSON.parse(open(o, "Card.tags", row.tags[0])) : row.tags;
  if (row.project) out.project = openProject(o, row.project);
  return out as Omit<T, "links" | "tags"> & { links: Link[]; tags: string[] };
}

/** Encrypts a project's name and slug; the slug also gets the blind index used to find it. */
export function sealProject<T extends ProjectText>(ownerId: string, data: T) {
  return {
    ...data,
    ...(data.name !== undefined && { name: seal(ownerId, "Project.name", data.name) }),
    ...(data.slug !== undefined && {
      slug: seal(ownerId, "Project.slug", data.slug),
      slugIndex: blindIndex(ownerId, "Project.slug", data.slug),
    }),
  };
}

/** Matches the owner's projects with any of these slugs, under any key of the ring. */
export function slugWhere(ownerId: string, slugs: string[]) {
  return [
    { slugIndex: { in: slugs.flatMap((s) => blindIndexes(ownerId, "Project.slug", s)) } },
    // Rows not yet encrypted by `pnpm encrypt:existing`. Drop once every deployment ran it.
    { slug: { in: slugs } },
  ];
}
