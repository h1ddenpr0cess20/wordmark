import test from "node:test";
import assert from "node:assert/strict";

import { extractOutputText, extractReasoningText } from "../src/ts/services/api/responseNormalization.ts";
import type { ResponseObject } from "../src/types/api.ts";

const make = (fields: Record<string, unknown>): ResponseObject => fields as ResponseObject;

test("extractOutputText returns output_text when it is a string", () => {
  assert.equal(extractOutputText(make({ output_text: "hello" })), "hello");
});

test("extractOutputText returns empty string when output_text is missing or non-string", () => {
  assert.equal(extractOutputText(make({})), "");
  assert.equal(extractOutputText(make({ output_text: 42 })), "");
});

test("extractReasoningText: string reasoning passes through", () => {
  assert.equal(extractReasoningText(make({ reasoning: "thinking..." })), "thinking...");
});

test("extractReasoningText: array reasoning is flattened (strings, {content}, {text})", () => {
  const r = extractReasoningText(make({
    reasoning: ["a", { content: "b" }, { text: "c" }, { other: "ignored" }],
  }));
  assert.equal(r, "abc");
});

test("extractReasoningText: reasoning.output[].content is joined", () => {
  const r = extractReasoningText(make({
    reasoning: { output: [{ content: "x" }, { content: "y" }, {}] },
  }));
  assert.equal(r, "xy");
});

test("extractReasoningText: reasoning_content string", () => {
  assert.equal(extractReasoningText(make({ reasoning_content: "rc" })), "rc");
});

test("extractReasoningText: reasoning_content array is flattened", () => {
  assert.equal(extractReasoningText(make({ reasoning_content: [{ content: "p" }, "q"] })), "pq");
});

test("extractReasoningText: reasoning.content string (lowest precedence)", () => {
  assert.equal(extractReasoningText(make({ reasoning: { content: "rco" } })), "rco");
});

test("extractReasoningText: returns empty string when no recognized shape", () => {
  assert.equal(extractReasoningText(make({})), "");
  assert.equal(extractReasoningText(make({ reasoning: { foo: "bar" } })), "");
});

test("extractReasoningText: string reasoning wins over reasoning_content", () => {
  assert.equal(
    extractReasoningText(make({ reasoning: "primary", reasoning_content: "secondary" })),
    "primary",
  );
});
