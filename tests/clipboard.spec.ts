import test from "node:test";
import assert from "node:assert/strict";


import { copyTextToClipboard } from "../src/ts/utils/dom/clipboard.js";

const g = globalThis as unknown as {
  navigator?: unknown;
  document?: unknown;
};

function setGlobals(navigator: unknown, document: unknown) {
  Object.defineProperty(g, "navigator", { value: navigator, configurable: true, writable: true });
  Object.defineProperty(g, "document", { value: document, configurable: true, writable: true });
}

function saveGlobals() {
  return {
    navigator: Object.getOwnPropertyDescriptor(g, "navigator"),
    document: Object.getOwnPropertyDescriptor(g, "document"),
  };
}

function restore(saved: ReturnType<typeof saveGlobals>) {
  if (saved.navigator) Object.defineProperty(g, "navigator", saved.navigator);
  if (saved.document) Object.defineProperty(g, "document", saved.document);
}

test("uses the Clipboard API and resolves true on success", async () => {
  const saved = saveGlobals();
  let written: string | undefined;
  setGlobals({ clipboard: { writeText: (t: string) => { written = t; return Promise.resolve(); } } }, g.document);

  const ok = await copyTextToClipboard("hello");
  assert.equal(ok, true);
  assert.equal(written, "hello");
  restore(saved);
});

test("resolves false when the Clipboard API rejects", async () => {
  const saved = saveGlobals();
  setGlobals({ clipboard: { writeText: () => Promise.reject(new Error("denied")) } }, g.document);

  const ok = await copyTextToClipboard("x");
  assert.equal(ok, false);
  restore(saved);
});

test("falls back to execCommand when Clipboard API is absent", async () => {
  const saved = saveGlobals();
  const appended: Array<{ value: string }> = [];
  let removed = false;
  let execArg: string | undefined;
  setGlobals({}, {
    createElement: () => ({ value: "", style: {}, focus() {}, select() {} }),
    body: {
      appendChild: (el: { value: string }) => { appended.push(el); },
      removeChild: () => { removed = true; },
    },
    execCommand: (cmd: string) => { execArg = cmd; return true; },
  });

  const ok = await copyTextToClipboard("fallback text");
  assert.equal(ok, true);
  assert.equal(execArg, "copy");
  assert.equal(appended[0].value, "fallback text");
  assert.equal(removed, true);
  restore(saved);
});

test("resolves false when the execCommand fallback throws", async () => {
  const saved = saveGlobals();
  setGlobals({}, {
    createElement: () => { throw new Error("no DOM"); },
    body: { appendChild() {}, removeChild() {} },
    execCommand: () => true,
  });

  const ok = await copyTextToClipboard("y");
  assert.equal(ok, false);
  restore(saved);
});
