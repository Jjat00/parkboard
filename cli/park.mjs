#!/usr/bin/env node
// park: CLI for Parkboard. No dependencies, Node 20+.
// Config: env PARKBOARD_URL and PARKBOARD_API_KEY, or ~/.config/parkboard/config.json {url, key}.
// Output: human text on a TTY, JSON when piped or with --json. Diagnostics go to stderr.
// Exit codes: 0 ok, 1 API or network error, 2 usage error, 3 not configured, 4 not found.

import { execFileSync, spawn } from "node:child_process";
import { createDecipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const VERSION = "0.4.0";
const DEFAULT_URL = "https://parkboard.jato.run";
const CONFIG = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "parkboard", "config.json");
const ENUMS = {
  status: ["idea", "pending", "doing", "done"],
  priority: ["low", "medium", "high", "urgent"],
  kind: ["task", "idea", "bug", "research", "note"],
  area: ["personal", "work", "none"],
};

const SCHEMA = {
  name: "park",
  version: VERSION,
  description: "Park things for later on a Parkboard canvas.",
  card_reference: "a card is its short number (12 or #12, shown by park ls) or its full id",
  conventions: [
    "Big initiative, own project: when a piece of work needs several cards (a plan, a multi-phase feature, an investigation with follow-ups), create a dedicated project for it (e.g. ungga-crm next to ungga) instead of piling cards into the parent project. A project should stay readable at a glance.",
    "Move existing cards that belong to the initiative into its project with park set <n> --project <slug>.",
    "Search before adding (park ls -q) so the same thing is not parked twice.",
  ],
  exit_codes: { 0: "ok", 1: "api or network error", 2: "usage error", 3: "not configured", 4: "not found" },
  commands: {
    add: {
      args: ["<title>"],
      flags: {
        "-p, --project": "project name or slug; an unknown one is created, and a project with no open cards left is deleted",
        "--notes": "longer context (markdown)",
        "--status": ENUMS.status.join("|") + " (default pending)",
        "--priority": ENUMS.priority.join("|") + " (default medium)",
        "--kind": ENUMS.kind.join("|") + " (default task)",
        "--area": ENUMS.area.join("|") + " (cards without project; none = loose idea, the default)",
        "--tag": "repeatable",
        "--link": "repeatable URL",
        "--summary": "what the conversation was about, to pick it up cold (alias --session)",
        "--agent, --session-id, --cwd": "override the detected agent session (CLAUDE_CODE_SESSION_ID or CODEX_THREAD_ID, and the current directory)",
        "--no-session": "do not attach the agent session",
        "--vault": "Obsidian note path",
        "--repo": "GitHub repository as owner/name (or its URL); add detects it from the git remote of the session directory, set --repo '' clears it",
        "--origin": "claude-code|codex|cli… (default: the API key name)",
        "--dry-run": "print the request, send nothing",
      },
    },
    ls: { flags: { "-p, --project": "filter", "--status": "open (default)|all|" + ENUMS.status.join("|"), "-q, --query": "text search", "--limit": "default 50" } },
    show: { args: ["<card>"] },
    set: { args: ["<card>"], flags: "same as add, plus --title; --project '' moves it to loose ideas" },
    done: { args: ["<card>"] },
    rm: { args: ["<card>"], flags: { "--yes": "required: deletion is permanent" } },
    projects: {},
    export: { note: "the whole board as JSON (every project and card, done ones included), e.g. park export > board.json" },
    project: {
      args: ["<project>"],
      flags: {
        "--area": "personal|work: the project's area (a work initiative belongs in work)",
        "--name": "rename the project (its slug stays the same)",
        "--delete": "delete the project; its cards are kept and move to loose ideas (needs --yes)",
        "--yes": "required with --delete: deletion is permanent",
        "--dry-run": "print the request, send nothing",
      },
      note: "a project is its slug, name or id, as park projects lists it",
    },
    login: {
      flags: { "--url": `board URL (default ${DEFAULT_URL})`, "--no-browser": "only print the URL to open" },
      note: "opens the board in the browser, you authorize this terminal and its key is saved; for a machine without a browser, create a key from the CLI button on the board and use park config",
    },
    config: { flags: { "--url": "board URL", "--key": "API key (pk_…)" } },
    schema: {},
  },
};

