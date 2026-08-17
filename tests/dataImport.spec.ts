import test from "node:test";
import assert from "node:assert/strict";

import {
  parseImportBundle,
  describeImport,
  ImportFormatError,
  type ImportSummary,
} from "../src/ts/services/dataImport.ts";

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
