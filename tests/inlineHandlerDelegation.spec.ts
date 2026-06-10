import test from "node:test";
import assert from "node:assert/strict";

// The inline-HTML onclick handlers (toggleThinking, about-tab popups) were
// replaced by single delegated click listeners attached to document at module
// load. These tests record those listeners on a stub document and dispatch
// synthetic events to verify the delegation routes correctly.

function fakeClassList(initial: string[] = []) {
  const set = new Set<string>(initial);
  return {
    contains: (c: string) => set.has(c),
    add: (c: string) => void set.add(c),
    remove: (c: string) => void set.delete(c),
    toggle: (c: string) => (set.has(c) ? set.delete(c) : set.add(c)),
  };
}

type ClickHandler = (event: unknown) => void;
const clickHandlers: ClickHandler[] = [];
const elementsById = new Map<string, unknown>();

globalThis.window = { addEventListener: () => {} } as unknown as Window & typeof globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {} } as unknown as Storage;
globalThis.document = {
  addEventListener(type: string, fn: ClickHandler) {
    if (type === "click") clickHandlers.push(fn);
  },
  getElementById: (id: string) => elementsById.get(id) || null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, classList: fakeClassList(), setAttribute() {}, appendChild() {} }),
  body: { appendChild() {}, removeChild() {}, classList: fakeClassList() },
  head: { appendChild() {} },
} as unknown as Document;

// Importing these modules attaches their delegated click listeners.
await import("../src/ts/utils/utils.ts");
await import("../src/ts/components/aboutPopups.ts");

function dispatchClick(event: unknown) {
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
    closest: (sel: string) => (sel === ".thinking-container" ? container : null),
  };
  const event = {
    target: { closest: (sel: string) => (sel === ".thinking-title" ? title : null) },
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
  const trigger = { getAttribute: (k: string) => (k === "data-popup-action" ? "show-privacy" : null) };
  const event = {
    target: { closest: (sel: string) => (sel === "[data-popup-action]" ? trigger : null) },
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
