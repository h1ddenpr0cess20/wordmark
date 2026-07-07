import test, { mock } from "node:test";
import assert from "node:assert/strict";

/**
 * Tests for the storage settings panel's export payload. Storage-backed modules
 * are replaced with fakes via mock.module so the export shape can be verified
 * without IndexedDB: credentials must be excluded and document-index vectors
 * dropped.
 */

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
} as unknown as Storage;

mock.module(new URL("../src/ts/init/state.ts", import.meta.url).href, {
  namedExports: { state: {}, elements: {} },
});

mock.module(new URL("../src/ts/utils/storage/conversationStorage.ts", import.meta.url).href, {
  namedExports: {
    getAllConversationsFromDb: async () => [{ id: "c1", name: "Chat", messages: [] }],
    countConversationsInDb: async () => 1,
    clearAllConversationsFromDb: async () => {},
  },
});

mock.module(new URL("../src/ts/utils/storage/imageStorage.ts", import.meta.url).href, {
  namedExports: {
    countImagesInDb: async () => 0,
    clearAllImagesFromDb: async () => {},
  },
});

mock.module(new URL("../src/ts/utils/storage/audioStorage.ts", import.meta.url).href, {
  namedExports: {
    countAudioInDb: async () => 0,
    clearAllAudioFromDb: async () => {},
  },
});

mock.module(new URL("../src/ts/utils/storage/docChunkStorage.ts", import.meta.url).href, {
  namedExports: {
    getAllDocChunkRecords: async () => [{
      conversationId: "c1",
      updated: "2026-07-06T00:00:00.000Z",
      files: [{ cacheKey: "abc123:embed-model", name: "notes.txt", chunks: null }],
    }],
    loadDocChunks: async () => [
      { name: "notes.txt", text: "hello world", vector: [0.1, 0.2], model: "embed-model", cacheKey: "abc123:embed-model" },
    ],
    clearAllDocChunks: async () => {},
    countCachedFiles: async () => 0,
  },
});

mock.module(new URL("../src/ts/utils/storage/memoryStorage.ts", import.meta.url).href, {
  namedExports: {
    getMemories: () => ["remembers things"],
    clearAllMemories: () => ({ ok: true }),
  },
});

mock.module(new URL("../src/ts/services/embeddings.ts", import.meta.url).href, {
  namedExports: { EMBEDDING_MODEL_STORAGE_KEY: "wordmark:embeddingModel" },
});

mock.module(new URL("../src/ts/services/localDocRetrieval.ts", import.meta.url).href, {
  namedExports: { clearLocalDocIndex: () => {} },
});

mock.module(new URL("../src/ts/services/history/list.ts", import.meta.url).href, {
  namedExports: { renderChatHistoryList: () => {} },
});

mock.module(new URL("../src/ts/utils/dom/download.ts", import.meta.url).href, {
  namedExports: { triggerAnchorDownload: () => {} },
});

mock.module(new URL("../src/ts/utils/notifications.ts", import.meta.url).href, {
  namedExports: { showInfo: () => {}, showError: () => {} },
});

const { collectExportData } = await import("../src/ts/components/storageManager.ts");

test("collectExportData includes conversations, memories, chunks, and settings", async () => {
  store.clear();
  store.set("selectedTheme", "midnight");
  store.set("historyTokenBudget", "16384");

  const data = await collectExportData();
  assert.equal(data.app, "wordmark");
  assert.equal(data.conversations.length, 1);
  assert.deepEqual(data.memories, ["remembers things"]);
  assert.equal(data.settings.selectedTheme, "midnight");
  assert.equal(data.settings.historyTokenBudget, "16384");
});

test("collectExportData excludes credentials and embedding vectors", async () => {
  store.clear();
  store.set("wordmark_api_key_openai", "sk-secret");
  store.set("wordmark_tool_api_key_weather", "secret2");
  store.set("wordmark_lmstudio_server_url", "http://localhost:1234/v1");
  store.set("selectedTheme", "midnight");

  const data = await collectExportData();
  const serialized = JSON.stringify(data);
  assert.ok(!serialized.includes("sk-secret"));
  assert.ok(!serialized.includes("secret2"));
  assert.ok(!serialized.includes("wordmark_api_key_openai"));
  assert.ok(!serialized.includes("localhost:1234"));

  assert.equal(data.documentIndex.length, 1);
  assert.deepEqual(data.documentIndex[0].chunks, [{ name: "notes.txt", text: "hello world" }]);
  assert.ok(!serialized.includes("vector"));
});
