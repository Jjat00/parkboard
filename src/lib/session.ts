import type { CardDTO } from "./types";

export const AGENT_LABEL: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex" };

const quote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

/** Shell command that reopens the conversation where the card was born. Same logic as the CLI. */
export function resumeCommand(card: Pick<CardDTO, "agent" | "sessionId" | "cwd">) {
  if (!card.sessionId) return null;
  const cd = card.cwd ? `cd ${quote(card.cwd)} && ` : "";
  if (card.agent === "claude-code") return `${cd}claude --resume ${card.sessionId}`;
  if (card.agent === "codex") return `${cd}codex resume ${card.sessionId}`;
  return null;
}
