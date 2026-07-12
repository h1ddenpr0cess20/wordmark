import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || ({} as Window & typeof globalThis);

const { escapeHtml } = await import("../src/ts/utils/sanitize.ts");

test("escapeHtml escapes all HTML-special characters", () => {
  assert.equal(
    escapeHtml("<script>alert(\"x\") & 'y'</script>"),
    "&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;",
  );
});

test("escapeHtml escapes quotes so values are safe in attribute contexts", () => {
  const payload = "\" onmouseover=\"alert(1)";
  const escaped = escapeHtml(payload);
  assert.ok(!escaped.includes("\""));
  assert.ok(!escaped.includes("'"));
  assert.equal(escaped, "&quot; onmouseover=&quot;alert(1)");
});

test("escapeHtml escapes ampersands first and does not double-escape input", () => {
  assert.equal(escapeHtml("&lt;"), "&amp;lt;");
  assert.equal(escapeHtml("a & b"), "a &amp; b");
});

test("escapeHtml returns empty string for null and undefined", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("escapeHtml stringifies non-string values", () => {
  assert.equal(escapeHtml(42), "42");
  assert.equal(escapeHtml(false), "false");
  assert.equal(escapeHtml(0), "0");
});

test("escapeHtml leaves plain text untouched", () => {
  assert.equal(escapeHtml("Hello, world! 123 _-+=[]"), "Hello, world! 123 _-+=[]");
});
