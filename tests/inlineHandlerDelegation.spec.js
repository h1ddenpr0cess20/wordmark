import test from "node:test";
import assert from "node:assert/strict";

// The inline-HTML onclick handlers (toggleThinking, about-tab popups) were
// replaced by single delegated click listeners attached to document at module
// load. These tests record those listeners on a stub document and dispatch
// synthetic events to verify the delegation routes correctly.

function fakeClassList(initial = []) {
  const set = new Set(initial);
  return {
    contains: (c) => set.has(c),
    add: (c) => void set.add(c),
    remove: (c) => void set.delete(c),
    toggle: (c) => (set.has(c) ? set.delete(c) : set.add(c)),
  };
}

const clickHandlers = [];
const elementsById = new Map();

globalThis.window = { addEventListener: () => {} };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.document = {
  addEventListener(type, fn) {
    if (type === "click") clickHandlers.push(fn);
  },
  getElementById: (id) => elementsById.get(id) || null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, classList: fakeClassList(), setAttribute() {}, appendChild() {} }),
  body: { appendChild() {}, removeChild() {}, classList: fakeClassList() },
  head: { appendChild() {} },
};

// Importing these modules attaches their delegated click listeners.
await import("../src/js/utils/utils.js");
await import("../src/js/components/aboutPopups.js");

function dispatchClick(event) {
  for (const handler of clickHandlers) handler(event);
}

test("clicking a .thinking-title toggles its thinking container's collapsed class", () => {
  const container = {
    id: "thinking-1",
    classList: fakeClassList(["thinking-container", "collapsed"]),
    querySelector: () => ({ scrollTop: 0 }),
  };
  elementsById.set("thinking-1", container);

  const title = {
    closest: (sel) => (sel === ".thinking-container" ? container : null),
  };
  const event = {
    target: { closest: (sel) => (sel === ".thinking-title" ? title : null) },
    stopPropagation() {},
    preventDefault() {},
  };

  assert.equal(container.classList.contains("collapsed"), true);
  dispatchClick(event);
  assert.equal(container.classList.contains("collapsed"), false, "clicking the title should expand the container");

  dispatchClick(event);
  assert.equal(container.classList.contains("collapsed"), true, "clicking again should collapse it");
});

test("a click that hits no .thinking-title leaves containers untouched", () => {
  const container = {
    id: "thinking-2",
    classList: fakeClassList(["thinking-container", "collapsed"]),
    querySelector: () => ({ scrollTop: 0 }),
  };
  elementsById.set("thinking-2", container);

  dispatchClick({ target: { closest: () => null }, stopPropagation() {}, preventDefault() {} });
  assert.equal(container.classList.contains("collapsed"), true, "unrelated clicks must not toggle anything");
});

test("clicking a [data-popup-action] element triggers the popup handler (preventDefault)", () => {
  let prevented = false;
  const trigger = { getAttribute: (k) => (k === "data-popup-action" ? "show-privacy" : null) };
  const event = {
    target: { closest: (sel) => (sel === "[data-popup-action]" ? trigger : null) },
    preventDefault() { prevented = true; },
  };

  dispatchClick(event);
  assert.equal(prevented, true, "a recognized popup action should preventDefault");
});

test("clicking an element without data-popup-action does not preventDefault", () => {
  let prevented = false;
  const event = {
    target: { closest: () => null },
    preventDefault() { prevented = true; },
  };

  dispatchClick(event);
  assert.equal(prevented, false, "non-popup clicks should not be intercepted");
});
