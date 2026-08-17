import test, { mock } from "node:test";
import assert from "node:assert/strict";

/**
 * Tests for the export-bundle importer. The storage modules it writes through
 * are replaced with in-memory fakes via mock.module, so the merge rules can be
 * verified without IndexedDB: nothing is ever cleared, stale records never win,
 * and credentials are never applied.
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

interface FakeConversation { id?: string; updated?: string; name?: string }

const conversations = new Map<string, FakeConversation>();
const memories: string[] = [];
const docChunks = new Map<string, { name: string; text: string }[]>();

mock.module(new URL("../src/ts/utils/storage/conversationStorage.ts", import.meta.url).href, {
  namedExports: {
    getAllConversationsFromDb: async () => [...conversations.values()],
    saveConversationToDb: async (convo: FakeConversation) => {
      conversations.set(convo.id as string, convo);
      return convo.id;
    },
  },
});

mock.module(new URL("../src/ts/utils/storage/docChunkStorage.ts", import.meta.url).href, {
  namedExports: {
    getAllDocChunkRecords: async () => [...docChunks.keys()].map((conversationId) => ({ conversationId })),
    saveDocChunks: async (conversationId: string, chunks: { name: string; text: string }[]) => {
      docChunks.set(conversationId, chunks);
    },
  },
});

mock.module(new URL("../src/ts/utils/storage/memoryStorage.ts", import.meta.url).href, {
  namedExports: {
    getMemories: () => [...memories],
    // Mirrors the real addMemory, which trims and truncates to 600 characters.
    addMemory: (text: string) => {
      const trimmed = text.trim().slice(0, 600);
      if (!trimmed) return { ok: false, reason: "empty" };
      memories.push(trimmed);
      return { ok: true, count: memories.length };
    },
  },
});

const {
  parseImportBundle,
  importBundle,
  describeImport,
  ImportFormatError,
} = await import("../src/ts/services/dataImport.ts");
type ImportSummary = Awaited<ReturnType<typeof importBundle>>;

function reset() {
  conversations.clear();
  memories.length = 0;
  docChunks.clear();
  store.clear();
}

function summary(overrides: Partial<ImportSummary> = {}): ImportSummary {
  return {
    conversationsAdded: 0,
    conversationsUpdated: 0,
    conversationsSkipped: 0,
    memoriesAdded: 0,
    documentIndexesAdded: 0,
    settingsApplied: 0,
    ...overrides,
  };
}

test("parseImportBundle rejects text that is not JSON", () => {
  assert.throws(() => parseImportBundle("not json"), ImportFormatError);
});

test("parseImportBundle rejects JSON that is not an object", () => {
  assert.throws(() => parseImportBundle("[1, 2, 3]"), ImportFormatError);
  assert.throws(() => parseImportBundle("\"hello\""), ImportFormatError);
});

test("parseImportBundle rejects an export from another app", () => {
  const raw = JSON.stringify({ app: "somethingelse", conversations: [] });
  assert.throws(() => parseImportBundle(raw), /not Wordmark/);
});

test("parseImportBundle rejects an object with no known sections", () => {
  assert.throws(() => parseImportBundle("{\"unrelated\":1}"), /no Wordmark data/);
});

test("parseImportBundle accepts a bundle carrying any single section", () => {
  assert.deepEqual(parseImportBundle("{\"memories\":[\"a\"]}").memories, ["a"]);
  assert.deepEqual(parseImportBundle("{\"conversations\":[]}").conversations, []);
  assert.deepEqual(parseImportBundle("{\"settings\":{}}").settings, {});
});

test("parseImportBundle accepts a full wordmark export", () => {
  const raw = JSON.stringify({
    app: "wordmark",
    exportedAt: "2026-01-01T00:00:00.000Z",
    conversations: [{ id: "c1", updated: "2026-01-01T00:00:00.000Z" }],
    memories: ["remember this"],
    documentIndex: [{ conversationId: "c1", chunks: [] }],
    settings: { theme: "theme-aurora" },
  });
  const bundle = parseImportBundle(raw);
  assert.equal(bundle.app, "wordmark");
  assert.equal(bundle.conversations?.length, 1);
  assert.equal(bundle.memories?.[0], "remember this");
});

test("importBundle adds unknown conversations and keeps existing ones", async () => {
  reset();
  conversations.set("c1", { id: "c1", name: "Local", updated: "2026-02-01T00:00:00.000Z" });

  const result = await importBundle({
    conversations: [{ id: "c2", name: "From file", updated: "2026-01-01T00:00:00.000Z" }],
  });

  assert.equal(result.conversationsAdded, 1);
  assert.equal(conversations.size, 2);
  assert.equal(conversations.get("c1")?.name, "Local");
});

test("importBundle replaces a conversation only when the file's copy is newer", async () => {
  reset();
  conversations.set("c1", { id: "c1", name: "Local", updated: "2026-02-01T00:00:00.000Z" });

  const stale = await importBundle({
    conversations: [{ id: "c1", name: "Stale", updated: "2026-01-01T00:00:00.000Z" }],
  });
  assert.equal(stale.conversationsSkipped, 1);
  assert.equal(stale.conversationsUpdated, 0);
  assert.equal(conversations.get("c1")?.name, "Local");

  const fresh = await importBundle({
    conversations: [{ id: "c1", name: "Fresh", updated: "2026-03-01T00:00:00.000Z" }],
  });
  assert.equal(fresh.conversationsUpdated, 1);
  assert.equal(conversations.get("c1")?.name, "Fresh");
});

test("importBundle skips conversations with no id", async () => {
  reset();
  const result = await importBundle({ conversations: [{ name: "No id" }] });
  assert.equal(result.conversationsSkipped, 1);
  assert.equal(conversations.size, 0);
});

test("importBundle unions memories without duplicating existing ones", async () => {
  reset();
  memories.push("already here");

  const result = await importBundle({ memories: ["already here", " already here ", "brand new"] });

  assert.equal(result.memoriesAdded, 1);
  assert.deepEqual(memories, ["already here", "brand new"]);
});

test("re-importing a memory longer than the store's limit does not duplicate it", async () => {
  reset();
  const long = "x".repeat(700);

  const first = await importBundle({ memories: [long] });
  assert.equal(first.memoriesAdded, 1);
  assert.equal(memories[0].length, 600);

  const second = await importBundle({ memories: [long] });
  assert.equal(second.memoriesAdded, 0);
  assert.equal(memories.length, 1);
});

test("importBundle indexes documents only for conversations with no index", async () => {
  reset();
  docChunks.set("c1", [{ name: "existing.txt", text: "live index" }]);

  const result = await importBundle({
    documentIndex: [
      { conversationId: "c1", chunks: [{ name: "from-file.txt", text: "trimmed" }] },
      { conversationId: "c2", chunks: [{ name: "from-file.txt", text: "trimmed" }] },
      { conversationId: "c3", chunks: [] },
    ],
  } as Parameters<typeof importBundle>[0]);

  assert.equal(result.documentIndexesAdded, 1);
  assert.equal(docChunks.get("c1")?.[0].name, "existing.txt");
  assert.ok(docChunks.has("c2"));
  assert.ok(!docChunks.has("c3"));
});

test("importBundle leaves settings alone unless the caller opts in", async () => {
  reset();
  store.set("selectedTheme", "midnight");

  const result = await importBundle({ settings: { selectedTheme: "aurora" } });

  assert.equal(result.settingsApplied, 0);
  assert.equal(store.get("selectedTheme"), "midnight");
});

test("importBundle applies settings on opt-in but never credentials", async () => {
  reset();
  store.set("wordmark_api_key_openai", "sk-mine");

  const result = await importBundle({
    settings: {
      selectedTheme: "aurora",
      wordmark_api_key_openai: "sk-attacker",
      wordmark_tool_api_key_weather: "attacker",
      wordmark_lmstudio_server_url: "http://evil.example/v1",
    },
  }, { applySettings: true });

  assert.equal(result.settingsApplied, 1);
  assert.equal(store.get("selectedTheme"), "aurora");
  assert.equal(store.get("wordmark_api_key_openai"), "sk-mine");
  assert.equal(store.get("wordmark_tool_api_key_weather"), undefined);
  assert.equal(store.get("wordmark_lmstudio_server_url"), undefined);
});

test("describeImport reports an all-new merge", () => {
  const text = describeImport(summary({ conversationsAdded: 3, memoriesAdded: 1 }));
  assert.match(text, /3 conversations added/);
  assert.match(text, /1 memory/);
});

test("describeImport singularizes one conversation", () => {
  assert.match(describeImport(summary({ conversationsAdded: 1 })), /1 conversation added/);
});

test("describeImport notes how many were already current", () => {
  const text = describeImport(summary({ conversationsAdded: 1, conversationsSkipped: 4 }));
  assert.match(text, /4 already current/);
});

test("describeImport reports a re-import of the same file as a no-op", () => {
  const text = describeImport(summary({ conversationsSkipped: 7 }));
  assert.match(text, /Nothing new to import/);
});

test("describeImport reports an empty bundle", () => {
  assert.match(describeImport(summary()), /Nothing to import/);
});
