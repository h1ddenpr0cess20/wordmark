import test, { after, mock } from "node:test";
import assert from "node:assert/strict";

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
mockModule("../src/ts/services/api/toolManager.ts", { getToolCatalog: () => [], getAvailableToolKeys: () => [] });
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

/** Stops the engine and waits until its loop has fully torn down, so a leaked
 * loop from one test can't pollute the next or keep the process alive. */
async function waitForIdle(): Promise<void> {
  partyEngine.stop();
  for (let i = 0; i < 200 && partyEngine.isRunning(); i++) {
    await delay(10);
  }
}

after(waitForIdle);

async function resetEngine(): Promise<void> {
  await waitForIdle();
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

test("typing into a stopped party restarts it instead of falling through to regular chat", async () => {
  await resetEngine();

  const first = partyEngine.start(structuredClone(CONFIG));
  await delay(80);
  partyEngine.stop();
  await first;

  assert.equal(partyEngine.isRunning(), false, "party should be stopped");
  assert.ok(fakeState.activePartyConfig, "the active config must survive a stop so the party can resume");

  const turnsBefore = runTurnCalls.length;
  const historyBefore = (fakeState.conversationHistory as unknown[]).length;

  partyEngine.queueInterjection("what about modal logic?");
  await delay(150);

  assert.equal(
    (fakeState.conversationHistory as unknown[]).length,
    historyBefore + 1,
    "the typed message must be recorded in the transcript",
  );
  assert.ok(
    runTurnCalls.length > turnsBefore,
    "a stopped party must restart and emit a turn, never hand the message to regular chat",
  );

  await waitForIdle();
});

test("typing while paused resumes the loop and weaves in the message", async () => {
  await resetEngine();
  openGate();

  const loop = partyEngine.start(structuredClone(CONFIG));
  await delay(80);
  partyEngine.pause();
  gate?.resolve();
  await delay(800);
  assert.ok(partyEngine.isPaused(), "the engine should be paused before we type");

  const turnsBefore = runTurnCalls.length;
  const historyBefore = (fakeState.conversationHistory as unknown[]).length;

  partyEngine.queueInterjection("jump back in");
  await delay(800);

  assert.equal(partyEngine.isPaused(), false, "sending while paused must resume the loop");
  assert.equal(
    (fakeState.conversationHistory as unknown[]).length,
    historyBefore + 1,
    "the interjection must be recorded once",
  );
  assert.ok(runTurnCalls.length > turnsBefore, "the resumed loop must emit a follow-up turn");

  partyEngine.stop();
  await loop;
});

test("documents in the config are injected into every character's system prompt", async () => {
  await resetEngine();

  const config = structuredClone(CONFIG) as typeof CONFIG & {
    documents?: { name: string; text: string }[];
  };
  config.documents = [{ name: "brief.txt", text: "ship it friday" }];

  const loop = partyEngine.start(config);
  await delay(120);
  partyEngine.stop();
  await loop;

  assert.ok(runTurnCalls.length >= 1, "the opening turn should have run");
  assert.match(
    runTurnCalls[0].systemOverride ?? "",
    /--- brief\.txt ---\nship it friday/,
    "the shared document must reach the character's system prompt",
  );
});

test("addDocuments adds observer files to the active config and later turns", async () => {
  await resetEngine();

  const loop = partyEngine.start(structuredClone(CONFIG));
  await delay(80);
  const turnsBefore = runTurnCalls.length;

  partyEngine.addDocuments([{ name: "spec.md", text: "the secret is 42" }]);

  const config = fakeState.activePartyConfig as { documents?: { name: string }[] };
  assert.equal(config.documents?.[0]?.name, "spec.md", "the document must be stored on the active config");

  partyEngine.queueInterjection("what's the secret?");
  await delay(900);

  partyEngine.stop();
  await loop;

  const newTurn = runTurnCalls.slice(turnsBefore).find((c) => /the secret is 42/.test(c.systemOverride ?? ""));
  assert.ok(newTurn, "documents added mid-party must appear in subsequent turns' system prompts");
});

test("resume cancels a pause requested but not yet applied", async () => {
  await resetEngine();
  openGate();

  const loop = partyEngine.start(structuredClone(CONFIG));
  await delay(80);
  partyEngine.pause();
  partyEngine.resume();
  gate?.resolve();
  await delay(300);

  assert.equal(partyEngine.isPaused(), false, "resume must cancel a pause that had not yet applied");
  assert.ok(partyEngine.isRunning(), "the party keeps running after the cancelled pause");

  partyEngine.stop();
  await loop;
});

test("an observer who names a character hands them the next turn", async () => {
  await resetEngine();
  openGate();

  const config = structuredClone(CONFIG);
  config.characters = [
    { id: "a", name: "Ada", persona: "a curious engineer", allowedTools: [] },
    { id: "b", name: "Boole", persona: "a strict logician", allowedTools: [] },
    { id: "c", name: "Cleo", persona: "a wandering poet", allowedTools: [] },
  ];

  const loop = partyEngine.start(config);
  await delay(80);
  partyEngine.pause();
  gate?.resolve();
  await delay(400);
  assert.ok(partyEngine.isPaused(), "engine should be paused before the interjection");

  const before = runTurnCalls.length;
  partyEngine.queueInterjection("Cleo, what do you make of this?");
  await delay(400);

  const next = runTurnCalls[before];
  assert.ok(next, "the interjection must produce a turn");
  assert.match(
    next.systemOverride ?? "",
    /a wandering poet/,
    "the addressed character (Cleo) must be chosen to speak next, bypassing the speaker-decision",
  );

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
