import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Integration tests for the Party engine's control flow. The engine has heavy
 * DOM/network dependencies, so each is replaced with a light fake via
 * `mock.module`; only the real engine + pure prompt builders run.
 *
 * Run requires `--experimental-test-module-mocks` (wired in the npm test script).
 */

interface RunTurnCall {
  systemOverride?: string;
  loadingId?: string;
}

const runTurnCalls: RunTurnCall[] = [];
let finalizeCount = 0;
let removeCount = 0;
let throwAbort = false;
let streamedDomText = "";
let gate: { promise: Promise<void>; resolve: () => void } | null = null;

function openGate(): void {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  gate = { promise, resolve };
}

async function fakeRunTurn(opts: RunTurnCall): Promise<unknown> {
  runTurnCalls.push(opts);
  if (gate) {
    await gate.promise;
  }
  if (throwAbort) {
    const error = new Error("Request aborted");
    error.name = "AbortError";
    throw error;
  }
  return { response: {}, outputText: "hello there", reasoningText: "" };
}

/** A generic DOM node that absorbs every call the engine makes on it. */
function makeNode(): Record<string, unknown> {
  const node: Record<string, unknown> = {
    id: "",
    className: "",
    textContent: "",
    innerHTML: "",
    type: "",
    disabled: false,
    title: "",
    style: {},
    dataset: {},
    firstChild: null,
    children: [],
    classList: { add() {}, remove() {}, contains() { return false; } },
    querySelector(sel: string) {
      if (sel === ".main-response-content") {
        return { textContent: streamedDomText };
      }
      return null;
    },
    querySelectorAll() { return []; },
    appendChild() {},
    append() {},
    insertBefore() {},
    removeChild() {},
    remove() {},
    setAttribute() {},
    addEventListener() {},
  };
  return node;
}

const fakeState: Record<string, unknown> = {
  partyMode: false,
  activePartyConfig: null,
  conversationHistory: [] as unknown[],
};

function mockModule(rel: string, namedExports: Record<string, unknown>): void {
  mock.module(new URL(rel, import.meta.url).href, { namedExports });
}

mockModule("../src/ts/init/state.ts", { state: fakeState, elements: { chatBox: makeNode() } });
mockModule("../src/ts/components/ui/chatMessages.ts", { appendMessage: () => makeNode() });
mockModule("../src/ts/services/streaming/messageLifecycle.ts", {
  finalizeStreamedResponse: () => { finalizeCount += 1; },
  removeLoadingIndicator: () => { removeCount += 1; },
});
mockModule("../src/ts/services/history/persistence.ts", { saveCurrentConversation: () => {} });
mockModule("../src/ts/components/messages.ts", { generateMessageId: () => `id-${Math.random().toString(36).slice(2)}` });
mockModule("../src/ts/utils/utils.ts", { sanitizeInput: (s: string) => s });
mockModule("../src/ts/utils/sanitize.ts", { escapeHtml: (s: string) => s });
mockModule("../src/ts/utils/notifications.ts", { showError: () => {} });
mockModule("../src/ts/services/api/requestClient.ts", { runTurn: fakeRunTurn, buildRequestBody: () => ({}) });
mockModule("../src/ts/services/api/requestTransport.ts", { executeNonStreamingRequest: async () => ({}) });
mockModule("../src/ts/services/api/responseNormalization.ts", { extractOutputText: () => "" });
mockModule("../src/ts/services/api/clientConfig.ts", { getActiveModel: () => "fake-model" });

(globalThis as unknown as { document: unknown }).document = {
  getElementById: () => makeNode(),
  createElement: () => makeNode(),
};

const { partyEngine } = await import("../src/ts/services/party/partyEngine.ts");

const CONFIG = {
  characters: [
    { id: "a", name: "Ada", persona: "a curious engineer", allowedTools: [] },
    { id: "b", name: "Boole", persona: "a logician", allowedTools: [] },
  ],
  scenario: { topic: "logic", setting: "a study", mood: "friendly", conversationType: "conversation" },
  userName: "Observer",
};

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function resetEngine(): Promise<void> {
  partyEngine.stop();
  await delay(50);
  runTurnCalls.length = 0;
  finalizeCount = 0;
  removeCount = 0;
  throwAbort = false;
  streamedDomText = "";
  gate = null;
  fakeState.partyMode = false;
  fakeState.activePartyConfig = null;
  (fakeState.conversationHistory as unknown[]).length = 0;
}

test("restarting a party immediately after stop emits a fresh turn", async () => {
  await resetEngine();

  const first = partyEngine.start(structuredClone(CONFIG));
  await delay(80);
  assert.ok(runTurnCalls.length >= 1, "first party should produce an opening turn");

  const before = runTurnCalls.length;

  // Mirror startParty(): stop, then immediately start again without awaiting
  // the previous loop's teardown.
  partyEngine.stop();
  const second = partyEngine.start(structuredClone(CONFIG));

  await delay(900);
  const after = runTurnCalls.length;

  partyEngine.stop();
  await Promise.all([first, second]);

  assert.ok(
    after > before,
    `restart after stop must emit a new opening turn (before=${before}, after=${after})`,
  );
});

test("a pause requested mid-turn still records the in-progress turn", async () => {
  await resetEngine();
  openGate();

  const loop = partyEngine.start(structuredClone(CONFIG));
  await delay(80);
  assert.equal(runTurnCalls.length, 1, "the opening turn should be in flight");
  assert.equal(finalizeCount, 0, "turn is still streaming, not finalized yet");

  partyEngine.pause();
  gate?.resolve();
  await delay(800);

  assert.equal(finalizeCount, 1, "the turn that was generating when pause was clicked must be saved");
  assert.ok(partyEngine.isPaused(), "the engine should be paused after the in-flight turn completes");

  partyEngine.stop();
  await loop;
});

test("an aborted turn that already produced tokens is recorded, never discarded", async () => {
  await resetEngine();
  // Simulate the abort path where runTurn throws AbortError but tokens had
  // already streamed into the bubble.
  throwAbort = true;
  streamedDomText = "tokens that cost real money";

  const loop = partyEngine.start(structuredClone(CONFIG));
  await delay(120);
  assert.ok(runTurnCalls.length >= 1, "the opening turn should have been attempted");

  partyEngine.stop();
  await loop;

  assert.equal(removeCount, 0, "an aborted turn with generated text must not be removed/discarded");
  assert.equal(finalizeCount, 1, "the already-generated tokens must be finalized and recorded");
});
