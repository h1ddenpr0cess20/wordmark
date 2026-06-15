import test from "node:test";
import assert from "node:assert/strict";

// triggerAnchorDownload touches document, so we install a minimal stub and
// restore it afterward.

import { triggerAnchorDownload } from "../src/ts/utils/download.js";

const g = globalThis as unknown as { document?: unknown };

function setDocument(document: unknown) {
  Object.defineProperty(g, "document", { value: document, configurable: true, writable: true });
}

test("creates a hidden anchor, clicks it, and removes it", () => {
  const saved = Object.getOwnPropertyDescriptor(g, "document");

  const anchor: Record<string, unknown> = {};
  let clicked = false;
  let appended: unknown = null;
  let removed: unknown = null;
  setDocument({
    createElement: () => anchor,
    body: {
      appendChild: (el: unknown) => { appended = el; },
      removeChild: (el: unknown) => { removed = el; },
    },
  });
  anchor.click = () => { clicked = true; };

  triggerAnchorDownload("blob:abc123", "report.pdf");

  assert.equal(anchor.href, "blob:abc123");
  assert.equal(anchor.download, "report.pdf");
  assert.equal(appended, anchor);
  assert.equal(clicked, true);
  assert.equal(removed, anchor);

  if (saved) Object.defineProperty(g, "document", saved);
});
