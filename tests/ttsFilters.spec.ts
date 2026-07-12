import test from "node:test";
import assert from "node:assert/strict";

const elements = new Map<string, unknown>();
globalThis.window = globalThis.window || ({} as Window & typeof globalThis);
globalThis.document = {
  getElementById(id: string) {
    return elements.get(id) || null;
  },
} as unknown as Document;

const { shouldSkipTts } = await import("../src/ts/services/tts/filters.js");

function fakeMessage(opts: { classes?: string[]; text?: string }) {
  const classes = opts.classes || [];
  return {
    classList: { contains: (c: string) => classes.includes(c) },
    querySelector: (sel: string) =>
      sel === ".message-text" ? { innerText: opts.text || "" } : null,
  };
}

test("shouldSkipTts skips when the message element is missing", () => {
  elements.clear();
  assert.equal(shouldSkipTts("nope"), true);
});

test("shouldSkipTts skips system messages", () => {
  elements.clear();
  elements.set("message-sys", fakeMessage({ classes: ["system-message"], text: "hello" }));
  assert.equal(shouldSkipTts("sys"), true);
});

test("shouldSkipTts speaks a normal prose message", () => {
  elements.clear();
  elements.set("message-ok", fakeMessage({ text: "The weather today is sunny and mild." }));
  assert.equal(shouldSkipTts("ok"), false);
});

test("shouldSkipTts skips messages containing code/tool markers", () => {
  elements.clear();
  for (const marker of [
    "Here you go:\n```python\nprint(1)\n```",
    "see <tool_code>do()</tool_code>",
    "result\n```\nx\n```",
    "tool_code\nprint(2)",
  ]) {
    elements.clear();
    elements.set("message-m", fakeMessage({ text: marker }));
    assert.equal(shouldSkipTts("m"), true, `expected skip for: ${marker}`);
  }
});

test("shouldSkipTts falls back to the raw id when message-<id> is absent", () => {
  elements.clear();
  elements.set("raw-id", fakeMessage({ text: "plain text" }));
  assert.equal(shouldSkipTts("raw-id"), false);
});
