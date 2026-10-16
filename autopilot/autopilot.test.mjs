import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addLink,
  appendNote,
  authorized,
  branchFor,
  checkPatch,
  eligible,
  forbidden,
  gate,
  originRepo,
  parseLease,
  repoHash,
  leaseTag,
  parseNumstat,
  run,
  settlePatch,
  validateRepos,
  withTags,
} from "./autopilot.mjs";

test("protected paths at any depth", () => {
  for (const p of [
    ".github/workflows/pwn.yml",
    "apps/web/.github/CODEOWNERS",
    "prisma/migrations/20261016/migration.sql",
    "x/migrations/a.sql",
    "migrations/0001.sql",
    ".env",
    ".env.local",
    "a/b/.env.production",
    "Dockerfile",
    "a/Dockerfile.dev",
    "sub/package-lock.json",
    "sub/pnpm-lock.yaml",
    "sub/vercel.json",
    "sub/railway.toml",
    "prisma/schema.prisma",
    "infra/certs/server.pem",
    ".claude/settings.json",
    "pkg/.husky/pre-commit",
  ])
    assert.equal(forbidden(p), true, p);
  // The protected directory itself (a file or symlink named like it), and control characters.
  for (const p of ["x/.github", "x/migrations", "safe\t/.github/workflows/x.yml", "safe\n/.github/workflows/x.yml", "a\nb.txt"])
    assert.equal(forbidden(p), true, JSON.stringify(p));
  for (const p of ["src/texto.mjs", "README.md", "src/migration-helpers.ts", "docs/github.md", "src/envelope.ts"])
    assert.equal(forbidden(p), false, p);
});

test("numstat: binaries and renames", () => {
  const files = parseNumstat("3\t1\tsrc/a.mjs\0-\t-\timg.png\0");
  assert.deepEqual(files, [
    { path: "src/a.mjs", lines: 4 },
    { path: "img.png", lines: null },
  ]);
  assert.deepEqual(parseNumstat("1\t1\t\0old.js\0new.js\0"), [
    { path: "old.js", lines: 2 },
    { path: "new.js", lines: 0 },
  ]);
});

test("numstat keeps tabs in names", () => {
  assert.deepEqual(parseNumstat("1\t0\tsafe\t/package-lock.json\0"), [{ path: "safe\t/package-lock.json", lines: 1 }]);
  assert.match(checkPatch(parseNumstat("1\t0\tsafe\t/package-lock.json\0"), 10), /control/);
});

test("patch limits", () => {
  const limits = { maxFiles: 2, maxLines: 10, maxPatchBytes: 100 };
  assert.equal(checkPatch([{ path: "a.js", lines: 3 }], 50, limits), null);
  assert.match(checkPatch([{ path: "a.png", lines: null }], 50, limits), /binario/);
  assert.match(checkPatch([{ path: ".github/workflows/x.yml", lines: 1 }], 50, limits), /protegidas/);
  assert.match(checkPatch([{ path: "a", lines: 1 }, { path: "b", lines: 1 }, { path: "c", lines: 1 }], 50, limits), /archivos/);
  assert.match(checkPatch([{ path: "a", lines: 11 }], 50, limits), /líneas/);
  assert.match(checkPatch([{ path: "a", lines: 1 }], 70_000, limits), /bytes/);
});

const repos = { "o/r": { verify: "npm test" } };
const card = (over = {}) => ({
  status: "PENDING",
  kind: "BUG",
  priority: "LOW",
  repo: "o/r",
  title: "titulo() colapsa espacios",
  notes: "",
  tags: ["auto"],
  ...over,
});

test("gate", () => {
  assert.equal(gate(card(), repos), null);
  assert.match(gate(card({ kind: "IDEA" }), repos), /tipo/);
  assert.match(gate(card({ priority: "URGENT" }), repos), /urgente/);
  assert.match(gate(card({ repo: null }), repos), /repo/);
  assert.match(gate(card({ repo: "o/otro" }), repos), /verificadores/);
  for (const t of [
    "Delete all customer records",
    "Actualizar token de acceso",
    "Cambiar esquema de la base de datos",
    "Documentar elección de colores",
    "Rotar la API key",
    "Arreglar el deploy",
  ])
    assert.match(gate(card({ title: t }), repos), /menciona/, t);
});

test("eligible", () => {
  assert.equal(eligible(card()), true);
  assert.equal(eligible(card({ tags: [] })), false);
  for (const t of ["auto-pr", "auto-bloqueada", "auto-en-curso-mvb8tlvhf5be-a1b2c3"]) assert.equal(eligible(card({ tags: ["auto", t] })), false, t);
});

test("repos.json validation", () => {
  assert.doesNotThrow(() => validateRepos({ "o/r": { verify: "npm test", setup: "npm ci", allow: ["npm test"], env: { X: "1" } } }));
  assert.throws(() => validateRepos({ "o/r": {} }), /verify/);
  assert.throws(() => validateRepos({ "o/r": { verify: " " } }), /verify/);
  assert.throws(() => validateRepos({ "o/r": { verify: "x", allow: ["", "y"] } }), /allow/);
  assert.throws(() => validateRepos({ "o/r": { verify: "x", env: { GITHUB_TOKEN: "t" } } }), /secret/);
  assert.throws(() => validateRepos({ "a b": { verify: "x" } }), /owner/);
});

