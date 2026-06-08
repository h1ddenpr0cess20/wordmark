import test from "node:test";
import assert from "node:assert/strict";

// Regression: a saved API key must reach config.services regardless of whether
// the API-key input elements have been cached yet. Otherwise startup default-
// service selection sees no key and falls back to a keyless provider.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.window = globalThis.window || {};

const { config } = await import("../src/config/config.js");
const { loadApiKeysIntoConfig } = await import("../src/js/services/apiKeyStorage.js");

test("loads a saved xAI key into config without any DOM input cached", () => {
  config.services.openai.apiKey = "";
  config.services.xai.apiKey = "";
  store.clear();
  store.set("wordmark_api_key_xai", "xai-secret");

  loadApiKeysIntoConfig();

  assert.equal(config.services.xai.apiKey, "xai-secret");
  assert.equal(config.services.openai.apiKey, "");
});

test("ignores blank/whitespace stored keys", () => {
  config.services.openai.apiKey = "";
  store.clear();
  store.set("wordmark_api_key_openai", "   ");

  loadApiKeysIntoConfig();

  assert.equal(config.services.openai.apiKey, "");
});
