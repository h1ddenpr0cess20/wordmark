import test, { mock } from "node:test";
import assert from "node:assert/strict";

/**
 * Tests for the local document retrieval index. The embeddings and parser
 * modules are replaced with deterministic fakes via mock.module so indexing and
 * cosine ranking can be verified without a server. Each fake "embedding" is a
 * 2-D vector chosen so a query aligns with exactly one document's chunks.
 */

let embedModel: string | null = "fake-embed";

const VECTORS: Record<string, number[]> = {
  "cats are furry animals that purr": [1, 0],
  "dogs are loyal animals that bark": [0, 1],
  "tell me about cats": [1, 0],
};

function fakeEmbed(text: string): number[] {
  return VECTORS[text.trim()] ?? [0.5, 0.5];
}

mock.module(new URL("../src/ts/services/embeddings.ts", import.meta.url).href, {
  namedExports: {
    resolveEmbeddingModel: () => embedModel,
    chunkText: (t: string) => t.split("|").map(part => part.trim()).filter(Boolean),
    cosineSim: (a: number[], b: number[]) => {
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
      return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
    },
    fetchEmbeddings: async (texts: string[]) => {
      embedCalls.push(texts);
      return texts.map(fakeEmbed);
    },
  },
});

const embedCalls: string[][] = [];

mock.module(new URL("../src/ts/services/parsers/index.ts", import.meta.url).href, {
  namedExports: {
    extractDocumentText: async (file: { text: () => Promise<string> }) => file.text(),
  },
});

const chunkStore = new Map<string, unknown[]>();
const fileCache = new Map<string, unknown[]>();
let delayedLoad: Promise<void> | null = null;

mock.module(new URL("../src/ts/utils/storage/docChunkStorage.ts", import.meta.url).href, {
  namedExports: {
    saveDocChunks: async (id: string, chunks: unknown[]) => void chunkStore.set(id, [...chunks]),
    loadDocChunks: async (id: string) => {
      if (delayedLoad) await delayedLoad;
      return chunkStore.get(id) ?? [];
    },
    deleteDocChunks: async (id: string) => void chunkStore.delete(id),
    getCachedFileChunks: async (key: string) => fileCache.get(key) ?? null,
    saveCachedFileChunks: async (key: string, _name: string, chunks: unknown[]) => {
      if (failCacheWrites) throw new Error("cache unavailable");
      fileCache.set(key, [...chunks]);
    },
  },
});

let failCacheWrites = false;

const {
  indexDocuments,
  retrieveRelevantChunks,
  localDocIndexSize,
  clearLocalDocIndex,
  persistLocalDocIndex,
  restoreLocalDocIndex,
  getIndexedDocumentNames,
  getLocalDocIndexStats,
  isDocumentInventoryQuery,
} = await import("../src/ts/services/localDocRetrieval.ts");

function fakeFile(name: string, text: string, relativePath?: string): File {
  return {
    name,
    text: async () => text,
    ...(relativePath ? { webkitRelativePath: relativePath } : {}),
  } as unknown as File;
}

test("indexDocuments chunks and embeds every readable file", async () => {
  clearLocalDocIndex();
  const result = await indexDocuments([
    fakeFile("cats.txt", "cats are furry animals that purr"),
    fakeFile("dogs.txt", "dogs are loyal animals that bark"),
  ]);
  assert.equal(result.indexed, 2);
  assert.equal(result.chunks, 2);
  assert.deepEqual(result.failed, []);
  assert.equal(localDocIndexSize(), 2);
});

test("retrieveRelevantChunks ranks the semantically closest chunk first", async () => {
  const hits = await retrieveRelevantChunks("tell me about cats", 1);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].name, "cats.txt");
  assert.match(hits[0].text, /cats are furry/);
});

test("retrieveRelevantChunks caps results at topK", async () => {
  const hits = await retrieveRelevantChunks("tell me about cats", 1);
  assert.equal(hits.length, 1);
  const all = await retrieveRelevantChunks("animals", 10);
  assert.equal(all.length, 2);
});

test("indexDocuments preserves relative paths for retrieval and diagnostics", async () => {
  clearLocalDocIndex();
  await indexDocuments([
    fakeFile("config.json", "cats are furry animals that purr", "project/client/config.json"),
    fakeFile("config.json", "dogs are loyal animals that bark", "project/server/config.json"),
  ]);
  assert.deepEqual(getIndexedDocumentNames(), ["project/client/config.json", "project/server/config.json"]);
  assert.deepEqual(getLocalDocIndexStats(), { chunks: 2, documents: 2 });
  const hits = await retrieveRelevantChunks("tell me about cats", 1);
  assert.equal(hits[0].name, "project/client/config.json");
});

test("hybrid retrieval finds an exact source path that dense-only ranking misses", async () => {
  clearLocalDocIndex();
  await indexDocuments([
    fakeFile("readme.md", "cats are furry animals that purr", "project/docs/readme.md"),
    fakeFile("settings.toml", "dogs are loyal animals that bark", "project/config/settings.toml"),
  ]);
  const hits = await retrieveRelevantChunks("open settings.toml", 1);
  assert.equal(hits[0].name, "project/config/settings.toml");
});

test("MMR retrieval diversifies redundant chunks across source files", async () => {
  clearLocalDocIndex();
  await indexDocuments([
    fakeFile("alpha.txt", "alpha one|alpha two|alpha three|alpha four"),
    fakeFile("beta.txt", "beta one|beta two"),
    fakeFile("gamma.txt", "gamma one|gamma two"),
  ]);
  const hits = await retrieveRelevantChunks("overview", 3);
  assert.equal(new Set(hits.map(hit => hit.name)).size, 3);
});

