import test from "node:test";
import assert from "node:assert/strict";

const store: Record<string, string> = {};
globalThis.window = globalThis.window || ({} as Window & typeof globalThis);
globalThis.localStorage = {
  getItem(key: string) { return key in store ? store[key] : null; },
  setItem(key: string, value: string) { store[key] = value; },
  removeItem(key: string) { delete store[key]; },
} as unknown as Storage;

const { config } = await import("../src/config/config.js");
const { state } = await import("../src/ts/init/state.js");
const {
  DEFAULT_CLOUD_HISTORY_TOKEN_BUDGET,
  DEFAULT_LOCAL_HISTORY_TOKEN_BUDGET,
  defaultHistoryTokenBudget,
  getHistoryTokenBudget,
} = await import("../src/ts/init/modelSettings.js");

test("cloud providers default to a larger history budget than local servers", () => {
  assert.equal(defaultHistoryTokenBudget("openai"), DEFAULT_CLOUD_HISTORY_TOKEN_BUDGET);
  assert.equal(defaultHistoryTokenBudget("xai"), DEFAULT_CLOUD_HISTORY_TOKEN_BUDGET);
  assert.equal(defaultHistoryTokenBudget("openrouter"), DEFAULT_CLOUD_HISTORY_TOKEN_BUDGET);
  assert.equal(defaultHistoryTokenBudget("lmstudio"), DEFAULT_LOCAL_HISTORY_TOKEN_BUDGET);
  assert.equal(defaultHistoryTokenBudget("ollama"), DEFAULT_LOCAL_HISTORY_TOKEN_BUDGET);
  assert.ok(DEFAULT_CLOUD_HISTORY_TOKEN_BUDGET > DEFAULT_LOCAL_HISTORY_TOKEN_BUDGET);
});

test("local servers keep the 16384 budget they already had", () => {
  assert.equal(DEFAULT_LOCAL_HISTORY_TOKEN_BUDGET, 16384);
});

test("an unset budget follows the active service", () => {
  const originalService = config.defaultService;
  const originalBudget = state.historyTokenBudget;
  try {
    state.historyTokenBudget = undefined;

    config.defaultService = "ollama";
    assert.equal(getHistoryTokenBudget(), DEFAULT_LOCAL_HISTORY_TOKEN_BUDGET);

    config.defaultService = "openai";
    assert.equal(getHistoryTokenBudget(), DEFAULT_CLOUD_HISTORY_TOKEN_BUDGET);
  } finally {
    config.defaultService = originalService;
    state.historyTokenBudget = originalBudget;
  }
});

test("an explicit budget overrides the provider default, including 0 for no limit", () => {
  const originalService = config.defaultService;
  const originalBudget = state.historyTokenBudget;
  try {
    config.defaultService = "openai";

    state.historyTokenBudget = 4000;
    assert.equal(getHistoryTokenBudget(), 4000);

    state.historyTokenBudget = 0;
    assert.equal(getHistoryTokenBudget(), 0, "0 stays an explicit 'no limit'");

    state.historyTokenBudget = -5;
    assert.equal(
      getHistoryTokenBudget(),
      DEFAULT_CLOUD_HISTORY_TOKEN_BUDGET,
      "an invalid stored value falls back to the provider default",
    );
  } finally {
    config.defaultService = originalService;
    state.historyTokenBudget = originalBudget;
  }
});
