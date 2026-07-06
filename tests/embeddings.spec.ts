import test, { mock } from "node:test";
import assert from "node:assert/strict";

/**
 * Tests for the local embedding utilities. config, clientConfig, and
 * requestTransport are replaced with fakes via mock.module so the pure helpers
 * and the /embeddings request can be exercised without a running server.
 */

const configObj = {
  services: {
    lmstudio: {
      models: ["llama-3-8b"] as string[],
      embeddingModels: [] as string[],
    },
  },
};

mock.module(new URL("../src/config/config.ts", import.meta.url).href, {
  namedExports: { config: configObj },
});

mock.module(new URL("../src/ts/services/api/clientConfig.ts", import.meta.url).href, {
  namedExports: {
    getActiveServiceKey: () => "lmstudio",
    getBaseUrl: () => "http://localhost:1234/v1",
  },
});

mock.module(new URL("../src/ts/services/api/requestTransport.ts", import.meta.url).href, {
  namedExports: { buildHeaders: () => ({ "Content-Type": "application/json" }) },
});

const { chunkText, cosineSim, resolveEmbeddingModel, fetchEmbeddings, EMBEDDING_MODEL_STORAGE_KEY } =
  await import("../src/ts/services/embeddings.ts");

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as unknown as Storage;

test("chunkText keeps chunks near the target size and reassembles to the source words", () => {
  const paragraphs = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} has several words in it.`).join("\n\n");
  const chunks = chunkText(paragraphs, 200);
  assert.ok(chunks.length > 1, "should split into multiple chunks");
  for (const c of chunks) {
    assert.ok(c.length <= 200 + 60, `chunk too large: ${c.length}`);
  }
  const rejoined = chunks.join(" ").replace(/\s+/g, " ");
  assert.match(rejoined, /Paragraph 0 has/);
  assert.match(rejoined, /Paragraph 39 has/);
});

test("chunkText returns a single chunk when text is under the size", () => {
  assert.deepEqual(chunkText("short text", 2000), ["short text"]);
});

test("cosineSim is 1 for identical, 0 for orthogonal, and ranks by direction", () => {
  assert.equal(cosineSim([1, 0], [1, 0]), 1);
  assert.equal(cosineSim([1, 0], [0, 1]), 0);
  assert.ok(cosineSim([1, 1], [1, 0.9]) > cosineSim([1, 1], [1, 0.1]));
});

test("resolveEmbeddingModel defaults to nomic, falls back to other embedding models, then scans chat models", () => {
  store.clear();

  configObj.services.lmstudio.embeddingModels = [
    "text-embedding-mxbai-embed-large-v1",
    "text-embedding-embeddinggemma-300m-qat",
    "text-embedding-nomic-embed-text-v1.5",
  ];
  assert.equal(resolveEmbeddingModel(), "text-embedding-nomic-embed-text-v1.5", "nomic is the default");

  configObj.services.lmstudio.embeddingModels = [
    "text-embedding-embeddinggemma-300m-qat",
    "text-embedding-mxbai-embed-large-v1",
  ];
  assert.equal(resolveEmbeddingModel(), "text-embedding-mxbai-embed-large-v1", "backup default when nomic absent");

  configObj.services.lmstudio.embeddingModels = ["some-unknown-embedding"];
  assert.equal(resolveEmbeddingModel(), "some-unknown-embedding", "any available embedding model as last resort");

  configObj.services.lmstudio.embeddingModels = [];
  configObj.services.lmstudio.models = ["llama-3-8b", "text-embedding-nomic-embed-text-v1.5"];
  assert.equal(resolveEmbeddingModel(), "text-embedding-nomic-embed-text-v1.5", "scans chat models when no embedding list");

  configObj.services.lmstudio.models = ["llama-3-8b", "qwen2.5"];
  assert.equal(resolveEmbeddingModel(), null);

  store.set(EMBEDDING_MODEL_STORAGE_KEY, "my-embed-model");
  assert.equal(resolveEmbeddingModel(), "my-embed-model");
});

test("fetchEmbeddings posts to /embeddings and returns vectors in input order", async () => {
  const calls: { url: string; body: unknown }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return {
      ok: true,
      json: async () => ({ data: [
        { index: 1, embedding: [0, 1] },
        { index: 0, embedding: [1, 0] },
      ] }),
    };
  }) as unknown as typeof fetch;

  const vectors = await fetchEmbeddings(["a", "b"], "embed-model");
  assert.equal(calls[0].url, "http://localhost:1234/v1/embeddings");
  assert.deepEqual((calls[0].body as { input: string[] }).input, ["a", "b"]);
  assert.deepEqual(vectors, [[1, 0], [0, 1]]);
});

test("fetchEmbeddings throws on a non-ok response", async () => {
  globalThis.fetch = (async () => ({ ok: false, status: 500, text: async () => "boom" })) as unknown as typeof fetch;
  await assert.rejects(() => fetchEmbeddings(["a"], "embed-model"), /HTTP 500/);
});
