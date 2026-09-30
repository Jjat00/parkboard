#!/usr/bin/env node
// park: CLI for Parkboard. No dependencies, Node 20+.
// Config: env PARKBOARD_URL and PARKBOARD_API_KEY, or ~/.config/parkboard/config.json {url, key}.
// Output: human text on a TTY, JSON when piped or with --json. Diagnostics go to stderr.
// Exit codes: 0 ok, 1 API or network error, 2 usage error, 3 not configured, 4 not found.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const VERSION = "0.1.0";
const CONFIG = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "parkboard", "config.json");
const ENUMS = {
  status: ["idea", "pending", "doing", "done"],
  priority: ["low", "medium", "high", "urgent"],
  kind: ["task", "idea", "bug", "research", "note"],
  area: ["personal", "work"],
};

const SCHEMA = {
  name: "park",
  version: VERSION,
  description: "Park things for later on a Parkboard canvas.",
  exit_codes: { 0: "ok", 1: "api or network error", 2: "usage error", 3: "not configured", 4: "not found" },
  commands: {
    add: {
      args: ["<title>"],
      flags: {
        "-p, --project": "project name or slug; an unknown one is created",
        "--notes": "longer context (markdown)",
        "--status": ENUMS.status.join("|") + " (default pending)",
        "--priority": ENUMS.priority.join("|") + " (default medium)",
        "--kind": ENUMS.kind.join("|") + " (default task)",
        "--area": ENUMS.area.join("|") + " (only for cards without project, or a new project)",
        "--tag": "repeatable",
        "--link": "repeatable URL",
        "--session": "where it was born: session id, repo path, summary",
        "--vault": "Obsidian note path",
        "--origin": "claude-code|codex|cli… (default: the API key name)",
        "--dry-run": "print the request, send nothing",
      },
    },
    ls: { flags: { "-p, --project": "filter", "--status": "open (default)|all|" + ENUMS.status.join("|"), "-q, --query": "text search", "--limit": "default 50" } },
    show: { args: ["<id>"] },
    set: { args: ["<id>"], flags: "same as add, plus --title; --project '' moves to the inbox" },
    done: { args: ["<id>"] },
    rm: { args: ["<id>"], flags: { "--yes": "required: deletion is permanent" } },
    projects: {},
    config: { flags: { "--url": "board URL", "--key": "API key (pk_…)" } },
    schema: {},
  },
};

const HELP = `park ${VERSION}: park things for later on your Parkboard

Usage:
  park add "<title>" [-p project] [--priority high] [--kind idea] [--notes …] [--tag t] [--link url] [--session …]
  park ls [-p project] [--status open|all|idea|pending|doing|done] [-q text]
  park show <id>
  park set <id> [--status doing] [--priority …] [--project …] [--title …]
  park done <id>
  park rm <id> --yes
  park projects
  park config --url https://… --key pk_…
  park schema            machine-readable description of every command

Global: --json (forced when stdout is not a TTY), --help, --version`;

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
  if (!url || !key) die(3, `not configured: run \`park config --url <url> --key <pk_…>\` or set PARKBOARD_URL and PARKBOARD_API_KEY`);
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
  if (res.status === 401) die(3, "unauthorized: check the API key");
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
    area: upper("area", v.area),
    tags: v.tag,
    links: v.link?.map((url) => {
      try {
        return { url: new URL(url).toString() };
      } catch {
        return die(2, `--link is not a URL: ${url}`);
      }
    }),
    session: v.session,
    vaultNote: v.vault,
    origin: v.origin,
    project: v.project === undefined ? undefined : v.project || null,
  };
  return Object.fromEntries(Object.entries(body).filter(([, x]) => x !== undefined));
}

const COLORS = { reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m" };
const color = (c, s) => (process.stdout.isTTY && !process.env.NO_COLOR ? COLORS[c] + s + COLORS.reset : s);
const PRIO = { LOW: "dim", MEDIUM: "cyan", HIGH: "yellow", URGENT: "red" };

function line(card) {
  const where = card.project?.slug ?? "inbox";
  const prio = color(PRIO[card.priority], card.priority.toLowerCase().padEnd(6));
  return `${color("dim", card.id)}  ${prio} ${card.status.toLowerCase().padEnd(7)} ${color("bold", card.title)} ${color("dim", `[${where}]`)}`;
}

function detail(card) {
  const rows = [
    [color("bold", card.title)],
    ["id", card.id],
    ["project", card.project?.name ?? "inbox"],
    ["status", card.status.toLowerCase()],
    ["priority", card.priority.toLowerCase()],
    ["kind", card.kind.toLowerCase()],
    ["tags", card.tags.join(", ")],
    ["links", card.links.map((l) => l.url).join("\n        ")],
    ["origin", card.origin],
    ["session", card.session ?? ""],
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
  const { values: v, positionals } = parseArgs({
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
      tag: { type: "string", multiple: true },
      link: { type: "string", multiple: true },
      session: { type: "string" },
      vault: { type: "string" },
      origin: { type: "string" },
      query: { type: "string", short: "q" },
      limit: { type: "string" },
      url: { type: "string" },
      key: { type: "string" },
      yes: { type: "boolean" },
      "dry-run": { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "V" },
    },
  });
  const json = v.json || !process.stdout.isTTY;
  const print = (data, human) => process.stdout.write((json ? JSON.stringify(data, null, 2) : human(data)) + "\n");
  const id = () => positionals[0] ?? die(2, `${cmd} needs a card id (see \`park ls\`)`);

  if (v.version) return print({ version: VERSION }, (d) => d.version);
  if (v.help || !cmd) return process.stdout.write(HELP + "\n");

  switch (cmd) {
    case "add": {
      const title = positionals.join(" ").trim();
      if (!title) die(2, 'add needs a title: park add "…"');
      const body = cardBody({ ...v, title, origin: v.origin });
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
      if (!v.yes) die(2, "rm is permanent: pass --yes to confirm");
      await request("DELETE", `/api/cards/${id()}`);
      return print({ ok: true, id: id() }, () => `deleted ${id()}`);
    }
    case "projects": {
      const { projects } = await request("GET", "/api/projects");
      return print(projects, (ps) =>
        ps.map((p) => `${p.slug.padEnd(28)} ${String(p._count.cards).padStart(3)} open  ${color("dim", p.area.toLowerCase())}`).join("\n"),
      );
    }
    case "config": {
      if (!v.url && !v.key) {
        const cfg = existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, "utf8")) : {};
        return print({ path: CONFIG, url: cfg.url ?? null, key: cfg.key ? `${cfg.key.slice(0, 8)}…` : null }, (d) => `${d.path}\nurl  ${d.url}\nkey  ${d.key}`);
      }
      const cfg = existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, "utf8")) : {};
      if (v.url) cfg.url = v.url.replace(/\/$/, "");
      if (v.key) cfg.key = v.key;
      mkdirSync(join(CONFIG, ".."), { recursive: true });
      writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
      return print({ ok: true, path: CONFIG }, (d) => `saved ${d.path}`);
    }
    case "schema":
      return process.stdout.write(JSON.stringify(SCHEMA, null, 2) + "\n");
    default:
      die(2, `unknown command "${cmd}". Run park --help`);
  }
}

main().catch((e) => die(1, e.message));
