import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

/**
 * The autonomous-work settings controls. The run engine and the compaction
 * component are replaced with fakes so only the wiring under test runs.
 */

let autoCompact = false;
let stopCalls = 0;
const infos: string[] = [];

const dom = new JSDOM(
  `<!DOCTYPE html><body>
     <input type="checkbox" id="agent-mode-toggle">
     <input type="number" id="agent-max-turns">
     <input type="checkbox" id="auto-compact-toggle">
   </body>`,
  { url: "https://example.com" },
);
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.localStorage = dom.window.localStorage;

function mockModule(rel: string, namedExports: Record<string, unknown>): void {
  mock.module(new URL(rel, import.meta.url).href, { namedExports });
}

mockModule("../src/ts/services/agent/agentRunner.ts", {
  agentRunner: { reset() {}, stop() { stopCalls += 1; } },
});
mockModule("../src/ts/components/compaction.ts", {
  isAutoCompactEnabled: () => autoCompact,
  setAutoCompactEnabled: (on: boolean) => { autoCompact = on; },
});
mockModule("../src/ts/utils/notifications.ts", {
  showInfo: (m: string) => { infos.push(m); },
  showError: () => {},
});

const { initAgentControls } = await import("../src/ts/components/agentControls.ts");
const { isAgentModeEnabled, agentMaxTurns, MAX_AGENT_MAX_TURNS } =
  await import("../src/ts/services/agent/agentSettings.ts");

const modeToggle = dom.window.document.getElementById("agent-mode-toggle") as HTMLInputElement;
const budgetInput = dom.window.document.getElementById("agent-max-turns") as HTMLInputElement;
const compactToggle = dom.window.document.getElementById("auto-compact-toggle") as HTMLInputElement;

function change(el: HTMLElement): void {
  el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
}

function reset(): void {
  localStorage.clear();
  autoCompact = false;
  stopCalls = 0;
  infos.length = 0;
  modeToggle.checked = false;
  compactToggle.checked = false;
  initAgentControls();
}

test("the budget field is seeded with the stored value and its accepted range", () => {
  reset();

  assert.equal(budgetInput.value, String(agentMaxTurns()));
  assert.equal(budgetInput.max, String(MAX_AGENT_MAX_TURNS));
});

test("an out-of-range budget is clamped and written back into the field", () => {
  reset();

  budgetInput.value = "9999";
  change(budgetInput);

  assert.equal(budgetInput.value, String(MAX_AGENT_MAX_TURNS));
  assert.equal(agentMaxTurns(), MAX_AGENT_MAX_TURNS);
});

test("enabling autonomous work also enables auto-compaction and says so", () => {
  reset();

  modeToggle.checked = true;
  change(modeToggle);

  assert.ok(isAgentModeEnabled());
  assert.ok(autoCompact, "a long run drops its earliest turns without compaction");
  assert.ok(compactToggle.checked, "the companion checkbox flips where the user can see it");
  assert.equal(infos.length, 1);
  assert.match(infos[0], /Auto-Compact History/);
});

test("auto-compaction already on is left alone, without a redundant notice", () => {
  reset();
  autoCompact = true;

  modeToggle.checked = true;
  change(modeToggle);

  assert.ok(autoCompact);
  assert.equal(infos.length, 0);
});

test("disabling autonomous work stops the run but leaves compaction on", () => {
  reset();
  modeToggle.checked = true;
  change(modeToggle);

  modeToggle.checked = false;
  change(modeToggle);

  assert.equal(isAgentModeEnabled(), false);
  assert.equal(stopCalls, 1);
  assert.ok(autoCompact, "compaction may be wanted for its own sake by now");
});
