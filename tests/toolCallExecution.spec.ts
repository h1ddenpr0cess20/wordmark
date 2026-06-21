import test from "node:test";
import assert from "node:assert/strict";

import { executeToolCalls, type ActionableCall } from "../src/ts/services/api/toolCallExecution.ts";
import type { Message } from "../src/types/api.ts";

function makeCall(name: string, handler: (...args: unknown[]) => unknown): ActionableCall {
  return { name, argsDict: {}, handler } as unknown as ActionableCall;
}

function outputFor(messages: Message[]): unknown {
  const out = messages.find((m) => (m as { type?: string }).type === "function_call_output");
  return (out as { output?: unknown } | undefined)?.output;
}

test("serializes a normal object result to JSON", async () => {
  const messages: Message[] = [];
  await executeToolCalls([makeCall("ok", async () => ({ value: 42 }))], messages, "openai");
  assert.equal(outputFor(messages), JSON.stringify({ value: 42 }));
});

test("passes a string result through verbatim", async () => {
  const messages: Message[] = [];
  await executeToolCalls([makeCall("str", async () => "plain text")], messages, "openai");
  assert.equal(outputFor(messages), "plain text");
});

test("a handler that throws yields an error payload, not a crash", async () => {
  const messages: Message[] = [];
  await executeToolCalls([makeCall("boom", async () => { throw new Error("handler exploded"); })], messages, "openai");
  assert.equal(outputFor(messages), JSON.stringify({ error: "handler exploded" }));
});

test("a non-serializable result does not throw and produces an error payload", async () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  const messages: Message[] = [];
  await assert.doesNotReject(
    executeToolCalls([makeCall("circular", async () => circular)], messages, "openai"),
  );
  const output = outputFor(messages);
  assert.equal(typeof output, "string");
  assert.match(output as string, /"error"/);
});

test("an undefined result becomes an empty string, never undefined", async () => {
  const messages: Message[] = [];
  await executeToolCalls([makeCall("nothing", async () => undefined)], messages, "openai");
  const output = outputFor(messages);
  assert.equal(output, "");
  assert.equal(typeof output, "string");
});
