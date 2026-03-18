import test from "node:test";
import assert from "node:assert/strict";
import { loadWindowScript } from "./helpers/loadWindowScript.js";

function createMockFetch(responseData, ok = true) {
  return async () => ({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Internal Server Error",
    json: async () => responseData,
    text: async () => JSON.stringify(responseData),
  });
}

function loadConfig(fetchFn) {
  return loadWindowScript("src/config/config.js", {
    window: {
      addEventListener() {},
    },
    fetch: fetchFn,
    globals: {
      localStorage: {
        storage: {},
        getItem(key) { return this.storage[key] || null; },
        setItem(key, value) { this.storage[key] = value; },
      },
    },
  });
}

// --- LM Studio embedding model filtering ---

test("LM Studio filters out embedding models from data.data format", async () => {
  const mockData = {
    data: [
      { id: "llama-3.1-8b" },
      { id: "nomic-embed-text" },
      { id: "qwen3-8b" },
      { id: "text-embedding-ada-002" },
      { id: "bge-large-en-v1.5-embedding" },
    ],
  };
  const win = loadConfig(createMockFetch(mockData));
  await win.config.services.lmstudio.fetchAndUpdateModels();

  assert.deepEqual(win.config.services.lmstudio.models, [
    "llama-3.1-8b",
    "qwen3-8b",
  ]);
});

test("LM Studio filters out embedding models from array format", async () => {
  const mockData = [
    "llama-3.1-8b",
    "nomic-embed-text",
    "EMBED-large",
    "qwen3-8b",
  ];
  const win = loadConfig(createMockFetch(mockData));
  await win.config.services.lmstudio.fetchAndUpdateModels();

  assert.deepEqual(win.config.services.lmstudio.models, [
    "llama-3.1-8b",
    "qwen3-8b",
  ]);
});

test("LM Studio filters out embedding models from data.models format", async () => {
  const mockData = {
    models: [
      "llama-3.1-8b",
      "embed-v2",
      "qwen3-8b",
    ],
  };
  const win = loadConfig(createMockFetch(mockData));
  await win.config.services.lmstudio.fetchAndUpdateModels();

  assert.deepEqual(win.config.services.lmstudio.models, [
    "llama-3.1-8b",
    "qwen3-8b",
  ]);
});

test("LM Studio shows 'No models found' when all models are embedding models", async () => {
  const mockData = {
    data: [
      { id: "nomic-embed-text" },
      { id: "text-embedding-ada-002" },
    ],
  };
  const win = loadConfig(createMockFetch(mockData));
  await win.config.services.lmstudio.fetchAndUpdateModels();

  assert.equal(win.config.services.lmstudio.models.length, 1);
  assert.equal(win.config.services.lmstudio.models[0], "No models found on server");
});

test("LM Studio keeps all models when none are embedding models", async () => {
  const mockData = {
    data: [
      { id: "llama-3.1-8b" },
      { id: "qwen3-8b" },
      { id: "mistral-7b" },
    ],
  };
  const win = loadConfig(createMockFetch(mockData));
  await win.config.services.lmstudio.fetchAndUpdateModels();

  assert.deepEqual(win.config.services.lmstudio.models, [
    "llama-3.1-8b",
    "mistral-7b",
    "qwen3-8b",
  ]);
});

// --- Ollama embedding model filtering ---

test("Ollama filters out embedding models from data.data format", async () => {
  const mockData = {
    data: [
      { id: "llama3:latest" },
      { id: "nomic-embed-text:latest" },
      { id: "mxbai-embed-large:latest" },
      { id: "qwen3:8b" },
    ],
  };
  const win = loadConfig(createMockFetch(mockData));
  await win.config.services.ollama.fetchAndUpdateModels();

  assert.deepEqual(win.config.services.ollama.models, [
    "llama3:latest",
    "qwen3:8b",
  ]);
});

test("Ollama filters out embedding models from api/tags format", async () => {
  let callCount = 0;
  const mockFetch = async (url) => {
    callCount++;
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
  const win = loadConfig(mockFetch);
  await win.config.services.ollama.fetchAndUpdateModels();

  assert.deepEqual(win.config.services.ollama.models, [
    "llama3:latest",
    "qwen3:8b",
  ]);
});

test("Ollama filters out embedding models from models array of objects", async () => {
  const mockData = {
    models: [
      { id: "llama3" },
      { id: "nomic-embed-text" },
      { id: "codellama" },
    ],
  };
  const win = loadConfig(createMockFetch(mockData));
  await win.config.services.ollama.fetchAndUpdateModels();

  assert.deepEqual(win.config.services.ollama.models, [
    "codellama",
    "llama3",
  ]);
});

test("Ollama shows 'No models found on server' when all models are embedding models", async () => {
  const mockData = {
    data: [
      { id: "nomic-embed-text" },
      { id: "mxbai-embed-large" },
    ],
  };
  const win = loadConfig(createMockFetch(mockData));
  await win.config.services.ollama.fetchAndUpdateModels();

  assert.equal(win.config.services.ollama.models.length, 1);
  assert.equal(win.config.services.ollama.models[0], "No models found on server");
});

test("Ollama filtering is case-insensitive", async () => {
  const mockData = {
    data: [
      { id: "llama3" },
      { id: "NOMIC-EMBED-TEXT" },
      { id: "Snowflake-Arctic-Embed" },
      { id: "mistral" },
    ],
  };
  const win = loadConfig(createMockFetch(mockData));
  await win.config.services.ollama.fetchAndUpdateModels();

  assert.deepEqual(win.config.services.ollama.models, [
    "llama3",
    "mistral",
  ]);
});

test("LM Studio filtering is case-insensitive", async () => {
  const mockData = {
    data: [
      { id: "llama-3.1-8b" },
      { id: "Text-Embedding-Ada-002" },
      { id: "BGE-EMBED-Large" },
      { id: "qwen3-8b" },
    ],
  };
  const win = loadConfig(createMockFetch(mockData));
  await win.config.services.lmstudio.fetchAndUpdateModels();

  assert.deepEqual(win.config.services.lmstudio.models, [
    "llama-3.1-8b",
    "qwen3-8b",
  ]);
});
