// node --test src/lib/autopilot.test.mjs (Node strips the types of autopilot.ts)
import assert from "node:assert/strict";
import { test } from "node:test";
import { lastAutopilotNote } from "./autopilot.ts";

test("the last Autopilot note stops where Jaime's text starts", () => {
  const notes = "Contexto.\n\n**Autopilot (2026-10-15):** no la tomé.\n\n**Autopilot (2026-10-16):** abrí el PR\n\nComentario humano: pendiente probar.";
  assert.deepEqual(lastAutopilotNote(notes), { date: "2026-10-16", text: "abrí el PR" });
});

test("an entry ends at the first blank line, even inside a truncated block", () => {
  const notes = "**Autopilot (2026-10-16):** los verificadores fallan:\n```\nfail 1\nfail 2\n```";
  assert.equal(lastAutopilotNote(notes)?.text, "los verificadores fallan:\n```\nfail 1\nfail 2\n```");
  const truncated = "**Autopilot (2026-10-16):** falla:\n```\n" + "x".repeat(50) + "\n\nNo tocar producción.";
  assert.equal(lastAutopilotNote(truncated)?.text, "falla:\n```\n" + "x".repeat(50));
  assert.equal(lastAutopilotNote("sin nada"), null);
});
