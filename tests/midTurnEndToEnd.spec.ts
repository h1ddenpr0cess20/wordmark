import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

/**
 * The whole seam: the real composer calling the real `runTurn`, with only the
 * network and the streaming reader stubbed. Each half is covered on its own
 * elsewhere; this is what proves they are connected — and it is the only place
 * an interruption can be exercised, since it takes both ends to make one.
 *
 * The streaming stub stands in for a reader that was cut short: the real one
 * catches the abort and returns what it had read, which is what makes an
 * interruption free of lost content.
 */

const dom = new JSDOM(
  `<!DOCTYPE html><body>
    <div id="chat-container">
      <div id="chat-box"></div>
      <div class="input-container">
        <div class="input-wrapper">
          <div class="upload-previews"></div>
          <textarea id="user-input"></textarea>
          <button id="send-button"></button>
        </div>
      </div>
      <select id="model-selector"><option value="gpt-4o" selected>gpt-4o</option></select>
    </div>
  </body>`,
  { url: "https://example.com" },
);
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  localStorage: dom.window.localStorage,
  requestAnimationFrame: (cb: FrameRequestCallback) => { cb(0); return 0; },
  Node: dom.window.Node,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
  getComputedStyle: dom.window.getComputedStyle,
});

function mockModule(rel: string, namedExports: Record<string, unknown>): void {
  mock.module(new URL(rel, import.meta.url).href, { namedExports });
}

/** Request bodies seen by the transport, in order. */
const bodies: Array<{ input: Array<{ role?: string; type?: string; content?: unknown }> }> = [];
/** The assistant text each finished turn committed to the transcript. */
const finalized: string[] = [];
/** Runs while the first response is "streaming", standing in for the user typing. */
let whileStreaming: () => void = () => {};
let responseIndex = 0;

/** What each successive response should be; set per test. */
let responses: Array<{ output: unknown[]; output_text: string }> = [];

function nextResponse() {
  const response = responses[responseIndex] ?? { output: [], output_text: "done" };
  responseIndex += 1;
  return response;
}

const toolCall = {
  output: [{ type: "function_call", name: "note_it", arguments: "{}", call_id: "call_1" }],
  output_text: "",
};
const answers = (text: string) => ({ output: [], output_text: text });

mockModule("../src/ts/services/api/requestTransport.ts", {
  buildHeaders: () => ({}),
  executeStreamingRequest: async (body: unknown) => {
    bodies.push(body as { input: [] });
    return {};
  },
  executeNonStreamingRequest: async (body: unknown) => {
    bodies.push(body as { input: [] });
    return nextResponse();
  },
});
mockModule("../src/ts/services/streaming.ts", {
  ensureImagesHaveMessageIds: () => {},
  handleStreamedResponse: async () => {
    // The user types while this response is on the wire.
    whileStreaming();
    const response = nextResponse();
    return { response, outputText: response.output_text, reasoningText: "" };
  },
});
mockModule("../src/ts/services/history/persistence.ts", {
  saveCurrentConversation: () => {},
  renameConversation: () => {},
  startNewConversation: () => {},
  loadConversation: () => {},
});
mockModule("../src/ts/services/history/state.ts", { updateBrowserHistory: () => {} });
mockModule("../src/ts/components/compaction.ts", {
  maybeAutoCompactHistory: async () => {},
  refreshHistoryMeter: () => {},
});
mockModule("../src/ts/services/streaming/messageLifecycle.ts", {
  finalizeStreamedResponse: (_element: unknown, content: { content?: string }) => {
    finalized.push(content?.content ?? "");
  },
  removeLoadingIndicator: () => {},
  updateFinalMessage: () => {},
  updateMessageContent: () => {},
  handleInvalidResponse: () => {},
});

const { config } = await import("../src/config/config.ts");
config.defaultService = "openai";
config.services.openai.apiKey = "test-key";

const { state, elements } = await import("../src/ts/init/state.ts");
const { toolImplementations } = await import("../src/ts/services/toolImplementations.ts");
const { enqueuePrompt, clearPromptQueue, queuedPromptCount } =
  await import("../src/ts/components/promptQueue.ts");
const { sendMessage } = await import("../src/ts/components/interaction.ts");

elements.userInput = dom.window.document.getElementById("user-input") as HTMLTextAreaElement;
elements.sendButton = dom.window.document.getElementById("send-button") as HTMLButtonElement;
elements.chatBox = dom.window.document.getElementById("chat-box") as HTMLElement;
elements.modelSelector = dom.window.document.getElementById("model-selector") as HTMLSelectElement;
toolImplementations.note_it = async () => "noted";

