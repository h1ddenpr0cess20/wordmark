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
const { buildDeveloperMessage } = await import("../src/ts/services/api/instructions.js");
const { addUserSkill, setSkillEnabled, removeUserSkill } = await import("../src/ts/services/skills/skillsStore.js");

const el = elements as unknown as Record<string, unknown>;

test("buildDeveloperMessage returns empty string when there are no instructions", () => {
  el.noPromptRadio = { checked: true };
  el.customPromptRadio = { checked: false };
  el.personalityPromptRadio = { checked: false };
  assert.equal(buildDeveloperMessage(), "");
});

test("buildDeveloperMessage still surfaces enabled skills in no-prompt mode", () => {
  el.noPromptRadio = { checked: true };
  el.customPromptRadio = { checked: false };
  el.personalityPromptRadio = { checked: false };

  const skill = addUserSkill({
    name: "No-Prompt Probe",
    description: "Used to verify skills surface without a base prompt.",
    instructions: "Do the probe thing.",
  });
  setSkillEnabled(skill.id, true);
  try {
    const result = buildDeveloperMessage();
    // Without the discovery list the `activate_skill` tool would be offered
    // with nothing for the model to act on, so the skill must appear here.
    assert.ok(typeof result === "string" && result.includes("No-Prompt Probe"));
  } finally {
    removeUserSkill(skill.id);
  }
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
