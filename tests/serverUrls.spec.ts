import test from "node:test";
import assert from "node:assert/strict";

const store: Record<string, string> = {};
globalThis.localStorage = {
  getItem(key: string) { return key in store ? store[key] : null; },
  setItem(key: string, value: string) { store[key] = String(value); },
  removeItem(key: string) { delete store[key]; },
} as unknown as Storage;

const { config } = await import("../src/config/config.js");
const {
  getLmStudioServerUrl,
  getOllamaServerUrl,
  DEFAULT_LMSTUDIO_URL,
  DEFAULT_OLLAMA_URL,
} = await import("../src/ts/services/apiKeyStorage.js");

const LM_KEY = "wordmark_lmstudio_server_url";
const OLLAMA_KEY = "wordmark_ollama_server_url";

test("getLmStudioServerUrl appends /v1 to a stored URL that lacks it", () => {
  store[LM_KEY] = "http://host:9999";
  assert.equal(getLmStudioServerUrl(), "http://host:9999/v1");
});

test("getLmStudioServerUrl leaves a stored URL that already ends in /v1", () => {
  store[LM_KEY] = "http://host:9999/v1";
  assert.equal(getLmStudioServerUrl(), "http://host:9999/v1");
});

test("getLmStudioServerUrl falls back to config then to the default", () => {
  delete store[LM_KEY];
  config.services.lmstudio.baseUrl = "http://configured/v1";
  assert.equal(getLmStudioServerUrl(), "http://configured/v1");

  config.services.lmstudio.baseUrl = "";
  assert.equal(getLmStudioServerUrl(), DEFAULT_LMSTUDIO_URL);
});

test("getOllamaServerUrl appends /v1, honors config, and defaults", () => {
  store[OLLAMA_KEY] = "http://box:1111";
  assert.equal(getOllamaServerUrl(), "http://box:1111/v1");

  delete store[OLLAMA_KEY];
  config.services.ollama.baseUrl = "";
  assert.equal(getOllamaServerUrl(), DEFAULT_OLLAMA_URL);
});
