import type { CardDTO } from "./types";

export const AGENT_LABEL: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex" };

/** Single-quotes a value as one shell word. */
export const shellQuote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

/** Shell command that reopens the conversation where the card was born. Same logic as the CLI. */
export function resumeCommand(card: Pick<CardDTO, "agent" | "sessionId" | "cwd">) {
  if (!card.sessionId) return null;
  // Every stored value is quoted: a card written through an API key must not be able to plant
  // extra commands in what the user copies and runs.
  const cd = card.cwd ? `cd ${shellQuote(card.cwd)} && ` : "";
  const id = shellQuote(card.sessionId);
  if (card.agent === "claude-code") return `${cd}claude --resume ${id}`;
  if (card.agent === "codex") return `${cd}codex resume ${id}`;
  return null;
}
