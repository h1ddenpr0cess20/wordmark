import test from "node:test";
import assert from "node:assert/strict";

// loadFromUrl pulls in the chat-render/settings import graph, which touches the
// DOM at module load, so install broad window/document/localStorage stubs first.
const store: Record<string, string> = {};
globalThis.localStorage = {
  getItem(key: string) { return key in store ? store[key] : null; },
  setItem(key: string, value: string) { store[key] = String(value); },
  removeItem(key: string) { delete store[key]; },
} as unknown as Storage;
function makeEl() {
  return {
    style: {}, dataset: {},
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    setAttribute() {}, appendChild() {}, removeChild() {}, addEventListener() {},
    insertAdjacentElement() {}, insertAdjacentHTML() {}, querySelector: () => null,
    querySelectorAll: () => [], remove() {}, scrollIntoView() {},
  };
}
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  createElement: () => makeEl(),
  body: { appendChild() {}, removeChild() {} },
  head: { appendChild() {} },
} as unknown as Document;
globalThis.window = {
  location: { search: "" },
  history: { pushState() {}, replaceState() {} },
  addEventListener() {},
  dispatchEvent() { return true; },
} as unknown as Window & typeof globalThis;

const { state } = await import("../src/ts/init/state.js");
const { loadFromUrl } = await import("../src/ts/services/history/state.js");

function setSearch(value: string) {
  (globalThis.window as unknown as { location: { search: string } }).location.search = value;
}

test("loadFromUrl no-ops when there is no chat param", () => {
  state.conversationHistory = [{ role: "user", content: "keep" }];
  setSearch("?foo=bar");
  loadFromUrl();
  assert.equal(state.conversationHistory[0].content, "keep");
});

test("loadFromUrl ignores a non-object ?chat= payload (no state corruption)", () => {
  state.conversationHistory = [{ role: "user", content: "keep" }];
  setSearch("?chat=" + encodeURIComponent("null"));
  loadFromUrl();
  assert.ok(Array.isArray(state.conversationHistory));
  assert.equal(state.conversationHistory[0].content, "keep"); // early return left it intact
});

test("loadFromUrl coerces a non-array messages field to [] instead of a string", () => {
  state.conversationHistory = [{ role: "user", content: "keep" }];
  setSearch("?chat=" + encodeURIComponent(JSON.stringify({ messages: "oops" })));
  loadFromUrl();
  // pre-fix this left conversationHistory === "oops" (a non-array), corrupting downstream code
  assert.ok(Array.isArray(state.conversationHistory), "conversationHistory must stay an array");
});
