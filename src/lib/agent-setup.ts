// Instructions an AI agent follows to set Parkboard up by itself, served at /setup.md.
// The landing only shows a one-line prompt pointing here, so the steps can change without
// anyone re-copying anything.

import { SITE } from "./llms";

/** What a person pastes into any agent. */
export const SETUP_PROMPT = {
  en: `Set up Parkboard for me: read ${SITE}/setup.md and follow it step by step.`,
  es: `Configura Parkboard por mí: lee ${SITE}/setup.md y síguelo paso a paso.`,
};

/** The standing rule the agent saves in its own instructions, between markers so it is never added twice. */
export const AGENT_RULE = `<!-- parkboard:start -->
## Parkboard (things for later)

My pending tasks, ideas and bugs live on my Parkboard (${SITE}), managed with the \`park\` CLI (\`park schema\` describes every command).

- When I say "let's leave that for later", "park it", "note that", or mention a task, bug or idea we won't do in this session, park it without asking:
  \`park add "<actionable title>" -p <project> --kind task|idea|bug|research|note --priority low|medium|high|urgent --notes "<context to pick it up cold>" --summary "<what we were doing in this conversation>"\`
  The project is the slug of the repo or topic (\`park projects\` lists them; a new one is created on its own). An idea that belongs to no project goes without \`-p\`. The CLI detects the repo from the git remote, and in Claude Code and Codex it also attaches this session by itself; other agents can pass \`--agent <name> --session-id <id>\` when they know their session id.
- Warnings and facts worth not forgetting, that are not tasks, go as \`--kind note\` with \`-p <project>\`.
- Search first with \`park ls -q "<word>"\` so the same thing is not parked twice.
- When I mention a card by number ("card 12", "#12"), read it first with \`park show 12\`, work on it, and run \`park done 12\` when it is finished. To resume a project, \`park ls -p <project>\` shows what is open.
- After parking, tell me in one line: 🅿️ parked #<number> <title> (<project>).
<!-- parkboard:end -->`;

export const setupMd = () => `# Set up Parkboard

You are an AI agent with a terminal. Follow these steps to connect the person you work with to their Parkboard, a canvas for the things they leave for later, and to keep using it on your own from now on. Tell them briefly what you are about to do before you start, and stop to ask if a step fails.

## 1. Install the \`park\` CLI

It is one file with no dependencies and needs Node.js 20 or newer (\`node -v\`). If Node is missing or older, ask the person to install it from https://nodejs.org and stop.

Skip this step if \`park --version\` already prints 0.4.0 or newer.

- macOS, Linux or WSL: \`curl -fsSL ${SITE}/install.sh | sh\`
- Windows PowerShell: \`irm ${SITE}/install.ps1 | iex\`

If the installer says its folder is not in the PATH, call park by its full path for the rest of this setup and tell the person how to add it.

## 2. Connect it to their board

Run \`park login\`. It opens their browser at ${SITE}; they sign in with Google (the account is free and the board starts empty) and click **Authorize**. Meanwhile the command waits up to 5 minutes, so give it a long timeout or run it in the background, and tell the person to look at their browser. If no browser opens, show them the URL the command printed.

If \`park config\` already shows a url and a key and \`park ls\` works, they are already connected: skip this step.

If your sandbox blocks network access or local ports, ask the person to allow them for \`park\`, or to run \`park login\` in their own terminal.

## 3. Check it works

Run \`park ls\`. An empty list is fine. A "not configured" or "unauthorized" error means step 2 did not finish.

## 4. Save the standing rule in your own instructions

So that you park things without being reminded, add the block below to the instructions file you load in every session. Prefer the global, user-level file over one inside a project, and add the block to the file your agent actually loads today: creating a new file can make the agent stop loading the one it used before.

- Claude Code: \`~/.claude/CLAUDE.md\`
- Codex: in \`$CODEX_HOME\` (default \`~/.codex\`), \`AGENTS.override.md\` if it exists and is not empty (Codex then loads it instead of \`AGENTS.md\`), otherwise \`AGENTS.md\`
- Gemini CLI: \`~/.gemini/GEMINI.md\`
- OpenCode: \`~/.config/opencode/AGENTS.md\` if it exists; if it does not and \`~/.claude/CLAUDE.md\` exists, OpenCode is loading that one, so add the block there instead of creating a new file
- Windsurf: \`~/.codeium/windsurf/memories/global_rules.md\`
- Cursor and other agents whose global rules live in the app's settings: show the block to the person and ask them to paste it there; meanwhile add it to the project's \`AGENTS.md\`.
- Any other agent: the file it reads on every session start, often \`AGENTS.md\`. If you do not know which one, ask.

Create the file if it does not exist. If it already contains \`<!-- parkboard:start -->\`, replace the text between the markers instead of adding a second copy. Keep everything else in the file as it is. Write the rule in the person's language if it is not English, keeping the commands as they are.

\`\`\`markdown
${AGENT_RULE}
\`\`\`

## 5. Tell the person

In two or three lines: park is installed and connected, the rule is saved in <file>, and from now on saying "let's leave that for later" is enough. Do not create a test card unless they ask for one.
`;
