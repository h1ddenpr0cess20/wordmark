import test from "node:test";
import assert from "node:assert/strict";

import {
  extractMimeFromDataUrl,
  normaliseMimeType,
  coerceImageDataUrl,
} from "../src/ts/services/streaming/imageDataUrl.ts";

const VALID_B64 = "A".repeat(120);

test("extractMimeFromDataUrl reads and lower-cases the MIME", () => {
  assert.equal(extractMimeFromDataUrl("data:image/PNG;base64,AAAA"), "image/png");
  assert.equal(extractMimeFromDataUrl("data:image/jpeg;base64,AAAA"), "image/jpeg");
});

test("extractMimeFromDataUrl returns null for non-data-URLs and non-strings", () => {
  assert.equal(extractMimeFromDataUrl("https://example.com/x.png"), null);
  assert.equal(extractMimeFromDataUrl("data:image/png"), null);
  assert.equal(extractMimeFromDataUrl(42), null);
  assert.equal(extractMimeFromDataUrl(null), null);
});

test("normaliseMimeType trims/lower-cases, else falls back to image/png", () => {
  assert.equal(normaliseMimeType("  Image/WEBP  "), "image/webp");
  assert.equal(normaliseMimeType("image/png"), "image/png");
  assert.equal(normaliseMimeType("   "), "image/png");
  assert.equal(normaliseMimeType(""), "image/png");
  assert.equal(normaliseMimeType(undefined), "image/png");
  assert.equal(normaliseMimeType(123), "image/png");
});

test("coerceImageDataUrl passes through existing data: and http(s) URLs (trimmed)", () => {
  assert.equal(coerceImageDataUrl("  data:image/png;base64,AAAA  ", null), "data:image/png;base64,AAAA");
  assert.equal(coerceImageDataUrl("https://example.com/a.png", null), "https://example.com/a.png");
  assert.equal(coerceImageDataUrl("HTTP://example.com/a.png", null), "HTTP://example.com/a.png");
});

test("coerceImageDataUrl wraps bare base64 using the MIME hint", () => {
  assert.equal(coerceImageDataUrl(VALID_B64, "image/jpeg"), `data:image/jpeg;base64,${VALID_B64}`);
  assert.equal(coerceImageDataUrl(VALID_B64, null), `data:image/png;base64,${VALID_B64}`);
});

test("coerceImageDataUrl strips a leading 'base64' marker before wrapping", () => {
  const body = "A".repeat(114);
  assert.equal(coerceImageDataUrl(`base64${body}`, "image/png"), `data:image/png;base64,${body}`);
});

test("coerceImageDataUrl rejects unusable values", () => {
  assert.equal(coerceImageDataUrl("", null), null);
  assert.equal(coerceImageDataUrl("   ", null), null);
  assert.equal(coerceImageDataUrl("too-short", null), null);
  assert.equal(coerceImageDataUrl(VALID_B64.slice(0, 119), null), null);
  assert.equal(coerceImageDataUrl(`${"A".repeat(118)}!!`, null), null);
  assert.equal(coerceImageDataUrl(12345, null), null);
});
