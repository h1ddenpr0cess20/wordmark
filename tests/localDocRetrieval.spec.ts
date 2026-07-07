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
    chunkText: (t: string) => [t],
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

mock.module(new URL("../src/ts/utils/storage/docChunkStorage.ts", import.meta.url).href, {
  namedExports: {
    saveDocChunks: async (id: string, chunks: unknown[]) => void chunkStore.set(id, [...chunks]),
    loadDocChunks: async (id: string) => chunkStore.get(id) ?? [],
    deleteDocChunks: async (id: string) => void chunkStore.delete(id),
    getCachedFileChunks: async (key: string) => fileCache.get(key) ?? null,
    saveCachedFileChunks: async (key: string, _name: string, chunks: unknown[]) => void fileCache.set(key, [...chunks]),
  },
});

const {
  indexDocuments,
  retrieveRelevantChunks,
  localDocIndexSize,
  clearLocalDocIndex,
  persistLocalDocIndex,
  restoreLocalDocIndex,
} = await import("../src/ts/services/localDocRetrieval.ts");

function fakeFile(name: string, text: string): File {
  return { name, text: async () => text } as unknown as File;
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
  const all = await retrieveRelevantChunks("tell me about cats", 10);
  assert.equal(all.length, 2);
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

test("persistLocalDocIndex with an empty index never wipes stored chunks", async () => {
  clearLocalDocIndex();
  await persistLocalDocIndex("convo-1");
  assert.equal(await restoreLocalDocIndex("convo-1"), 1);
});
