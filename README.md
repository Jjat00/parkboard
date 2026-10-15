# Parkboard

An infinite canvas for the things you park for later: tasks, ideas, bugs and research, grouped by project,
with a CLI so your coding agents can park things for you when you say "let's leave that for later".

![Parkboard: the Tasks view with cards grouped by project](docs/screenshot.png)

## Why

When you work with an AI agent (Claude Code, Codex or any other), one task keeps spawning others: a bug you spot
while fixing something else, an idea for later, a check you should run before shipping. You stay on the main
task, and by the end of the session those side tasks are lost in the conversation.

Parkboard keeps them in one place. The agent parks each one as it comes up, with enough context to pick it up cold
and a link back to the session where it was born. Every pending item stays visible on the canvas, and getting back
to it is one card away.

- **Canvas**: projects are resizable groups; cards move between them by dragging. Each card has status, priority,
  kind, notes, links, tags, and where it was born (origin and session).
- **Projects live while they have work**: parking into an unknown project creates it, and when its last open card is
  done, moved or deleted the project goes away (its done cards stay as loose ideas).
- **Tasks, Ideas and Notes views**: the canvas shows one at a time (bugs and research go with tasks), so ideas and notes do not crowd the work.
- **Personal and work areas**, text filter, done cards hidden by default.
- **CLI `park`** with no dependencies: JSON when piped, `--dry-run` on writes, `park schema` for agents.
- **Encrypted at rest**: titles, notes, links, tags, project names and session details are stored with
  AES-256-GCM under a key kept outside the database (`PARKBOARD_ENCRYPTION_KEYS`), each value bound to its owner
  and field. Projects are found by a keyed hash of their slug (`PARKBOARD_INDEX_KEY`); text search decrypts in
  the server.
- **Private by default**: one board per Clerk user, plus an optional email allowlist (`PARKBOARD_ALLOWED_EMAILS`).
  The CLI uses API keys stored as SHA-256 hashes.

Stack: Next.js 16, React 19, Tailwind 4, React Flow, Prisma 7 on Postgres, Clerk.

## Run it

```bash
pnpm install
cp .env.example .env          # fill DATABASE_URL, Clerk keys, your email and an encryption key
pnpm exec prisma migrate deploy
pnpm dev
```

Losing `PARKBOARD_ENCRYPTION_KEYS` or `PARKBOARD_INDEX_KEY` means losing the data: keep a copy outside the
database, and keep retired keys for as long as backups written with them exist.

**Upgrading an existing board to encryption.** A version without encryption must never run next to one that
writes sealed rows, so the upgrade goes through a bridge:

1. Set both keys and `PARKBOARD_ENCRYPT_WRITES=false`, run `pnpm db:migrate` (additive) and deploy. This bridge
   reads both formats and writes in clear, so it runs safely next to the version before it.
2. Once the version before no longer serves any request, remove `PARKBOARD_ENCRYPT_WRITES` and deploy. The bridge
   still running next to it seals edits of sealed rows and never writes plaintext into one.
3. Once that deployment serves all traffic, run `pnpm encrypt:existing` until it exits 0. It stops if a project
   was created twice, and exits 1 if anything is left.

From then on, rolling back to a version without encryption shows sealed text: roll forward instead.

**Rotating the encryption key**, so that no instance ever meets a key it cannot read:

1. Deploy the ring `old:…,new:…` everywhere: every instance can now read `new`, still writing with `old`.
2. Once nothing runs with the previous ring, deploy `new:…,old:…`: new values use `new`.
3. Once nothing writes with `old` as the current key, run `pnpm encrypt:existing` until it exits 0.
4. Drop `old` from the running ring, keeping it safe for backups made before.

The index key is not rotated.

## CLI

```bash
pnpm key:create my-laptop     # prints a pk_… key once
ln -s "$PWD/cli/park.mjs" ~/.local/bin/park
park config --url https://your-board.example.com --key pk_…
park add "Try surfacer on the recon report" -p google-flow --kind research --priority high
park ls
park done <id>
park project ungga-crm --area work   # change a project's area (or --name to rename it)
park project ungga-crm --delete --yes   # delete a project; its cards move to loose ideas
```

Agents: `park schema` prints every command, flag and exit code as JSON.

## API

All routes accept `Authorization: Bearer pk_…` or a Clerk session.

| Method | Path | |
|---|---|---|
| GET | `/api/board` | projects and cards |
| GET, POST | `/api/cards` | `?status=open\|idea\|pending\|doing\|done&project=&q=` |
| GET, PATCH, DELETE | `/api/cards/:id` | |
| GET, POST | `/api/projects` | |
| PATCH, DELETE | `/api/projects/:id` | deleting a project moves its cards to the inbox |
