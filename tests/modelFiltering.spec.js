import test from "node:test";
import assert from "node:assert/strict";

// config.js is now an ES module exporting the `config` singleton. Provide
// minimal browser stubs, then drive the provider fetchAndUpdateModels methods
// directly by swapping globalThis.fetch per test.
globalThis.window = globalThis.window || {};
globalThis.localStorage = {
  storage: {},
  getItem(key) { return this.storage[key] || null; },
  setItem(key, value) { this.storage[key] = value; },
};

const { config } = await import("../src/config/config.js");

function mockFetch(responseData, ok = true) {
  globalThis.fetch = async () => ({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Internal Server Error",
    json: async () => responseData,
    text: async () => JSON.stringify(responseData),
  });
}

// --- LM Studio embedding model filtering ---

test("LM Studio filters out embedding models from data.data format", async () => {
  mockFetch({
    data: [
      { id: "llama-3.1-8b" },
      { id: "nomic-embed-text" },
      { id: "qwen3-8b" },
      { id: "text-embedding-ada-002" },
      { id: "bge-large-en-v1.5-embedding" },
    ],
  });
  await config.services.lmstudio.fetchAndUpdateModels();

  assert.deepEqual(config.services.lmstudio.models, [
    "llama-3.1-8b",
    "qwen3-8b",
  ]);
});

test("LM Studio filters out embedding models from array format", async () => {
  mockFetch([
    "llama-3.1-8b",
    "nomic-embed-text",
    "EMBED-large",
    "qwen3-8b",
  ]);
  await config.services.lmstudio.fetchAndUpdateModels();

  assert.deepEqual(config.services.lmstudio.models, [
    "llama-3.1-8b",
    "qwen3-8b",
  ]);
});

test("LM Studio filters out embedding models from data.models format", async () => {
  mockFetch({
    models: [
      "llama-3.1-8b",
      "embed-v2",
      "qwen3-8b",
    ],
  });
  await config.services.lmstudio.fetchAndUpdateModels();

  assert.deepEqual(config.services.lmstudio.models, [
    "llama-3.1-8b",
    "qwen3-8b",
  ]);
});

test("LM Studio shows 'No models found' when all models are embedding models", async () => {
  mockFetch({
    data: [
      { id: "nomic-embed-text" },
      { id: "text-embedding-ada-002" },
    ],
  });
  await config.services.lmstudio.fetchAndUpdateModels();

  assert.equal(config.services.lmstudio.models.length, 1);
  assert.equal(config.services.lmstudio.models[0], "No models found on server");
});

test("LM Studio keeps all models when none are embedding models", async () => {
  mockFetch({
    data: [
      { id: "llama-3.1-8b" },
      { id: "qwen3-8b" },
      { id: "mistral-7b" },
    ],
  });
  await config.services.lmstudio.fetchAndUpdateModels();

  assert.deepEqual(config.services.lmstudio.models, [
    "llama-3.1-8b",
    "mistral-7b",
    "qwen3-8b",
  ]);
});

// --- Ollama embedding model filtering ---

test("Ollama filters out embedding models from data.data format", async () => {
  mockFetch({
    data: [
      { id: "llama3:latest" },
      { id: "nomic-embed-text:latest" },
      { id: "mxbai-embed-large:latest" },
      { id: "qwen3:8b" },
    ],
  });
  await config.services.ollama.fetchAndUpdateModels();

  assert.deepEqual(config.services.ollama.models, [
    "llama3:latest",
    "qwen3:8b",
  ]);
});

test("Ollama filters out embedding models from api/tags format", async () => {
  globalThis.fetch = async (url) => {
    if (url.includes("/v1/models")) {
      return { ok: false, status: 404, statusText: "Not Found", text: async () => "" };
    }
    // /api/tags fallback
    return {
      ok: true,
      json: async () => ({
        models: [
          { name: "llama3:latest" },
          { name: "all-minilm:embed" },
          { name: "snowflake-arctic-embed:latest" },
          { name: "qwen3:8b" },
        ],
      }),
    };
  };
  await config.services.ollama.fetchAndUpdateModels();

  assert.deepEqual(config.services.ollama.models, [
    "llama3:latest",
    "qwen3:8b",
  ]);
});

test("Ollama filters out embedding models from models array of objects", async () => {
  mockFetch({
    models: [
      { id: "llama3" },
      { id: "nomic-embed-text" },
      { id: "codellama" },
    ],
  });
  await config.services.ollama.fetchAndUpdateModels();

  assert.deepEqual(config.services.ollama.models, [
    "codellama",
    "llama3",
  ]);
});

test("Ollama shows 'No models found on server' when all models are embedding models", async () => {
  mockFetch({
    data: [
      { id: "nomic-embed-text" },
      { id: "mxbai-embed-large" },
    ],
  });
  await config.services.ollama.fetchAndUpdateModels();

  assert.equal(config.services.ollama.models.length, 1);
  assert.equal(config.services.ollama.models[0], "No models found on server");
});

test("Ollama filtering is case-insensitive", async () => {
  mockFetch({
    data: [
      { id: "llama3" },
      { id: "NOMIC-EMBED-TEXT" },
      { id: "Snowflake-Arctic-Embed" },
      { id: "mistral" },
    ],
  });
  await config.services.ollama.fetchAndUpdateModels();

  assert.deepEqual(config.services.ollama.models, [
    "llama3",
    "mistral",
  ]);
});

test("LM Studio filtering is case-insensitive", async () => {
  mockFetch({
    data: [
      { id: "llama-3.1-8b" },
      { id: "Text-Embedding-Ada-002" },
      { id: "BGE-EMBED-Large" },
      { id: "qwen3-8b" },
    ],
  });
  await config.services.lmstudio.fetchAndUpdateModels();

  assert.deepEqual(config.services.lmstudio.models, [
    "llama-3.1-8b",
    "qwen3-8b",
  ]);
});
