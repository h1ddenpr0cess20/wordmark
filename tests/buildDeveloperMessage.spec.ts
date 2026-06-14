import test from "node:test";
import assert from "node:assert/strict";

// buildDeveloperMessage transitively reads localStorage (tool catalog / memory)
// when function calling is enabled, so stub the browser globals it needs.
const store: Record<string, string> = {};
globalThis.window = globalThis.window || ({} as Window & typeof globalThis);
globalThis.localStorage = {
  getItem(key: string) { return key in store ? store[key] : null; },
  setItem(key: string, value: string) { store[key] = String(value); },
  removeItem(key: string) { delete store[key]; },
} as unknown as Storage;

const { elements } = await import("../src/ts/init/state.js");
const { buildDeveloperMessage } = await import("../src/ts/services/api/messageUtils.js");

const el = elements as Record<string, unknown>;

test("buildDeveloperMessage returns empty string when there are no instructions", () => {
  el.noPromptRadio = { checked: true };
  el.customPromptRadio = { checked: false };
  el.personalityPromptRadio = { checked: false };
  assert.equal(buildDeveloperMessage(), "");
});

test("buildDeveloperMessage starts with the prompt and includes a generated-on timestamp", () => {
  el.noPromptRadio = { checked: false };
  el.customPromptRadio = { checked: true };
  el.personalityPromptRadio = { checked: false };
  el.systemPromptCustom = { value: "BE BRIEF" };

  const result = buildDeveloperMessage();
  assert.ok(typeof result === "string" && result.startsWith("BE BRIEF"));
  // the timestamp line is appended after the instructions
  assert.match(result as string, /\(Generated on .+\)/);
});
