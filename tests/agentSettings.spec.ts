import test from "node:test";
import assert from "node:assert/strict";

let store: Record<string, string> = {};
globalThis.window = globalThis.window || ({} as Window & typeof globalThis);
globalThis.localStorage = {
  getItem(key: string) { return key in store ? store[key] : null; },
  setItem(key: string, value: string) { store[key] = String(value); },
  removeItem(key: string) { delete store[key]; },
  clear() { store = {}; },
} as unknown as Storage;

const {
  DEFAULT_AGENT_MAX_TURNS,
  MIN_AGENT_MAX_TURNS,
  MAX_AGENT_MAX_TURNS,
  agentMaxTurns,
  clampTurns,
  isAgentModeEnabled,
  setAgentMaxTurns,
  setAgentModeEnabled,
} = await import("../src/ts/services/agent/agentSettings.ts");

function reset() {
  store = {};
}

test("autonomous work is off until it is switched on", () => {
  reset();
  assert.equal(isAgentModeEnabled(), false);

  setAgentModeEnabled(true);
  assert.equal(isAgentModeEnabled(), true);

  setAgentModeEnabled(false);
  assert.equal(isAgentModeEnabled(), false);
});

test("the turn budget falls back to the default when unset or unusable", () => {
  reset();
  assert.equal(agentMaxTurns(), DEFAULT_AGENT_MAX_TURNS);

  store.agentMaxTurns = "not a number";
  assert.equal(agentMaxTurns(), DEFAULT_AGENT_MAX_TURNS);

  store.agentMaxTurns = "0";
  assert.equal(agentMaxTurns(), DEFAULT_AGENT_MAX_TURNS);
});

test("a stored budget is clamped on the way in and on the way out", () => {
  reset();
  assert.equal(setAgentMaxTurns(1000), MAX_AGENT_MAX_TURNS);
  assert.equal(agentMaxTurns(), MAX_AGENT_MAX_TURNS);

  assert.equal(setAgentMaxTurns(1), MIN_AGENT_MAX_TURNS);
  assert.equal(agentMaxTurns(), MIN_AGENT_MAX_TURNS);

  // A value written by hand rather than through the setter is still clamped.
  store.agentMaxTurns = "9999";
  assert.equal(agentMaxTurns(), MAX_AGENT_MAX_TURNS);
});

test("fractional budgets round to whole turns", () => {
  reset();
  assert.equal(clampTurns(7.4), 7);
  assert.equal(clampTurns(7.6), 8);
  assert.equal(clampTurns(Number.NaN), DEFAULT_AGENT_MAX_TURNS);
});