function reset() {
  clearPromptQueue();
  bodies.length = 0;
  finalized.length = 0;
  responseIndex = 0;
  responses = [toolCall, answers("done")];
  state.conversationHistory = [];
  state.pendingUploads = [];
  state.pendingDocuments = [];
  state.isResponsePending = false;
  state.activeAbortController = null;
  state.agentRun = null;
  elements.chatBox!.innerHTML = "";
  elements.userInput!.value = "";
  whileStreaming = () => {};
}

/**
 * Types a message into the composer and sends it, mid-turn. `sendMessage` parks
 * it and asks the running turn to take it — the queue branch runs to completion
 * synchronously, so the interruption lands before this returns.
 */
function typeMidTurn(text: string): void {
  elements.userInput!.value = text;
  void sendMessage();
}

/** The user messages in a captured request body, in order. */
function userTexts(body: { input: Array<{ role?: string; content?: unknown }> }): string[] {
  return body.input
    .filter(msg => msg.role === "user" && typeof msg.content === "string")
    .map(msg => String(msg.content));
}

test("typing during a tool-using turn reaches that turn's next request", async () => {
  reset();
  elements.userInput!.value = "start the report";
  // One-shot: the app drains anything still queued once the turn ends, and a
  // stub that typed on every response would keep that going forever.
  whileStreaming = () => {
    whileStreaming = () => {};
    enqueuePrompt("actually, keep it short");
  };

  await sendMessage();

  assert.equal(bodies.length, 2, "the tool call should have earned a second request");
  assert.ok(
    userTexts(bodies[1]).includes("actually, keep it short"),
    `the queued message should be in the second request, got: ${JSON.stringify(userTexts(bodies[1]))}`,
  );
  assert.equal(queuedPromptCount(), 0, "and should have left the queue");
});

test("typing during a plain answer interrupts it and keeps what was written", async () => {
  reset();
  // No tools: without an interruption this turn would have no second request
  // at all, and the message would have waited for the whole answer.
  responses = [answers("Here is the first half"), answers(" and the rest.")];
  elements.userInput!.value = "write me a summary";
  whileStreaming = () => {
    whileStreaming = () => {};
    typeMidTurn("keep it to three lines");
  };

  await sendMessage();

  assert.equal(bodies.length, 2, "the answer in flight should have been cut short");
  const resumed = bodies[1].input;
  assert.ok(
    resumed.some(msg => msg.role === "assistant" && msg.content === "Here is the first half"),
    "the half-written answer travels with the resumed request",
  );
  const partial = resumed.findIndex(msg => msg.role === "assistant" && msg.content === "Here is the first half");
  const message = resumed.findIndex(msg => msg.role === "user" && msg.content === "keep it to three lines");
  assert.ok(message > partial, "the new message reads as arriving after what had been written");
  assert.deepEqual(
    state.conversationHistory.map(msg => msg.content),
    ["write me a summary", "keep it to three lines"],
    "and the message is recorded in the conversation",
  );
  assert.equal(queuedPromptCount(), 0);
});

test("an interrupted turn finishes as one answer, both stretches kept", async () => {
  reset();
  responses = [answers("Here is the first half"), answers(" and the rest.")];
  elements.userInput!.value = "write me a summary";
  whileStreaming = () => {
    whileStreaming = () => {};
    typeMidTurn("keep it to three lines");
  };

  await sendMessage();

  assert.equal(finalized.length, 1, "one assistant message, not two");
  assert.equal(finalized[0], "Here is the first half\n\n and the rest.");
});

test("stopping still stops, and is not mistaken for an interruption", async () => {
  reset();
  responses = [answers("Half an answer"), answers("should never be requested")];
  elements.userInput!.value = "write me a summary";
  whileStreaming = () => {
    whileStreaming = () => {};
    state.shouldStopGeneration = true;
    state.activeAbortController?.abort();
  };

  await sendMessage();

  assert.equal(bodies.length, 1, "a stop ends the turn rather than resuming it");
  state.shouldStopGeneration = false;
});

test("a queued attachment is not worth interrupting for", async () => {
  reset();
  responses = [answers("A whole answer"), answers("should never be requested")];
  elements.userInput!.value = "write me a summary";
  let queuedDuringTurn = 0;
  whileStreaming = () => {
    whileStreaming = () => {};
    state.pendingDocuments = [{ name: "report.pdf", size: 10, type: "application/pdf" }];
    typeMidTurn("look at this");
    queuedDuringTurn = queuedPromptCount();
    // Left to the post-turn drain in the app; dropped here so this test does
    // not start a second turn behind its own back.
    clearPromptQueue();
  };

  await sendMessage();

  assert.equal(queuedDuringTurn, 1, "the entry waits rather than interrupting");
  assert.equal(bodies.length, 1, "and the turn runs to its end uninterrupted");
});
