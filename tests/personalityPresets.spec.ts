import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

/**
 * The persona suggestion dropdown. It only fills the personality field — the
 * settings panel stays open and no conversation is started until the user
 * presses "Set Personality".
 */

let visibilityUpdates = 0;

const dom = new JSDOM(
  `<!DOCTYPE html><body>
     <input type="radio" name="prompt-type" id="personality-prompt">
     <input type="text" id="personality-input">
     <select id="personality-preset-select">
       <option value="" selected>Choose a persona...</option>
     </select>
   </body>`,
  { url: "https://example.com" },
);
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;

const presetSelect = dom.window.document.getElementById("personality-preset-select") as HTMLSelectElement;
const personalityInput = dom.window.document.getElementById("personality-input") as HTMLInputElement;
const personalityPromptRadio = dom.window.document.getElementById("personality-prompt") as HTMLInputElement;

function mockModule(rel: string, namedExports: Record<string, unknown>): void {
  mock.module(new URL(rel, import.meta.url).href, { namedExports });
}

mockModule("../src/ts/init/state.ts", {
  elements: { personalityInput, personalityPromptRadio },
  state: { verbose: false },
});
mockModule("../src/ts/components/ui/settingsControls.ts", {
  updatePromptVisibility: () => { visibilityUpdates += 1; },
  updateParameterControls: () => {},
});

const { PERSONALITY_PRESETS } = await import("../src/config/config.ts");
const { setupPromptEventListeners } = await import("../src/ts/init/eventListeners/prompts.ts");

setupPromptEventListeners();

function selectPreset(personality: string): void {
  presetSelect.value = personality;
  presetSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
}

test("populates the dropdown with every preset behind the placeholder", () => {
  assert.equal(presetSelect.options.length, PERSONALITY_PRESETS.length + 1);
  assert.equal(presetSelect.options[0].value, "");
  assert.equal(presetSelect.options[1].value, PERSONALITY_PRESETS[0].personality);
  assert.equal(presetSelect.options[1].textContent, PERSONALITY_PRESETS[0].label);
});

test("picking a suggestion fills the field without applying it", () => {
  visibilityUpdates = 0;
  personalityInput.value = "";
  personalityPromptRadio.checked = false;

  selectPreset(PERSONALITY_PRESETS[2].personality);

  assert.equal(personalityInput.value, PERSONALITY_PRESETS[2].personality);
  assert.equal(personalityPromptRadio.checked, true);
  assert.equal(visibilityUpdates, 1);
  // Not applied yet: that only happens via the "Set Personality" button.
  assert.equal(personalityInput.hasAttribute("data-explicitly-set"), false);
  // The dropdown returns to its placeholder so the same suggestion can be re-picked.
  assert.equal(presetSelect.selectedIndex, 0);
});

test("the placeholder option leaves the field alone", () => {
  personalityInput.value = "a pirate captain";

  selectPreset("");

  assert.equal(personalityInput.value, "a pirate captain");
});
