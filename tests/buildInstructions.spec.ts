import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || ({} as Window & typeof globalThis);

const { elements, state } = await import("../src/ts/init/state.js");
const { buildInstructions } = await import("../src/ts/services/api/instructions.js");

const el = elements as unknown as Record<string, unknown>;

function setRadios(opts: { none?: boolean; custom?: boolean; personality?: boolean }) {
  el.noPromptRadio = { checked: Boolean(opts.none) };
  el.customPromptRadio = { checked: Boolean(opts.custom) };
  el.personalityPromptRadio = { checked: Boolean(opts.personality) };
}

test("buildInstructions returns empty string for the no-prompt option", () => {
  setRadios({ none: true });
  assert.equal(buildInstructions(), "");
});

test("buildInstructions returns the trimmed custom prompt when selected and non-empty", () => {
  setRadios({ custom: true });
  el.systemPromptCustom = { value: "  be concise and kind  " };
  assert.equal(buildInstructions(), "be concise and kind");
});

test("buildInstructions falls through to the default when the custom prompt is blank", () => {
  setRadios({ custom: true });
  el.systemPromptCustom = { value: "   " };
  const result = buildInstructions();
  assert.equal(typeof result, "string");
  assert.notEqual(result, ""); // not the no-prompt branch
});

test("buildInstructions appends the short-response guideline to the default prompt", () => {
  setRadios({});
  state.shortResponseGuideline = " RESP_GUIDELINE_MARKER";
  const result = buildInstructions();
  assert.ok(result.includes("RESP_GUIDELINE_MARKER"));
  state.shortResponseGuideline = "";
});