test("a single large document can use the full retrieval result budget", async () => {
  clearLocalDocIndex();
  await indexDocuments([
    fakeFile("manual.txt", "section one|section two|section three|section four|section five|section six"),
  ]);
  const hits = await retrieveRelevantChunks("overview", 6);
  assert.equal(hits.length, 6);
  assert.ok(hits.every(hit => hit.name === "manual.txt"));
});

test("retrieval respects the total character budget", async () => {
  clearLocalDocIndex();
  await indexDocuments([
    fakeFile("alpha.txt", "a".repeat(80)),
    fakeFile("beta.txt", "b".repeat(80)),
  ]);
  const hits = await retrieveRelevantChunks("overview", 10, 100);
  assert.equal(hits.length, 1);
});

test("inventory query detection covers common folder questions", () => {
  assert.equal(isDocumentInventoryQuery("What files can you access?"), true);
  assert.equal(isDocumentInventoryQuery("List every document in this directory"), true);
  assert.equal(isDocumentInventoryQuery("Tell me about cats"), false);
});

test("clearLocalDocIndex empties the index and retrieval returns nothing", async () => {
  clearLocalDocIndex();
  assert.equal(localDocIndexSize(), 0);
  assert.deepEqual(await retrieveRelevantChunks("tell me about cats"), []);
});

test("indexDocuments throws a clear error when no embedding model is available", async () => {
  clearLocalDocIndex();
  embedModel = null;
  await assert.rejects(
    () => indexDocuments([fakeFile("cats.txt", "cats are furry animals that purr")]),
    /No embedding model/,
  );
  embedModel = "fake-embed";
});

test("indexDocuments reports files that yield no text", async () => {
  clearLocalDocIndex();
  const result = await indexDocuments([fakeFile("empty.txt", "   ")]);
  assert.equal(result.chunks, 0);
  assert.deepEqual(result.failed, ["empty.txt"]);
});

test("retrieveRelevantChunks re-embeds stored text when the model changes", async () => {
  clearLocalDocIndex();
  await indexDocuments([fakeFile("cats.txt", "cats are furry animals that purr")]);
  embedModel = "another-model";
  const hits = await retrieveRelevantChunks("tell me about cats");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].name, "cats.txt");
  embedModel = "fake-embed";
});

test("persistLocalDocIndex and restoreLocalDocIndex round-trip the index", async () => {
  clearLocalDocIndex();
  await indexDocuments([fakeFile("cats.txt", "cats are furry animals that purr")]);
  await persistLocalDocIndex("convo-1");

  clearLocalDocIndex();
  assert.equal(localDocIndexSize(), 0);

  const restored = await restoreLocalDocIndex("convo-1");
  assert.equal(restored, 1);
  const hits = await retrieveRelevantChunks("tell me about cats");
  assert.equal(hits[0].name, "cats.txt");
});

test("retrieval waits for an in-flight conversation restore", async () => {
  clearLocalDocIndex();
  await indexDocuments([fakeFile("cats.txt", "cats are furry animals that purr")]);
  await persistLocalDocIndex("slow-conversation");
  clearLocalDocIndex();

  let release!: () => void;
  delayedLoad = new Promise<void>(resolve => { release = resolve; });
  const restoring = restoreLocalDocIndex("slow-conversation");
  let retrievalSettled = false;
  const retrieving = retrieveRelevantChunks("tell me about cats").then(hits => {
    retrievalSettled = true;
    return hits;
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(retrievalSettled, false);

  release();
  await restoring;
  const hits = await retrieving;
  delayedLoad = null;
  assert.equal(hits[0].name, "cats.txt");
});

test("indexDocuments reuses cached embeddings for identical file content", async () => {
  clearLocalDocIndex();
  const content = "penguins waddle across the ice";
  const asFile = (name: string) => ({
    name,
    text: async () => content,
    arrayBuffer: async () => new TextEncoder().encode(content).buffer,
  } as unknown as File);

  const first = await indexDocuments([asFile("penguins.txt")]);
  assert.equal(first.indexed, 1);
  const embedCallsAfterFirst = embedCalls.length;

  clearLocalDocIndex();
  const second = await indexDocuments([asFile("penguins-copy.txt")]);
  assert.equal(second.indexed, 1);
  assert.equal(second.chunks, 1);
  assert.equal(embedCalls.length, embedCallsAfterFirst, "cached file must not be re-embedded");
  assert.equal(localDocIndexSize(), 1);

  const hits = await retrieveRelevantChunks("penguins waddle across the ice");
  assert.equal(hits[0].name, "penguins-copy.txt");
});

test("failed cache writes fall back to inline persistence", async () => {
  clearLocalDocIndex();
  failCacheWrites = true;
  const content = "otters hold hands while they sleep";
  const file = {
    name: "otters.txt",
    text: async () => content,
    arrayBuffer: async () => new TextEncoder().encode(content).buffer,
  } as unknown as File;
  await indexDocuments([file]);
  await persistLocalDocIndex("cache-failure");
  const stored = chunkStore.get("cache-failure") as { cacheKey?: string | null }[];
  assert.equal(stored[0].cacheKey, null);
  failCacheWrites = false;
});

test("persistLocalDocIndex with an empty index never wipes stored chunks", async () => {
  clearLocalDocIndex();
  await persistLocalDocIndex("convo-1");
  assert.equal(await restoreLocalDocIndex("convo-1"), 1);
});