const HELP = `park ${VERSION}: park things for later on your Parkboard

Usage:
  park add "<title>" [-p project] [--priority high] [--kind idea] [--notes …] [--tag t] [--link url] [--summary …] [--repo owner/name]
                         (the Claude Code or Codex session is attached automatically)
  park ls [-p project] [--status open|all|idea|pending|doing|done] [-q text]
  park show 12           a card is its number (12 or #12) or its full id
  park set 12 [--status doing] [--priority …] [--project …] [--title …] [--repo owner/name]
  park done 12
  park rm 12 --yes
  park projects
  park export > board.json   the whole board as JSON (every card, done ones included)
  park project ungga-mcp --area work [--name …]
  park project ungga-mcp --delete --yes   (its cards move to loose ideas)
  park login             connect this terminal to your board in the browser (--url for your own server)
  park config --url https://… --key pk_…   or paste a key created from the CLI button on the board
  park schema            machine-readable description of every command

Global: --json (forced when stdout is not a TTY), --help, --version

Convention: a big initiative (a plan, a multi-phase feature) gets its own project
(e.g. ungga-crm next to ungga) instead of piling cards into the parent project.`;

const die = (code, msg) => {
  process.stderr.write(`park: ${msg}\n`);
  process.exit(code);
};

function loadConfig() {
  let file = {};
  if (existsSync(CONFIG)) {
    try {
      file = JSON.parse(readFileSync(CONFIG, "utf8"));
    } catch {
      die(3, `invalid config at ${CONFIG}`);
    }
  }
  const url = (process.env.PARKBOARD_URL ?? file.url ?? "").replace(/\/$/, "");
  const key = process.env.PARKBOARD_API_KEY ?? file.key ?? "";
  if (!url || !key) die(3, "not configured: run `park login` (or `park config --url <url> --key <pk_…>`, or set PARKBOARD_URL and PARKBOARD_API_KEY)");
  return { url, key };
}

