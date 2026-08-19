import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || ({} as Window & typeof globalThis);
const store: Record<string, string> = {};
globalThis.localStorage = {
  getItem(key: string) { return key in store ? store[key] : null; },
  setItem(key: string, value: string) { store[key] = value; },
  removeItem(key: string) { delete store[key]; },
} as unknown as Storage;

const { apiKeyStorageKey } = await import("../src/ts/utils/storage/storage.js");
const { config } = await import("../src/config/config.js");

interface Call { url: string; headers: Record<string, string> }

/** Replays `responses` in order, recording the URL and headers of each request. */
function mockFetch(responses: Array<{ ok?: boolean; data: unknown }>): Call[] {
  const calls: Call[] = [];
  let index = 0;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const response = responses[Math.min(index, responses.length - 1)];
    index++;
    calls.push({ url: String(url), headers: { ...(init?.headers as Record<string, string> | undefined) } });
    return {
      ok: response.ok !== false,
      status: response.ok === false ? 500 : 200,
      statusText: response.ok === false ? "Internal Server Error" : "OK",
      json: async () => response.data,
      text: async () => JSON.stringify(response.data),
    };
  }) as unknown as typeof fetch;
  return calls;
}

/** Clears a local provider's key from both storage and the live config. */
function clearKey(serviceKey: "lmstudio" | "ollama") {
  delete store[apiKeyStorageKey(serviceKey)];
  config.services[serviceKey].apiKey = "";
}

test("LM Studio models are fetched unauthenticated when no key is set", async () => {
  clearKey("lmstudio");
  const calls = mockFetch([{ data: { data: [{ id: "qwen3-8b" }] } }]);

  await config.services.lmstudio.fetchAndUpdateModels();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers.Authorization, undefined, "an unkeyed server must not be sent a bearer token");
});

test("a stored LM Studio key is sent as a bearer token", async () => {
  clearKey("lmstudio");
  store[apiKeyStorageKey("lmstudio")] = "lms-secret";
  const calls = mockFetch([{ data: { data: [{ id: "qwen3-8b" }] } }]);

  await config.services.lmstudio.fetchAndUpdateModels();

  assert.equal(calls[0].headers.Authorization, "Bearer lms-secret");
  assert.equal(config.services.lmstudio.apiKey, "lms-secret", "the stored key is hydrated onto the service");
  clearKey("lmstudio");
});

test("a stored Ollama key is sent on both the models call and the tags fallback", async () => {
  clearKey("ollama");
  store[apiKeyStorageKey("ollama")] = "ollama-secret";
  const calls = mockFetch([
    { ok: false, data: { error: "unauthorized" } },
    { data: { models: [{ name: "gemma4" }] } },
  ]);

  await config.services.ollama.fetchAndUpdateModels();

  assert.equal(calls.length, 2, "a failed /models call falls back to /api/tags");
  assert.ok(calls[1].url.endsWith("/api/tags"));
  for (const call of calls) {
    assert.equal(call.headers.Authorization, "Bearer ollama-secret");
  }
  assert.deepEqual(config.services.ollama.models, ["gemma4"]);
  clearKey("ollama");
});

test("a whitespace-only key is treated as no key", async () => {
  clearKey("ollama");
  store[apiKeyStorageKey("ollama")] = "   ";
  const calls = mockFetch([{ data: { data: [{ id: "gemma4" }] } }]);

  await config.services.ollama.fetchAndUpdateModels();

  assert.equal(calls[0].headers.Authorization, undefined);
  clearKey("ollama");
});
