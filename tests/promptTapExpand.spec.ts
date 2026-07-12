import test from "node:test";
import assert from "node:assert/strict";


type Listener = (event: unknown) => void;

function makeElement(id: string) {
  const listeners: Record<string, Listener[]> = {};
  const classes = new Set<string>();
  return {
    id,
    listeners,
    classList: {
      toggle(c: string) {
        if (classes.has(c)) classes.delete(c);
        else classes.add(c);
      },
      add(c: string) {
        classes.add(c);
      },
      remove(c: string) {
        classes.delete(c);
      },
      contains(c: string) {
        return classes.has(c);
      },
    },
    contains() {
      return false;
    },
    addEventListener(type: string, fn: Listener) {
      (listeners[type] ||= []).push(fn);
    },
    removeEventListener(type: string, fn: Listener) {
      const arr = listeners[type];
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
  };
}

const modelInfo = makeElement("model-info");
const docListeners: Record<string, Listener[]> = {};

Object.defineProperty(globalThis, "navigator", {
  value: { userAgent: "iPhone" },
  configurable: true,
});
globalThis.window = {
  innerWidth: 500,
  addEventListener() {},
  visualViewport: null,
} as unknown as Window & typeof globalThis;
globalThis.document = {
  readyState: "complete",
  getElementById: (id: string) => (id === "model-info" ? modelInfo : null),
  addEventListener(type: string, fn: Listener) {
    (docListeners[type] ||= []).push(fn);
  },
  removeEventListener(type: string, fn: Listener) {
    const arr = docListeners[type];
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  },
} as unknown as Document;

const { setupPromptTapExpand } = await import("../src/ts/utils/dom/mobileHandling.js");

test("setupPromptTapExpand registers exactly one tap handler no matter how many times it runs", () => {
  setupPromptTapExpand();
  setupPromptTapExpand();
  setupPromptTapExpand();

  assert.equal(modelInfo.listeners.click?.length, 1, "container should have a single click listener");
  assert.equal(docListeners.click?.length, 1, "document should have a single outside-tap listener");
});

test("a single tap toggles the expanded state exactly once", () => {
  const handler = modelInfo.listeners.click[0];
  const tap = () => handler({ preventDefault() {}, stopPropagation() {} });

  assert.equal(modelInfo.classList.contains("expanded"), false);
  tap();
  assert.equal(modelInfo.classList.contains("expanded"), true, "first tap should expand");
  tap();
  assert.equal(modelInfo.classList.contains("expanded"), false, "second tap should collapse");
});

test("the outside-tap handler collapses an expanded panel", () => {
  modelInfo.classList.add("expanded");
  const outside = docListeners.click[0];
  outside({ target: {}, preventDefault() {}, stopPropagation() {} });
  assert.equal(modelInfo.classList.contains("expanded"), false);
});
