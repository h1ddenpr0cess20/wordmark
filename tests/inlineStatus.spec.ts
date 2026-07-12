import test from "node:test";
import assert from "node:assert/strict";


import { showInlineStatus } from "../src/ts/utils/inlineStatus.js";

interface StubEl {
  className: string;
  textContent: string;
  inserted: StubEl[];
  removed: boolean;
  insertAdjacentElement(position: string, el: StubEl): void;
  remove(): void;
}

function makeEl(): StubEl {
  return {
    className: "",
    textContent: "",
    inserted: [],
    removed: false,
    insertAdjacentElement(position: string, el: StubEl) {
      assert.equal(position, "afterend");
      this.inserted.push(el);
    },
    remove() {
      this.removed = true;
    },
  };
}

type DocStub = {
  created: StubEl[];
  byClass: Record<string, StubEl>;
  bySelector: Record<string, StubEl>;
  querySelector(sel: string): StubEl | null;
  createElement(): StubEl;
};

function installDoc(bySelector: Record<string, StubEl>, byClass: Record<string, StubEl> = {}): DocStub {
  const doc: DocStub = {
    created: [],
    byClass,
    bySelector,
    querySelector(sel: string) {
      if (sel.startsWith(".") && this.byClass[sel.slice(1)]) {
        return this.byClass[sel.slice(1)];
      }
      return this.bySelector[sel] || null;
    },
    createElement() {
      const el = makeEl();
      this.created.push(el);
      return el;
    },
  };
  (globalThis as unknown as { document: DocStub }).document = doc;
  return doc;
}

function captureTimeouts(): Array<() => void> {
  const calls: Array<() => void> = [];
  (globalThis as unknown as { setTimeout: (fn: () => void) => void }).setTimeout = (fn: () => void) => {
    calls.push(fn);
  };
  return calls;
}

test("inserts a status note after the anchor with class and text", () => {
  const anchor = makeEl();
  const doc = installDoc({ ".api-keys-action-buttons": anchor });
  captureTimeouts();

  showInlineStatus("api-keys-status", ".api-keys-action-buttons", "Saved!", "success");

  assert.equal(doc.created.length, 1);
  const note = doc.created[0];
  assert.equal(note.className, "api-keys-status success");
  assert.equal(note.textContent, "Saved!");
  assert.deepEqual(anchor.inserted, [note]);
});

test("removes any existing note of the same class first", () => {
  const anchor = makeEl();
  const existing = makeEl();
  installDoc({ ".x-status": anchor }, { "x-status": existing });
  captureTimeouts();

  showInlineStatus("x-status", ".x-status", "again", "error");

  assert.equal(existing.removed, true);
});

test("falls back through an ordered list of anchor selectors", () => {
  const second = makeEl();
  const doc = installDoc({ ".second": second });
  captureTimeouts();

  showInlineStatus("service-status", [".first", ".second"], "hi", "success");

  const note = doc.created[0];
  assert.deepEqual(second.inserted, [note]);
});

test("auto-removes the note when the timeout fires", () => {
  const anchor = makeEl();
  const doc = installDoc({ ".a": anchor });
  const timeouts = captureTimeouts();

  showInlineStatus("a", ".a", "bye", "success");
  const note = doc.created[0];
  assert.equal(note.removed, false);
  assert.equal(timeouts.length, 1);
  timeouts[0]();
  assert.equal(note.removed, true);
});

test("shows nothing when no anchor matches", () => {
  const doc = installDoc({});
  captureTimeouts();

  showInlineStatus("a", [".none", ".missing"], "x", "success");

  assert.equal(doc.created.length, 1);
  assert.equal(doc.created[0].inserted.length, 0);
});
