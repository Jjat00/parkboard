import assert from "node:assert/strict";
import { test } from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addLink,
  appendNote,
  authorized,
  branchFor,
  cardPr,
  checkPatch,
  directReason,
  eligible,
  forbidden,
  gate,
  humanNotes,
  mergeBlocker,
  mergePr,
  originRepo,
  parseLease,
  parseNameStatus,
  repoHash,
  scoutCandidates,
  leaseTag,
  parseNumstat,
  prSyncPatch,
  run,
  settlePatch,
  validateRepos,
  loadRepos,
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

test("the repo list comes from AUTOPILOT_REPOS, else an untracked file", () => {
  const none = join(tmpdir(), "no-such-repos.json");
  assert.deepEqual(loadRepos({ AUTOPILOT_REPOS: '{"o/r":{"verify":"x"}}' }, none), { "o/r": { verify: "x" } });
  assert.throws(() => loadRepos({}, none), /AUTOPILOT_REPOS/);
  assert.doesNotThrow(() => validateRepos(loadRepos({}, new URL("repos.example.json", import.meta.url).pathname)));
});

test("repo list validation", () => {
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

test("straight to main only for small edits of existing, non-config files", () => {
  const limits = { direct: true, directMaxFiles: 3, directMaxLines: 20 };
  const repo = { verify: "x", autoMerge: true };
  const M = (path) => ({ status: "M", path });
  assert.equal(directReason([{ path: "README.md", lines: 2 }], [M("README.md")], repo, limits), null);
  assert.equal(directReason([{ path: "src/app/page.tsx", lines: 1 }], [M("src/app/page.tsx")], repo, limits), null);
  assert.match(directReason([{ path: "a.md", lines: 2 }], [M("a.md")], { verify: "x" }, limits), /no permite/);
  assert.match(directReason([{ path: "a.md", lines: 2 }], [M("a.md")], repo, { ...limits, direct: false }), /apagado/);
  assert.match(directReason([{ path: "n.md", lines: 2 }], [{ status: "A", path: "n.md" }], repo, limits), /crea/);
  assert.match(directReason([{ path: "a.md", lines: 21 }], [M("a.md")], repo, limits), /líneas/);
  const four = ["a", "b", "c", "d"].map((p) => ({ path: p, lines: 1 }));
  assert.match(directReason(four, four.map((f) => M(f.path)), repo, limits), /archivos/);
  for (const f of ["package.json", "next.config.ts", "tsconfig.json", "pyproject.toml", "x/ci.yml", "run.sh"])
    assert.match(directReason([{ path: f, lines: 1 }], [M(f)], repo, limits), /configura/, f);
  for (const f of [".npmrc", "web/.pnpmfile.cjs", ".gitattributes", ".gitignore", ".nvmrc", "setup.cfg", ".eslintrc.json"])
    assert.match(directReason([{ path: f, lines: 1 }], [M(f)], repo, limits), /configura/, f);
  for (const f of ["autopilot/repos.json", "autopilot/autopilot.mjs", "autopilot/README.md"])
    assert.match(directReason([{ path: f, lines: 1 }], [M(f)], repo, limits), /Autopilot/, f);
  assert.deepEqual(parseNameStatus("M\0src/a.ts\0A\0b.md\0"), [
    { status: "M", path: "src/a.ts" },
    { status: "A", path: "b.md" },
  ]);
  assert.throws(() => validateRepos({ "o/r": { verify: "x", autoMerge: "yes" } }), /autoMerge/);
});

test("a merged change closes the card", () => {
  const p = settlePatch(doing(), card(), RUN, { outcome: "merged", note: "m", link: { url: "https://x/pr/2" }, date: "2026-10-16" });
  assert.deepEqual([p.status, p.tags], ["DONE", ["auto-main"]]);
  const q = settlePatch(doing({ status: "DONE" }), card(), RUN, { outcome: "merged", note: "m", date: "2026-10-16" });
  assert.equal(q.status, undefined);
  assert.equal(eligible(card({ tags: ["auto", "auto-main"] })), false);
});

test("the scout only looks at untouched cards that pass the gate", () => {
  const c = (n, over) => card({ number: n, createdAt: `2026-10-${10 + n}`, tags: [], ...over });
  const list = [
    c(1),
    c(2, { tags: ["auto"] }),
    c(3, { tags: ["auto-revisada"] }),
    c(4, { tags: ["auto-bloqueada"] }),
    c(5, { kind: "IDEA" }),
    c(6, { title: "Arreglar el deploy" }),
    c(7, { tags: Array.from({ length: 19 }, (_, i) => `t${i}`) }),
    c(8, { status: "DOING" }),
    c(9, { tags: ["ux"] }),
  ];
  assert.deepEqual(scoutCandidates(list, repos).map((x) => x.number), [9, 1]);
});

test("a trivial PR merges only onto the exact base it was verified on", () => {
  const v = { head: "H", baseBranch: "main", baseSha: "B", paths: new Set(["README.md"]) };
  const pr = { state: "open", base: { ref: "main", sha: "B" }, head: { sha: "H" } };
  const cmp = { base_commit: { sha: "B" }, merge_base_commit: { sha: "B" }, ahead_by: 1, behind_by: 0, files: [{ filename: "README.md" }] };
  assert.equal(mergeBlocker(pr, cmp, v), null);
  // main moved to C: same merge base, one behind (the case Codex reproduced).
  assert.match(mergeBlocker({ ...pr, base: { ref: "main", sha: "C" } }, { ...cmp, base_commit: { sha: "C" }, behind_by: 1 }, v), /avanzó/);
  assert.match(mergeBlocker(pr, { ...cmp, base_commit: { sha: "C" }, behind_by: 1 }, v), /avanzó/);
  assert.match(mergeBlocker({ ...pr, base: { ref: "dev", sha: "B" } }, cmp, v), /base o de commit/);
  assert.match(mergeBlocker({ ...pr, head: { sha: "X" } }, cmp, v), /base o de commit/);
  assert.match(mergeBlocker({ ...pr, state: "closed" }, cmp, v), /base o de commit/);
  assert.match(mergeBlocker(pr, { ...cmp, files: [{ filename: "README.md" }, { filename: "package.json" }] }, v), /solo el cambio/);
  assert.match(mergeBlocker(pr, { ...cmp, ahead_by: 2 }, v), /solo el cambio/);
});

test("Autopilot's own notes never trip the gate", () => {
  const scouted = card({
    title: "Corregir typo del encabezado",
    notes: "Cambiar helo por hello.\n\n**Autopilot (2026-10-16):** la marqué para hacerla sola (10/10): es un typo; no requiere credenciales ni tocar producción.",
  });
  assert.equal(gate(scouted, repos), null);
  assert.equal(humanNotes(scouted.notes), "Cambiar helo por hello.");
  // What Jaime writes after an entry still counts.
  const after = card({ notes: "**Autopilot (2026-10-16):** no la tomé.\n\nOjo: tocar producción." });
  assert.match(gate(after, repos), /producci/);
  // A truncated code block (cut at 4000 characters) cannot swallow Jaime's warning after it.
  const long = appendNote("Cambiar helo por hello.", "no terminé. los verificadores fallan (npm test):\n\n```\n" + "x".repeat(5000) + "\n```", "2026-10-16");
  const warned = `${long}\n\nNo tocar producción; esperar a Jaime.`;
  assert.equal(humanNotes(warned), "Cambiar helo por hello.\n\nNo tocar producción; esperar a Jaime.");
  assert.match(gate(card({ notes: warned }), repos), /producci/);
});

test("mergePr reaches the merge only for the verified change, and reconciles a lost answer", async () => {
  const v = { head: "H", baseBranch: "main", baseSha: "B", paths: new Set(["README.md"]) };
  const pr = { number: 7, html_url: "https://github.com/o/r/pull/7", head: { ref: "autopilot/1-x" } };
  const open = { state: "open", base: { ref: "main", sha: "B" }, head: { sha: "H" } };
  const cmp = { base_commit: { sha: "B" }, merge_base_commit: { sha: "B" }, ahead_by: 1, behind_by: 0, files: [{ filename: "README.md" }] };
  const theCard = card({ id: "c1" });
  const io = ({ prNow = open, cmpNow = cmp, cardNow = doing(), put = () => ({}), after = () => ({ merged_at: null }) } = {}) => {
    const calls = [];
    return {
      calls,
      github: async (method, path) => {
        calls.push(`${method} ${path}`);
        if (method === "PUT") return put();
        if (path.includes("/compare/")) return cmpNow;
        if (method === "GET" && path.endsWith("/pulls/7")) return calls.filter((c) => c === "GET /repos/o/r/pulls/7").length > 1 ? after() : prNow;
        return {};
      },
      board: async () => ({ card: cardNow }),
    };
  };
  let t = io();
  let res = await mergePr(theCard, RUN, pr, v, 0, t);
  assert.equal(res.outcome, "merged");
  assert.ok(t.calls.includes("GET /repos/o/r/compare/main...H"));
  assert.ok(t.calls.includes("PUT /repos/o/r/pulls/7/merge"));
  // main moved: no merge.
  t = io({ prNow: { ...open, base: { ref: "main", sha: "C" } } });
  res = await mergePr(theCard, RUN, pr, v, 0, t);
  assert.equal(res.outcome, "pr");
  assert.ok(!t.calls.some((c) => c.startsWith("PUT")));
  // Card withdrawn just before: no merge.
  t = io({ cardNow: doing({ status: "DONE" }) });
  res = await mergePr(theCard, RUN, pr, v, 0, t);
  assert.equal(res.outcome, "cancelled");
  assert.ok(!t.calls.some((c) => c.startsWith("PUT")));
  // The PUT failed but GitHub says it merged.
  t = io({ put: () => { throw new Error("timeout"); }, after: () => ({ merged_at: "2026-10-16T00:00:00Z" }) });
  assert.equal((await mergePr(theCard, RUN, pr, v, 0, t)).outcome, "merged");
  // The PUT failed and GitHub cannot say: keep the lease.
  t = io({ put: () => { throw new Error("timeout"); }, after: () => { throw new Error("down"); } });
  assert.equal((await mergePr(theCard, RUN, pr, v, 0, t)).outcome, "pending");
});

test("a scout justification in two paragraphs stays Autopilot's", () => {
  const notes = appendNote("Cambiar helo por hello.", "la marqué (10/10): Es un typo acotado y reversible.\n\nNo requiere credenciales ni tocar producción.", "2026-10-16");
  assert.equal(humanNotes(notes), "Cambiar helo por hello.");
  assert.equal(gate(card({ title: "Corregir typo", notes }), repos), null);
  const later = `${notes}\n\nOjo: no tocar producción.`;
  assert.match(gate(card({ title: "Corregir typo", notes: later }), repos), /producci/);
});

test("a PR merged or closed on GitHub settles its card", () => {
  const url = "https://github.com/o/r/pull/5";
  const c = (over = {}) => ({ tags: ["auto-pr", "x"], status: "DOING", notes: "", links: [{ url, label: "PR de Autopilot" }], ...over });
  const date = "2026-10-16";
  assert.deepEqual(cardPr(c()), { url, repo: "o/r", number: 5 });
  assert.equal(cardPr(c({ links: [{ url: "https://evil.com/o/r/pull/5", label: "PR de Autopilot" }] })), null);
  assert.equal(cardPr(c({ links: [{ url, label: "otro" }] })), null);

  assert.equal(prSyncPatch(c(), { state: "open", merged_at: null }, url, date), null);
  let p = prSyncPatch(c(), { state: "closed", merged_at: "2026-10-16T21:00:00Z" }, url, date);
  assert.deepEqual(p.tags, ["x", "auto-pr-fusionado"]);
  assert.equal(p.status, "DONE");
  p = prSyncPatch(c(), { state: "closed", merged_at: null }, url, date);
  assert.deepEqual(p.tags, ["x", "auto-pr-cerrado"]);
  assert.equal(p.status, "PENDING");
  assert.match(p.notes, /se cerró sin fusionar/);
  // A card Jaime already closed stays closed.
  p = prSyncPatch(c({ status: "DONE" }), { state: "closed", merged_at: null }, url, date);
  assert.equal(p.status, undefined);
  p = prSyncPatch(c({ status: "DONE" }), { state: "closed", merged_at: "x" }, url, date);
  assert.equal(p.status, undefined);
  // Already settled: nothing to write.
  assert.equal(prSyncPatch(c({ tags: ["auto-pr-cerrado"] }), { state: "closed", merged_at: null }, url, date), null);
});