test("notes keep the new line when full", () => {
  const full = "x".repeat(20000);
  const out = appendNote(full, "abrí un PR: https://github.com/o/r/pull/1", "2026-10-16");
  assert.ok(out.length <= 20000);
  assert.ok(out.endsWith("abrí un PR: https://github.com/o/r/pull/1"));
  assert.equal(appendNote("", "hola", "2026-10-16"), "**Autopilot (2026-10-16):** hola");
});

test("links keep the new one", () => {
  const links = Array.from({ length: 30 }, (_, i) => ({ url: `https://e.com/${i}` }));
  const out = addLink(links, { url: "https://github.com/o/r/pull/1" });
  assert.equal(out.length, 30);
  assert.equal(out.at(-1).url, "https://github.com/o/r/pull/1");
});

test("tags and leases", () => {
  assert.deepEqual(withTags(["auto", "x"], ["auto-pr"], ["auto"]), ["x", "auto-pr"]);
  const now = Date.now();
  const tag = leaseTag("Jjat00/parkboard", now);
  assert.ok(tag.length <= 40, tag);
  const lease = parseLease(tag);
  assert.equal(lease.start, now);
  assert.equal(lease.hash, repoHash("jjat00/PARKBOARD"));
  assert.equal(parseLease("auto"), null);
  assert.equal(parseLease("auto-en-curso"), null);
});

test("timeout kills the whole process group and settles", async () => {
  const started = Date.now();
  const res = await run("sh", ["-c", "sleep 30 & sleep 30; echo never"], { timeoutMs: 300, ok: true });
  assert.equal(res.signal, "TIMEOUT");
  assert.ok(Date.now() - started < 7000);
});

const RUN = `auto-en-curso-mvb8tlvhf5be-${repoHash("o/r")}`;
const doing = (over = {}) => card({ status: "DOING", tags: ["auto", RUN], notes: "n", links: [], ...over });

test("authorization of a run", () => {
  const c = card();
  assert.equal(authorized(doing(), c, RUN), true);
  assert.equal(authorized(doing({ status: "DONE" }), c, RUN), false);
  assert.equal(authorized(doing({ tags: ["auto-en-curso", RUN] }), c, RUN), false);
  assert.equal(authorized(doing({ repo: "o/otro" }), c, RUN), false);
  assert.equal(authorized(doing({ tags: ["auto"] }), c, RUN), false);
  assert.equal(branchFor(218, RUN), "autopilot/218-mvb8tlvhf5be");
});

test("settling never undoes a manual close or withdrawal", () => {
  const c = card();
  const date = "2026-10-16";
  // Authorized: the outcome decides tags and status.
  let p = settlePatch(doing(), c, RUN, { outcome: "pr", note: "pr", link: { url: "https://x/pr/1" }, date });
  assert.deepEqual([p.status, p.tags], ["DOING", ["auto-pr"]]);
  assert.equal(p.links.at(-1).url, "https://x/pr/1");
  p = settlePatch(doing(), c, RUN, { outcome: "blocked", note: "b", date });
  assert.deepEqual([p.status, p.tags], ["PENDING", ["auto-bloqueada"]]);
  p = settlePatch(doing(), c, RUN, { outcome: "limit", note: "l", date });
  assert.deepEqual([p.status, p.tags], ["PENDING", ["auto"]]);
  // Closed by Jaime with the run tag still there: status stays DONE, only the lease goes.
  p = settlePatch(doing({ status: "DONE" }), c, RUN, { outcome: "blocked", note: "b", date });
  assert.equal(p.status, undefined);
  assert.deepEqual(p.tags, ["auto"]);
  p = settlePatch(doing({ status: "DONE" }), c, RUN, { outcome: "pr", note: "pr", date });
  assert.equal(p.status, undefined);
  // Withdrawn (repo changed) while still DOING: back to pending, never DOING without a lease.
  p = settlePatch(doing({ repo: "o/otro" }), c, RUN, { outcome: "cancelled", note: "c", date });
  assert.deepEqual([p.status, p.tags], ["PENDING", ["auto"]]);
  // Not ours any more: only the note.
  p = settlePatch(card({ status: "DOING", notes: "" }), c, RUN, { outcome: "blocked", note: "b", date });
  assert.deepEqual(Object.keys(p), ["notes"]);
});

test("the lease remembers its repository, whatever the case", () => {
  const repos = { "Jjat00/parkboard": { verify: "x" }, "o/r": { verify: "y" } };
  assert.equal(originRepo(leaseTag("jjat00/parkboard"), repos), "Jjat00/parkboard");
  assert.equal(originRepo(leaseTag("otro/repo"), repos), null);
  const p = settlePatch(doing(), card(), RUN, { outcome: "blocked", note: "b", date: "2026-10-16" });
  assert.deepEqual(p.tags, ["auto-bloqueada"]);
});

test("a card needs room for the lease tag", () => {
  const tags = (n) => ["auto", ...Array.from({ length: n - 1 }, (_, i) => `t${i}`)];
  assert.equal(gate(card({ tags: tags(19) }), repos), null);
  assert.match(gate(card({ tags: tags(20) }), repos), /etiquetas/);
});
