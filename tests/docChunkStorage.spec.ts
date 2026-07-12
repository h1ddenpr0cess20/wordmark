import { test } from "node:test";
import assert from "node:assert/strict";

const { buildDocChunkRecord } = await import("../src/ts/utils/storage/docChunkStorage.ts");

function chunk(name: string, text: string, cacheKey: string | null) {
  return { name, text, vector: [1, 0], model: "embed-model", cacheKey };
}

test("buildDocChunkRecord stores hashed files as cache references without chunk copies", () => {
  const record = buildDocChunkRecord("c1", [
    chunk("book.pdf", "chapter one", "hash1:embed-model"),
    chunk("book.pdf", "chapter two", "hash1:embed-model"),
    chunk("notes.txt", "some notes", "hash2:embed-model"),
  ]);

  assert.equal(record.conversationId, "c1");
  assert.deepEqual(record.files, [
    { cacheKey: "hash1:embed-model", name: "book.pdf", chunks: null },
    { cacheKey: "hash2:embed-model", name: "notes.txt", chunks: null },
  ]);
  assert.ok(!JSON.stringify(record).includes("chapter one"));
});

test("buildDocChunkRecord inlines chunks for unhashable files", () => {
  const record = buildDocChunkRecord("c1", [
    chunk("a.txt", "first", null),
    chunk("a.txt", "second", null),
    chunk("b.txt", "other", null),
    chunk("c.pdf", "cached", "hash3:embed-model"),
  ]);

  assert.equal(record.files.length, 3);
  assert.equal(record.files[0].cacheKey, null);
  assert.equal(record.files[0].chunks?.length, 2);
  assert.equal(record.files[1].name, "b.txt");
  assert.deepEqual(record.files[2], { cacheKey: "hash3:embed-model", name: "c.pdf", chunks: null });
});

test("buildDocChunkRecord preserves identical content at different source paths", () => {
  const record = buildDocChunkRecord("c1", [
    chunk("project/a/config.json", "same bytes", "samehash:embed-model"),
    chunk("project/b/config.json", "same bytes", "samehash:embed-model"),
  ]);

  assert.deepEqual(record.files, [
    { cacheKey: "samehash:embed-model", name: "project/a/config.json", chunks: null },
    { cacheKey: "samehash:embed-model", name: "project/b/config.json", chunks: null },
  ]);
});
