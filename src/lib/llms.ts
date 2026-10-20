// Plain-text descriptions of Parkboard for language models (Claude, ChatGPT, Codex…), following
// the llms.txt convention (https://llmstxt.org). Served at /llms.txt and /llms-full.txt.

export const SITE = "https://parkboard.jato.run";
const REPO = "https://github.com/Jjat00/parkboard";
const CLI_URL = "https://raw.githubusercontent.com/Jjat00/parkboard/main/cli/park.mjs";

const SUMMARY = `# Parkboard

> Parkboard is a free, open-source infinite canvas for the side tasks, ideas, bugs and research that come up while you work with an AI coding agent. Agents such as Claude Code and Codex park each one with the \`park\` CLI, with enough context to pick it up cold and a link back to the session where it was born. The web app is at ${SITE} (sign in with Google); the code is at ${REPO} (self-hostable).

The landing and privacy pages are in Spanish and English; the board itself is in Spanish. Made by Jaime Aza (https://jaimeaza.tech), part of jato.run.`;

const HOW = `## How it works

1. Mid-session you tell your agent "let's leave that for later" (any agent with a shell: Claude Code, Codex, Cursor, Aider…).
2. The agent runs \`park add\` with a title, project, kind, priority, notes to resume it cold, and the agent session id (detected from CLAUDE_CODE_SESSION_ID or CODEX_THREAD_ID).
3. The card lands on your canvas, grouped by project. Later, \`park show 12\` gives the agent everything needed to resume, including the command to reopen the original session (\`claude --resume <id>\` or \`codex resume <id>\`).

## Features

- Infinite canvas (React Flow): each project is a group that fits its cards; drag a card onto another project to move it.
- Card kinds task, bug, research, idea and note, shown in three views (Tasks, Ideas, Notes) so ideas do not crowd the work.
- Status idea, pending, doing, done; priority low to urgent; personal and work areas; short per-user numbers (#12).
- Projects live while they have open cards: parking into an unknown project creates it, closing the last open card removes it.
- Done cards leave the canvas for a Done panel grouped by day.
- Each card can carry its GitHub repository (owner/name); \`park add\` detects it from the git remote of the session folder.
- Activity dashboard at /dashboard: cards done and parked per period, time to close, breakdowns by project, kind, priority, area and origin.
- Optional Autopilot (in the repo, \`autopilot/\`): a scheduled worker that solves cards tagged \`auto\` with Claude Code and opens a draft pull request for each.
- CLI \`park\` with no dependencies (Node 20+): JSON when piped, \`--dry-run\` on writes, \`park schema\` describes every command for agents.
- API keys for the CLI, stored only as SHA-256 hashes.

## Getting started

An agent with a terminal can do all of this by itself: tell it to read ${SITE}/setup.md and follow it (install, \`park login\`, and a standing rule saved in its own instructions so it parks things without being reminded). By hand:

1. Install the CLI (one file, Node 20+): \`curl -fsSL ${SITE}/install.sh | sh\` (macOS, Linux, WSL; it downloads ${CLI_URL} and links ~/.local/bin/park to it). On Windows PowerShell: \`irm ${SITE}/install.ps1 | iex\`.
2. Run \`park login\`: it opens the browser, you sign in with Google and authorize the terminal, and its key is saved. Without a browser on that machine, create a key from the "CLI" button on the board and run the \`park config --url … --key pk_…\` command it shows.
3. Tell your agent (in CLAUDE.md, AGENTS.md or similar) to park things with \`park add\` whenever you say "let's leave that for later", and to run \`park schema\` to learn the commands.

## Privacy

- What users write (titles, notes, links, tags, project names, session details) is encrypted at rest with AES-256-GCM, with the key kept outside the database.
- Each account has its own board; no other user can see it. No ads, no selling data, no training AI models with it.
- \`park export\` saves the whole board as JSON. Full policy: ${SITE}/privacy`;

const CLI = `## CLI reference

\`\`\`
park add "<title>" [-p project] [--kind task|idea|bug|research|note] [--priority low|medium|high|urgent]
                   [--status idea|pending|doing|done] [--notes "…"] [--tag t] [--link url] [--summary "…"]
                   [--area personal|work|none] [--vault "note path"] [--repo owner/name] [--dry-run]
park ls [-p project] [--status open|all|idea|pending|doing|done] [-q text] [--limit 50]
park show 12              # a card is its number (12 or #12) or its full id
park set 12 [--status doing] [--priority …] [--project …] [--title …] [--repo owner/name]   # --project '' makes it a loose idea
park done 12
park rm 12 --yes
park projects
park project <slug> [--area work] [--name "…"] [--delete --yes]
park export > board.json  # the whole board, done cards included
park login                # connect this terminal in the browser (--url for your own server)
park config --url ${SITE} --key pk_…
park schema               # machine-readable description of every command
\`\`\`

Output is human text on a terminal and JSON when piped or with \`--json\`. Exit codes: 0 ok, 1 API or network error, 2 usage error, 3 not configured, 4 not found. Conventions: search before adding (\`park ls -q\`) to avoid duplicates; a big initiative gets its own project instead of piling cards into the parent one.

## HTTP API

All routes take \`Authorization: Bearer pk_…\` (or the web session) and only ever touch the caller's own board.

| Method | Path | Notes |
|---|---|---|
| GET | /api/board | every project and card |
| GET, POST | /api/cards | \`?status=open\\|idea\\|pending\\|doing\\|done&project=&q=&limit=\`, plus \`tag=\`, \`tagPrefix=\`, \`withoutTagPrefix=\` (every match) |
| GET, PATCH, DELETE | /api/cards/:id | id or short number; PATCH with \`ifUpdatedAt\` applies only if the card is unchanged (409 otherwise) |
| GET, POST | /api/projects | |
| PATCH, DELETE | /api/projects/:id | deleting a project turns its cards into loose ideas |

## Self-hosting

Next.js 16, React 19, React Flow, Prisma 7 on Postgres, Clerk for sign-in. Clone ${REPO}, \`pnpm install\`, fill \`.env\` (database, Clerk keys, \`PARKBOARD_ENCRYPTION_KEYS\` and \`PARKBOARD_INDEX_KEY\`), \`pnpm exec prisma migrate deploy\`, \`pnpm dev\`. MIT-style open source; see the README.`;

const LINKS = `## Links

- [Home](${SITE}/): what Parkboard is, with a screenshot.
- [Privacy](${SITE}/privacy): what is stored, how it is encrypted and who can see it.
- [Agent setup](${SITE}/setup.md): steps an AI agent follows to install the CLI, connect it and keep parking on its own.
- [Source code and README](${REPO})
- [CLI source](${CLI_URL})

## Optional

- [Full reference](${SITE}/llms-full.txt): CLI commands, HTTP API and self-hosting.`;

export const llmsTxt = () => [SUMMARY, HOW, LINKS].join("\n\n") + "\n";
export const llmsFullTxt = () => [SUMMARY, HOW, CLI, LINKS.replace(/\n\n## Optional[\s\S]*$/, "")].join("\n\n") + "\n";
