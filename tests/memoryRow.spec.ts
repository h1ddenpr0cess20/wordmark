import test from "node:test";
import assert from "node:assert/strict";

// createMemoryRow builds DOM nodes, so we drive it with a minimal stub document
// that records created elements, their attributes, and click handlers.

interface StubEl {
  tagName: string;
  className: string;
  type: string;
  textContent: string;
  attributes: Record<string, string>;
  children: StubEl[];
  clickHandler?: (e: unknown) => void;
  setAttribute(name: string, value: string): void;
  appendChild(child: StubEl): void;
  addEventListener(type: string, fn: (e: unknown) => void): void;
}

function makeEl(tagName: string): StubEl {
  return {
    tagName,
    className: "",
    type: "",
    textContent: "",
    attributes: {},
    children: [],
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    appendChild(child) {
      this.children.push(child);
    },
    addEventListener(type, fn) {
      if (type === "click") this.clickHandler = fn;
    },
  };
}

(globalThis as unknown as { document: { createElement(tag: string): StubEl } }).document = {
  createElement: (tag: string) => makeEl(tag),
};

const { createMemoryRow } = await import("../src/ts/components/memoryRow.js");

test("createMemoryRow builds a row with text and a delete button", () => {
  const row = createMemoryRow("remember milk", 0, { onDelete: () => {} }) as unknown as StubEl;
  assert.equal(row.className, "memory-row");
  assert.equal(row.children.length, 2);

  const [text, del] = row.children;
  assert.equal(text.className, "memory-text");
  assert.equal(text.textContent, "remember milk");
  assert.equal(del.tagName, "button");
  assert.equal(del.type, "button");
  assert.equal(del.textContent, "Delete");
  assert.equal(del.attributes["aria-label"], "Delete memory 1");
});

test("aria-label uses 1-based index", () => {
  const row = createMemoryRow("x", 4, { onDelete: () => {} }) as unknown as StubEl;
  const del = row.children[1];
  assert.equal(del.attributes["aria-label"], "Delete memory 5");
});

test("delete click suppresses the event and calls onDelete with the index", () => {
  let deleted = -1;
  const row = createMemoryRow("y", 2, { onDelete: (i) => { deleted = i; } }) as unknown as StubEl;
  const del = row.children[1];

  let stopped = false;
  let prevented = false;
  del.clickHandler?.({
    stopPropagation() { stopped = true; },
    preventDefault() { prevented = true; },
  });

  assert.equal(stopped, true);
  assert.equal(prevented, true);
  assert.equal(deleted, 2);
});
