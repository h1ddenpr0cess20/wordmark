import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || ({ addEventListener() {} } as unknown as Window & typeof globalThis);
globalThis.document = globalThis.document || ({
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  body: { appendChild() {} },
  head: { appendChild() {} },
  createElement: () => ({
    style: {},
    classList: { add() {}, remove() {}, contains: () => false },
    setAttribute() {},
    appendChild() {},
    addEventListener() {},
  }),
} as unknown as Document);

const { extractTextContent } = await import("../src/ts/services/history/render.js");

const cast = <T>(v: unknown): T => v as T;

test("returns string content unchanged", () => {
  assert.equal(extractTextContent("hello world"), "hello world");
});

test("pulls the first text/input_text part out of an array", () => {
  assert.equal(extractTextContent(cast([{ type: "text", text: "hi" }])), "hi");
  assert.equal(extractTextContent(cast([{ type: "input_text", text: "yo" }])), "yo");
});

test("falls back to a part's string content when text is absent", () => {
  assert.equal(extractTextContent(cast([{ type: "input_text", content: "from content" }])), "from content");
});

test("skips non-text parts and returns empty when none match", () => {
  assert.equal(extractTextContent(cast([{ type: "input_image", image_url: "x" }])), "");
  assert.equal(extractTextContent(cast([])), "");
});

test("returns empty string for object or nullish content", () => {
  assert.equal(extractTextContent(cast({ foo: 1 })), "");
  assert.equal(extractTextContent(cast(null)), "");
  assert.equal(extractTextContent(cast(undefined)), "");
});
