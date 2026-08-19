import test from "node:test";
import assert from "node:assert/strict";

/**
 * Mid-turn delivery at the request-client level, on the free path: at a tool
 * boundary the turn is between requests anyway, so a queued message is appended
 * behind the tool results with nothing interrupted. The interrupting path is
 * covered in midTurnEndToEnd.spec.ts.
 */

globalThis.window = globalThis.window || ({} as Window & typeof globalThis);
globalThis.localStorage = globalThis.localStorage || ({
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
} as unknown as Storage);

const { config } = await import("../src/config/config.ts");
config.defaultService = "openai";
config.services.openai.apiKey = "test-key";
config.services.openai.baseUrl = "https://api.openai.com/v1";

const { toolImplementations } = await import("../src/ts/services/toolImplementations.ts");
const { runTurn } = await import("../src/ts/services/api/requestClient.ts");

interface RequestBody {
  input: Array<{ role?: string; type?: string; content?: unknown; output?: unknown }>;
}

/**
 * Answers with one tool call, then with plain text, capturing each request
 * body so the test can inspect what the second request carried.
 */
function stubTwoStepTurn(bodies: RequestBody[]): void {
  let call = 0;
  globalThis.fetch = (async (_endpoint: unknown, options: RequestInit) => {
    bodies.push(JSON.parse(options.body as string));
    call += 1;
    const output = call === 1
      ? [{ type: "function_call", name: "note_it", arguments: "{}", call_id: "call_1" }]
      : [];
    return { ok: true, json: async () => ({ output_text: call === 1 ? "" : "done", output }) };
  }) as unknown as typeof fetch;
}

/** A channel that never interrupts: it only answers when the turn asks. */
function quietChannel(take: () => Array<{ role: string; content: string }>) {
  return { signal: new AbortController().signal, pending: () => false, take };
}

test("a message queued mid-turn rides along on the next request of the same turn", async () => {
  toolImplementations.note_it = async () => "noted";
  const bodies: RequestBody[] = [];
  stubTwoStepTurn(bodies);

  let handedOver = 0;
  await runTurn({
    inputMessages: [{ role: "user", content: "start the report" }],
    model: "gpt-4o",
    stream: false,
    interjections: quietChannel(() => {
      handedOver += 1;
      return handedOver === 1 ? [{ role: "user", content: "actually, keep it short" }] : [];
    }),
  });

  assert.equal(bodies.length, 2, "the turn should have made two requests");
  const second = bodies[1].input;
  const interjection = second.findIndex(msg => msg.role === "user" && msg.content === "actually, keep it short");
  const toolOutput = second.findIndex(msg => msg.type === "function_call_output");
  assert.ok(interjection > -1, "the queued message should be in the second request");
  assert.ok(toolOutput > -1 && interjection > toolOutput, "it should follow the tool result");
});

test("a turn with nothing queued sends exactly what it would have sent anyway", async () => {
  toolImplementations.note_it = async () => "noted";
  const bodies: RequestBody[] = [];
  stubTwoStepTurn(bodies);

  await runTurn({
    inputMessages: [{ role: "user", content: "start the report" }],
    model: "gpt-4o",
    stream: false,
    interjections: quietChannel(() => []),
  });

  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].input.filter(msg => msg.role === "user").length, 1);
});

test("a turn without the callback is unaffected", async () => {
  toolImplementations.note_it = async () => "noted";
  const bodies: RequestBody[] = [];
  stubTwoStepTurn(bodies);

  await runTurn({
    inputMessages: [{ role: "user", content: "start the report" }],
    model: "gpt-4o",
    stream: false,
  });

  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].input.filter(msg => msg.role === "user").length, 1);
});