async function request(method, path, body) {
  const { url, key } = loadConfig();
  let res;
  try {
    res = await fetch(url + path, {
      method,
      headers: { authorization: `Bearer ${key}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    die(1, `cannot reach ${url}: ${e.cause?.code ?? e.message}`);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (res.status === 404) die(4, "not found");
  if (res.status === 401) die(3, "unauthorized: the API key was revoked or is wrong, run `park login`");
  if (!res.ok) die(1, `${method} ${path} → ${res.status} ${JSON.stringify(data.issues ?? data.error ?? data)}`);
  return data;
}

const upper = (name, value) => {
  if (value === undefined) return undefined;
  const v = value.toLowerCase();
  if (!ENUMS[name].includes(v)) die(2, `--${name} must be one of ${ENUMS[name].join(", ")}`);
  return v.toUpperCase();
};

function cardBody(v) {
  const body = {
    title: v.title,
    notes: v.notes,
    status: upper("status", v.status),
    priority: upper("priority", v.priority),
    kind: upper("kind", v.kind),
    area: v.area?.toLowerCase() === "none" ? null : upper("area", v.area),
    tags: v.tag,
    links: v.link?.map((url) => {
      try {
        return { url: new URL(url).toString() };
      } catch {
        return die(2, `--link is not a URL: ${url}`);
      }
    }),
    session: v.summary ?? v.session,
    vaultNote: v.vault,
    repo: v.repo === undefined ? undefined : v.repo.trim() ? (githubRepo(v.repo) ?? die(2, `--repo must be owner/name or a GitHub URL: ${v.repo}`)) : null,
    agent: v.agent,
    sessionId: v["session-id"],
    cwd: v.cwd,
    origin: v.origin,
    project: v.project === undefined ? undefined : v.project || null,
  };
  return Object.fromEntries(Object.entries(body).filter(([, x]) => x !== undefined));
}

/**
 * "owner/name" from a GitHub remote (SSH, HTTPS or owner/name itself); null for anything else.
 * SSH host aliases like git@github.com-work: (one per account in ~/.ssh/config) count as GitHub.
 */
export function githubRepo(value) {
  const m = /^(?:(?:git\+)?ssh:\/\/git@github\.com\/|git@github\.com(?:-[A-Za-z0-9_.-]+)?:|https?:\/\/(?:[^@/]+@)?(?:www\.)?github\.com\/)?([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/.exec(
    String(value).trim(),
  );
  return m && !/^\.{1,2}$/.test(m[2]) ? `${m[1]}/${m[2]}` : null;
}

/** GitHub repository of a directory's origin remote, if it has one. */
function detectRepo(dir) {
  try {
    const url = execFileSync("git", ["-C", dir, "remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    });
    // Only a remote that names GitHub: a bare "a/b" remote is a relative path on disk.
    return /^(?:(?:git\+)?ssh:\/\/git@github\.com\/|git@github\.com(?:-[A-Za-z0-9_.-]+)?:|https?:\/\/(?:[^@/]+@)?(?:www\.)?github\.com\/)/.test(url.trim())
      ? (githubRepo(url) ?? undefined)
      : undefined;
  } catch {
    return undefined; // not a repository, no origin, or git missing
  }
}

/** Directory where a Claude Code session started: `claude --resume` only finds it from there. */
function claudeSessionCwd(id) {
  const root = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");
  try {
    for (const dir of readdirSync(root)) {
      const file = join(root, dir, `${id}.jsonl`);
      if (!existsSync(file)) continue;
      const match = readFileSync(file, "utf8").match(/"cwd":"((?:[^"\\]|\\.)*)"/);
      if (match) return JSON.parse(`"${match[1]}"`);
    }
  } catch {
    /* no Claude Code data here */
  }
  return undefined;
}

/** The agent session running this command, so the card can link back to it. */
function detectSession(v) {
  if (v["no-session"]) return {};
  const claude = process.env.CLAUDE_CODE_SESSION_ID;
  const codex = process.env.CODEX_THREAD_ID ?? process.env.CODEX_SESSION_ID;
  const detected = claude
    ? { agent: "claude-code", sessionId: claude }
    : codex
      ? { agent: "codex", sessionId: codex }
      : {};
  const out = {
    agent: v.agent ?? detected.agent,
    sessionId: v["session-id"] ?? detected.sessionId,
    cwd:
      v.cwd ??
      (detected.agent === "claude-code" ? claudeSessionCwd(detected.sessionId) : undefined) ??
      (detected.sessionId || v["session-id"] ? process.cwd() : undefined),
  };
  return Object.fromEntries(Object.entries(out).filter(([, x]) => x !== undefined));
}

/** Single-quotes a value as one shell word. */
const shellQuote = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

/** Command that reopens the conversation where a card was born. Every value is quoted. */
export function resumeCommand(card) {
  if (!card.sessionId) return null;
  const cd = card.cwd ? `cd ${shellQuote(card.cwd)} && ` : "";
  const id = shellQuote(card.sessionId);
  if (card.agent === "claude-code") return `${cd}claude --resume ${id}`;
  if (card.agent === "codex") return `${cd}codex resume ${id}`;
  return null;
}

const COLORS = { reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m" };
const color = (c, s) => (process.stdout.isTTY && !process.env.NO_COLOR ? COLORS[c] + s + COLORS.reset : s);
const PRIO = { LOW: "dim", MEDIUM: "cyan", HIGH: "yellow", URGENT: "red" };

function line(card) {
  const where = card.project?.slug ?? "ideas";
  const prio = color(PRIO[card.priority], card.priority.toLowerCase().padEnd(6));
  return `${color("cyan", `#${card.number}`.padEnd(5))} ${prio} ${card.status.toLowerCase().padEnd(7)} ${color("bold", card.title)} ${color("dim", `[${where}]`)}`;
}

function detail(card) {
  const rows = [
    [color("bold", `#${card.number} ${card.title}`)],
    ["id", card.id],
    ["project", card.project?.name ?? "ideas sueltas"],
    ["status", card.status.toLowerCase()],
    ["priority", card.priority.toLowerCase()],
    ["kind", card.kind.toLowerCase()],
    ["tags", card.tags.join(", ")],
    ["links", card.links.map((l) => l.url).join("\n        ")],
    ["origin", card.origin],
    ["agent", [card.agent, card.sessionId].filter(Boolean).join(" · ")],
    ["resume", resumeCommand(card) ?? ""],
    ["summary", card.session ?? ""],
    ["repo", card.repo ?? ""],
    ["vault", card.vaultNote ?? ""],
    ["created", card.createdAt],
  ];
  const out = rows.filter((r) => r.length === 1 || r[1]).map((r) => (r.length === 1 ? r[0] : `${color("dim", r[0].padEnd(8))}${r[1]}`));
  if (card.notes) out.push("", card.notes);
  return out.join("\n");
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0] && !argv[0].startsWith("-") ? argv.shift() : undefined;
  let parsed;
  try {
    parsed = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      project: { type: "string", short: "p" },
      title: { type: "string" },
      notes: { type: "string" },
      status: { type: "string" },
      priority: { type: "string" },
      kind: { type: "string" },
      area: { type: "string" },
      name: { type: "string" },
      tag: { type: "string", multiple: true },
      link: { type: "string", multiple: true },
      session: { type: "string" },
      summary: { type: "string" },
      agent: { type: "string" },
      "session-id": { type: "string" },
      cwd: { type: "string" },
      "no-session": { type: "boolean" },
      vault: { type: "string" },
      repo: { type: "string" },
      origin: { type: "string" },
      query: { type: "string", short: "q" },
      limit: { type: "string" },
      url: { type: "string" },
      key: { type: "string" },
      yes: { type: "boolean" },
      delete: { type: "boolean" },
      "dry-run": { type: "boolean" },
      "no-browser": { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "V" },
    },
    });
  } catch (e) {
    // Unknown flags or missing values are usage errors (2), not API failures (1).
    if (String(e?.code).startsWith("ERR_PARSE_ARGS")) die(2, `${e.message}. Run park --help`);
    throw e;
  }
  const { values: v, positionals } = parsed;
  const json = v.json || !process.stdout.isTTY;
  const print = (data, human) => process.stdout.write((json ? JSON.stringify(data, null, 2) : human(data)) + "\n");
  // A card is referenced by its short number (12 or #12) or its full id.
  const id = () => encodeURIComponent(positionals[0] ?? die(2, `${cmd} needs a card number like 12 or #12 (see \`park ls\`)`));

  if (v.version) return print({ version: VERSION }, (d) => d.version);
  if (v.help || !cmd) return process.stdout.write(HELP + "\n");

  switch (cmd) {
    case "add": {
      const title = positionals.join(" ").trim();
      if (!title) die(2, 'add needs a title: park add "…"');
      const body = { ...cardBody({ ...v, title }), ...detectSession(v) };
      if (v.repo === undefined) {
        const repo = detectRepo(body.cwd ?? process.cwd());
        if (repo) body.repo = repo;
      }
      if (v["dry-run"]) return print({ dry_run: true, request: { method: "POST", path: "/api/cards", body } }, (d) => JSON.stringify(d.request, null, 2));
      const { card } = await request("POST", "/api/cards", body);
      return print(card, (c) => `parked ${line(c)}`);
    }
    case "ls": {
      const qs = new URLSearchParams();
      const status = (v.status ?? "open").toLowerCase();
      if (status !== "all") qs.set("status", status === "open" ? "open" : upper("status", status));
      if (v.project) qs.set("project", v.project);
      if (v.query) qs.set("q", v.query);
      qs.set("limit", v.limit ?? "50");
      const { cards } = await request("GET", `/api/cards?${qs}`);
      return print(cards, (cs) => (cs.length ? cs.map(line).join("\n") : color("dim", "nothing parked")));
    }
    case "show": {
      const { card } = await request("GET", `/api/cards/${id()}`);
      return print(card, detail);
    }
    case "set":
    case "done": {
      const body = cmd === "done" ? { status: "DONE" } : cardBody(v);
      if (!Object.keys(body).length) die(2, "set needs at least one field, e.g. --status doing");
      if (v["dry-run"]) return print({ dry_run: true, request: { method: "PATCH", path: `/api/cards/${id()}`, body } }, (d) => JSON.stringify(d.request, null, 2));
      const { card } = await request("PATCH", `/api/cards/${id()}`, body);
      return print(card, (c) => `updated ${line(c)}`);
    }
    case "rm": {
      if (v["dry-run"]) return print({ dry_run: true, request: { method: "DELETE", path: `/api/cards/${id()}` } }, (d) => `would ${d.request.method} ${d.request.path}`);
      if (!v.yes) die(2, "rm is permanent: pass --yes to confirm");
      await request("DELETE", `/api/cards/${id()}`);
      return print({ ok: true, card: decodeURIComponent(id()) }, () => `deleted ${decodeURIComponent(id())}`);
    }
    case "projects": {
      const { projects } = await request("GET", "/api/projects");
      return print(projects, (ps) =>
        ps.map((p) => `${p.slug.padEnd(28)} ${String(p._count.cards).padStart(3)} open  ${color("dim", p.area.toLowerCase())}`).join("\n"),
      );
    }
    case "export":
      // Always JSON: it is meant to be saved, not read.
      return process.stdout.write(JSON.stringify(await request("GET", "/api/board"), null, 2) + "\n");
    case "project": {
      const ref = positionals.join(" ").trim();
      if (!ref) die(2, "project needs a project slug, e.g. park project ungga-mcp --area work (see `park projects`)");
      if (v.delete && (v.area !== undefined || v.name !== undefined)) die(2, "--delete cannot be combined with --area or --name");
      const body = {};
      if (v.area !== undefined) {
        // A project always has an area: "none" only makes sense for loose cards.
        if (v.area.toLowerCase() === "none") die(2, "--area for a project must be personal or work");
        body.area = upper("area", v.area);
      }
      if (v.name !== undefined) {
        if (!v.name.trim()) die(2, "--name cannot be empty");
        body.name = v.name.trim();
      }
      if (!v.delete && !Object.keys(body).length) die(2, "project needs at least one change, e.g. --area work or --delete");
      const { projects } = await request("GET", "/api/projects");
      const r = ref.toLowerCase();
      const project = projects.find((p) => p.id === ref || p.slug === r) ?? projects.find((p) => p.name.toLowerCase() === r);
      if (!project) die(4, `no project "${ref}" (see park projects)`);
      const path = `/api/projects/${encodeURIComponent(project.id)}`;
      if (v.delete) {
        // The server keeps the cards: they lose the project and become loose ideas with its area.
        if (v["dry-run"]) return print({ dry_run: true, request: { method: "DELETE", path } }, (d) => `would ${d.request.method} ${d.request.path}`);
        if (!v.yes) die(2, "--delete is permanent: pass --yes to confirm (its cards move to loose ideas)");
        await request("DELETE", path);
        return print({ ok: true, project: project.slug }, (d) => `deleted ${d.project} (its cards are now loose ideas)`);
      }
      if (v["dry-run"]) return print({ dry_run: true, request: { method: "PATCH", path, body } }, (d) => JSON.stringify(d.request, null, 2));
      const { project: updated } = await request("PATCH", path, body);
      return print(updated, (p) => `updated ${p.slug}  ${p.name}  ${color("dim", p.area.toLowerCase())}`);
    }
    case "login":
      return login(v, print);
    case "config": {
      if (!v.url && !v.key) {
        const cfg = existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, "utf8")) : {};
        return print({ path: CONFIG, url: cfg.url ?? null, key: cfg.key ? `${cfg.key.slice(0, 8)}…` : null }, (d) => `${d.path}\nurl  ${d.url}\nkey  ${d.key}`);
      }
      const cfg = existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, "utf8")) : {};
      if (v.url) cfg.url = v.url.replace(/\/$/, "");
      if (v.key) cfg.key = v.key;
      if (v["dry-run"]) {
        const preview = { path: CONFIG, url: cfg.url ?? null, key: cfg.key ? `${cfg.key.slice(0, 8)}…` : null };
        return print({ dry_run: true, write: preview }, (d) => `would write ${d.write.path}\nurl  ${d.write.url}\nkey  ${d.write.key}`);
      }
      saveConfig(cfg);
      return print({ ok: true, path: CONFIG }, (d) => `saved ${d.path}`);
    }
    case "schema":
      return process.stdout.write(JSON.stringify(SCHEMA, null, 2) + "\n");
    default:
      die(2, `unknown command "${cmd}". Run park --help`);
  }
}

