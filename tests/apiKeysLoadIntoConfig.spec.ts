import test from "node:test";
import assert from "node:assert/strict";

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k) ?? null : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
} as unknown as Storage;
globalThis.window = globalThis.window || ({} as Window & typeof globalThis);

const { config } = await import("../src/config/config.js");
const { loadApiKeysIntoConfig } = await import("../src/ts/services/apiKeyStorage.ts");

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

test("loads a saved local-server key into config", () => {
  config.services.lmstudio.apiKey = "";
  config.services.ollama.apiKey = "";
  store.clear();
  store.set("wordmark_api_key_lmstudio", "lms-secret");

  loadApiKeysIntoConfig();

  assert.equal(config.services.lmstudio.apiKey, "lms-secret");
  assert.equal(config.services.ollama.apiKey, "", "a local key is per-server, not shared between them");
});
