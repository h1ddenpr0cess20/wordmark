import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || ({} as Window & typeof globalThis);

const { collectFunctionCalls } = await import("../src/ts/services/api/messageUtils.js");

// collectFunctionCalls accepts ResponseOutputItem[]; feed loosely-shaped
// fixtures through the parameter type.
const run = (items: unknown[]) =>
  collectFunctionCalls(items as Parameters<typeof collectFunctionCalls>[0]);

test("returns an empty list for no output", () => {
  assert.deepEqual(collectFunctionCalls(), []);
  assert.deepEqual(run([null, undefined]), []);
});

test("collects a top-level function_call with a JSON-string argument", () => {
  const calls = run([
    { type: "function_call", name: "get_weather", arguments: '{"city":"NYC"}', call_id: "c1" },
  ]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "get_weather");
  assert.deepEqual(calls[0].argsDict, { city: "NYC" });
  assert.equal(calls[0].argsJson, '{"city":"NYC"}');
  assert.equal(calls[0].callId, "c1");
});

test("reads name/args from a nested function object and serializes object args", () => {
  const calls = run([
    { type: "tool_call", id: "t9", function: { name: "do_thing", arguments: { a: 1 } } },
  ]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "do_thing");
  assert.deepEqual(calls[0].argsDict, { a: 1 });
  assert.equal(calls[0].argsJson, '{"a":1}');
  assert.equal(calls[0].callId, "t9");
});

test("malformed JSON args yield an empty dict but preserve the raw json string", () => {
  const calls = run([{ type: "function_call", name: "f", arguments: "{not json", id: "x" }]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].argsDict, {});
  assert.equal(calls[0].argsJson, "{not json");
});

test("skips calls without a resolvable name", () => {
  assert.deepEqual(run([{ type: "function_call", arguments: "{}" }]), []);
});

test("collects tool_calls nested in a message", () => {
  const calls = run([
    {
      type: "message",
      tool_calls: [
        { name: "a", arguments: "{}", id: "t1" },
        { tool_name: "b", arguments: '{"x":2}', call_id: "t2" },
      ],
    },
  ]);
  assert.deepEqual(calls.map(c => c.name), ["a", "b"]);
  assert.deepEqual(calls[1].argsDict, { x: 2 });
  assert.equal(calls[1].callId, "t2");
});

test("collects function_call parts from message content and falls back to the message id", () => {
  const calls = run([
    {
      type: "message",
      id: "m1",
      content: [
        { type: "text", text: "ignore me" },
        { type: "function_call", name: "c", arguments: "{}" },
      ],
    },
  ]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "c");
  assert.equal(calls[0].callId, "m1");
});

test("aggregates calls across multiple output items in order", () => {
  const calls = run([
    { type: "function_call", name: "first", arguments: "{}", id: "1" },
    { type: "function_call", name: "second", arguments: "{}", id: "2" },
  ]);
  assert.deepEqual(calls.map(c => c.name), ["first", "second"]);
});
