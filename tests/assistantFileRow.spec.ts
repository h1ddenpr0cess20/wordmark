import test from "node:test";
import assert from "node:assert/strict";

import {
  formatAssistantFileDate,
  buildAssistantFileItemHtml,
} from "../src/ts/components/assistantFileRow.js";

test("formatAssistantFileDate returns Unknown when created_at is absent", () => {
  assert.equal(formatAssistantFileDate(undefined), "Unknown");
  assert.equal(formatAssistantFileDate(0), "Unknown");
});

test("formatAssistantFileDate converts Unix seconds to a locale date", () => {
  // 2021-01-01T00:00:00Z = 1609459200 seconds.
  const expected = new Date(1609459200 * 1000).toLocaleDateString();
  assert.equal(formatAssistantFileDate(1609459200), expected);
});

test("buildAssistantFileItemHtml embeds id, name, and date", () => {
  const html = buildAssistantFileItemHtml({ id: "file-123", filename: "notes.txt", created_at: 1609459200 });
  assert.match(html, /data-file-id="file-123"/);
  assert.match(html, /<strong>notes\.txt<\/strong>/);
  assert.match(html, /<strong>ID:<\/strong> file-123/);
  assert.match(html, new RegExp(`<strong>Created:</strong> ${formatAssistantFileDate(1609459200)}`));
  assert.match(html, /btn-delete-file/);
});

test("buildAssistantFileItemHtml falls back through filename, name, then placeholder", () => {
  assert.match(buildAssistantFileItemHtml({ name: "fromName" }), /<strong>fromName<\/strong>/);
  assert.match(buildAssistantFileItemHtml({}), /<strong>\(no name\)<\/strong>/);
});

test("buildAssistantFileItemHtml HTML-escapes name and id", () => {
  const html = buildAssistantFileItemHtml({ id: "a&b", filename: "<script>x</script>" });
  assert.doesNotMatch(html, /<script>x<\/script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /data-file-id="a&amp;b"/);
});
