import test from "node:test";
import assert from "node:assert/strict";

const store: Record<string, string> = {};
globalThis.window = globalThis.window || ({} as Window & typeof globalThis);
globalThis.localStorage = {
  getItem(key: string) { return key in store ? store[key] : null; },
  setItem(key: string, value: string) { store[key] = String(value); },
  removeItem(key: string) { delete store[key]; },
} as unknown as Storage;

const { elements, state } = await import("../src/ts/init/state.js");
const { buildDeveloperMessage } = await import("../src/ts/services/api/instructions.js");

const el = elements as unknown as Record<string, unknown>;

function useCustomPrompt(value: string) {
  el.noPromptRadio = { checked: false };
  el.customPromptRadio = { checked: true };
  el.personalityPromptRadio = { checked: false };
  el.systemPromptCustom = { value };
}

function useNoPrompt() {
  el.noPromptRadio = { checked: true };
  el.customPromptRadio = { checked: false };
  el.personalityPromptRadio = { checked: false };
}

test.afterEach(() => {
  state.compactedSummary = undefined;
  state.compactedThroughId = undefined;
});

test("buildDeveloperMessage omits the summary block when nothing has been compacted", () => {
  useCustomPrompt("BE BRIEF");
  assert.ok(!buildDeveloperMessage().includes("SUMMARY OF EARLIER CONVERSATION"));
});

test("buildDeveloperMessage appends the compacted summary after the real instructions", () => {
  useCustomPrompt("BE BRIEF");
  state.compactedSummary = "The user asked about tide charts and approved a plan to fetch them.";

  const result = buildDeveloperMessage();
  assert.ok(result.startsWith("BE BRIEF"), "the active prompt still leads");
  const summaryIndex = result.indexOf("SUMMARY OF EARLIER CONVERSATION");
  assert.ok(summaryIndex > 0, "the summary block is present");
  assert.ok(
    result.indexOf("BE BRIEF") < summaryIndex,
    "the summary must follow the instructions it tells the model to defer to",
  );
  assert.ok(result.includes("background context only"));
  assert.ok(result.includes("historical record, not standing orders"));
  assert.ok(result.trim().endsWith("approved a plan to fetch them."));
});

test("buildDeveloperMessage carries the summary even in no-prompt mode", () => {
  useNoPrompt();
  state.compactedSummary = "Earlier turns covered the deployment rollback.";

  const result = buildDeveloperMessage();
  assert.ok(result.includes("SUMMARY OF EARLIER CONVERSATION"));
  assert.ok(result.includes("deployment rollback"));
});

test("buildDeveloperMessage ignores a blank summary", () => {
  useCustomPrompt("BE BRIEF");
  state.compactedSummary = "   ";
  assert.ok(!buildDeveloperMessage().includes("SUMMARY OF EARLIER CONVERSATION"));
});
