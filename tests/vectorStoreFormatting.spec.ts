import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveFriendlyVectorStoreName,
  buildFriendlyVectorStoreName,
  formatBytes,
} from "../src/ts/components/vectorStore/vectorStoreFormatting.js";

test("deriveFriendlyVectorStoreName falls back to 'Document Set' for non-records", () => {
  assert.equal(deriveFriendlyVectorStoreName(null), "Document Set");
  assert.equal(deriveFriendlyVectorStoreName(undefined), "Document Set");
  assert.equal(deriveFriendlyVectorStoreName("nope"), "Document Set");
  assert.equal(deriveFriendlyVectorStoreName(42), "Document Set");
});

test("deriveFriendlyVectorStoreName expands a Chat-<timestamp> name to a localized date", () => {
  const ts = 1700000000000;
  const expected = `Chat ${new Date(ts).toLocaleString()}`;
  assert.equal(deriveFriendlyVectorStoreName({ name: `Chat-${ts}` }), expected);
});

test("deriveFriendlyVectorStoreName title-cases and collapses separators in a label", () => {
  assert.equal(deriveFriendlyVectorStoreName({ name: "my_research-notes" }), "My Research Notes");
  assert.equal(deriveFriendlyVectorStoreName({ name: "  multiple   spaces " }), "Multiple Spaces");
});

test("deriveFriendlyVectorStoreName uses created_at date when the name is blank", () => {
  const createdAt = 1609459200; // 2021-01-01T00:00:00Z, in seconds
  const expected = `Document Set ${new Date(createdAt * 1000).toLocaleDateString()}`;
  assert.equal(deriveFriendlyVectorStoreName({ name: "   ", created_at: createdAt }), expected);
});

test("deriveFriendlyVectorStoreName uses the last-6 id suffix when name and created_at are absent", () => {
  assert.equal(deriveFriendlyVectorStoreName({ id: "vs_abc123def" }), "Document Set 123DEF");
});

test("deriveFriendlyVectorStoreName returns plain 'Document Set' for an empty record", () => {
  assert.equal(deriveFriendlyVectorStoreName({}), "Document Set");
});

test("buildFriendlyVectorStoreName prefers a trimmed metadata friendlyName", () => {
  const result = buildFriendlyVectorStoreName({ name: "raw" }, { friendlyName: "  My Store  " }, 0);
  assert.equal(result, "My Store");
});

test("buildFriendlyVectorStoreName derives from metadata name when no friendlyName", () => {
  const result = buildFriendlyVectorStoreName({ id: "vs_x" }, { name: "quarterly_report" }, 0);
  assert.equal(result, "Quarterly Report");
});

test("buildFriendlyVectorStoreName uses a derived non-generic store name", () => {
  const result = buildFriendlyVectorStoreName({ name: "team_docs" }, null, 3);
  assert.equal(result, "Team Docs");
});

test("buildFriendlyVectorStoreName returns the derived id-suffixed name for an id-only store", () => {
  const result = buildFriendlyVectorStoreName({ id: "vs_zzz999" }, {}, 2);
  assert.equal(result, "Document Set ZZZ999");
});

test("buildFriendlyVectorStoreName falls back to a bare index label for a record with no usable fields", () => {
  assert.equal(buildFriendlyVectorStoreName({}, null, 4), "Document Set 5");
  assert.equal(buildFriendlyVectorStoreName(null, null, 0), "Document Set 1");
});

test("formatBytes renders zero, sub-KB, and fractional tiers", () => {
  assert.equal(formatBytes(0), "0 Bytes");
  assert.equal(formatBytes(1023), "1023 Bytes");
  assert.equal(formatBytes(1024), "1 KB");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(1024 * 1024), "1 MB");
  assert.equal(formatBytes(1.5 * 1024 * 1024 * 1024), "1.5 GB");
});

test("formatBytes rounds to two decimal places", () => {
  assert.equal(formatBytes(1234567), "1.18 MB");
});