function readConfigFile() {
  return existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, "utf8")) : {};
}

/** A fresh 0600 file renamed into place: an older config.json with looser permissions never holds the new key. */
function saveConfig(cfg) {
  mkdirSync(join(CONFIG, ".."), { recursive: true });
  const tmp = `${CONFIG}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  renameSync(tmp, CONFIG);
}

// X25519 public keys in SPKI DER are this fixed prefix plus the 32 raw bytes.
const X25519_SPKI = Buffer.from("302a300506032b656e032100", "hex");

/**
 * Opens what /cli/login sealed for this run: its ephemeral X25519 key (32 bytes), then AES-256-GCM
 * iv (12), tag (16) and ciphertext. Mirrors src/lib/cli-seal.ts.
 */
function openSealedKey(sealed, privateKey, state) {
  const buf = Buffer.from(sealed, "base64url");
  if (buf.length < 32 + 12 + 16 + 1) throw new Error("bad sealed key");
  const peer = createPublicKey({ key: Buffer.concat([X25519_SPKI, buf.subarray(0, 32)]), format: "der", type: "spki" });
  const secret = diffieHellman({ privateKey, publicKey: peer });
  const aes = Buffer.from(hkdfSync("sha256", secret, state, "parkboard-cli-login", 32));
  const decipher = createDecipheriv("aes-256-gcm", aes, buf.subarray(32, 44));
  decipher.setAuthTag(buf.subarray(44, 60));
  return Buffer.concat([decipher.update(buf.subarray(60)), decipher.final()]).toString("utf8");
}

/** Best effort: the URL is always printed too, so a failure here only costs a copy and paste. */
function openBrowser(url) {
  const wsl = process.platform === "linux" && /microsoft/i.test(readFileSafe("/proc/version"));
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]]
    // cmd would cut the URL at each & unless it is escaped.
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url.replace(/&/g, "^&")]]
    : wsl ? ["cmd.exe", ["/c", "start", "", url.replace(/&/g, "^&")]]
    : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {}
}

function readFileSafe(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/**
 * Loopback sign-in: a one-shot server on 127.0.0.1 waits for the board to redirect back with a fresh key.
 * The random state ties the answer to this run, so another page cannot plant a key of its own.
 */
async function login(v, print) {
  if (v["dry-run"]) die(2, "login has no --dry-run: it only writes your config after you authorize it in the browser");
  const url = (v.url ?? process.env.PARKBOARD_URL ?? readConfigFile().url ?? DEFAULT_URL).replace(/\/$/, "");
  const state = randomBytes(24).toString("base64url");
  // The board seals the new key to this in-memory key pair, so the URL the browser keeps holds only ciphertext.
  const { publicKey, privateKey } = generateKeyPairSync("x25519");
  const pub = publicKey.export({ format: "der", type: "spki" }).subarray(X25519_SPKI.length).toString("base64url");
  const page = (title, body) =>
    `<!doctype html><meta charset="utf-8"><title>${title}</title><script>history.replaceState(null,"","/")</script><body style="font:16px system-ui;background:#0b0b0b;color:#eee;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="font-size:22px">${title}</h1><p style="color:#999">${body}</p></div>`;
  const headers = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" };

  const key = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const q = new URL(req.url, "http://127.0.0.1");
      if (q.pathname !== "/callback") return res.writeHead(404).end();
      let got = "";
      try {
        if (q.searchParams.get("state") === state) got = openSealedKey(q.searchParams.get("sealed") ?? "", privateKey, state);
      } catch {}
      if (!got.startsWith("pk_")) {
        res.writeHead(400, headers).end(page("Parkboard", "This link does not belong to this park login. Run it again."));
        return;
      }
      res.writeHead(200, headers).end(page("Parkboard ✓", "Terminal connected. You can close this tab."));
      clearTimeout(timer);
      // Without this the browser's keep-alive connection holds the process open for a few more seconds.
      server.close();
      server.closeAllConnections();
      resolve(got);
    });
    const timer = setTimeout(() => {
      server.close();
      server.closeAllConnections();
      reject(new Error("timed out after 5 minutes waiting for the browser; run park login again"));
    }, 5 * 60_000);
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const auth = new URL("/cli/login", url);
      auth.searchParams.set("port", String(server.address().port));
      auth.searchParams.set("state", state);
      auth.searchParams.set("pub", pub);
      auth.searchParams.set("name", hostname());
      process.stderr.write(`Open this URL to connect park to ${url}:\n\n  ${auth}\n\nWaiting for the browser…\n`);
      if (!v["no-browser"]) openBrowser(auth.toString());
    });
  });

  // Check the new pair itself, not whatever request() would pick up from the environment.
  let res;
  try {
    res = await fetch(`${url}/api/projects`, { headers: { authorization: `Bearer ${key}` } });
  } catch (e) {
    die(1, `cannot reach ${url}: ${e.cause?.code ?? e.message}`);
  }
  if (!res.ok) die(1, `the board did not accept the new key (${res.status}); nothing was saved`);
  saveConfig({ ...readConfigFile(), url, key });
  const shadowed = ["PARKBOARD_URL", "PARKBOARD_API_KEY"].filter((n) => process.env[n]);
  if (shadowed.length) process.stderr.write(`park: warning: ${shadowed.join(" and ")} in your environment ${shadowed.length > 1 ? "take" : "takes"} precedence over the saved config\n`);
  return print({ ok: true, url, path: CONFIG, overridden_by_env: shadowed }, (d) => `${color("cyan", "✓")} connected to ${d.url} (saved in ${d.path})\nTry: park add "My first parked task"`);
}

main().catch((e) => die(1, e.message));
