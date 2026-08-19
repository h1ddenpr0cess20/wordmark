import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

/**
 * The whole seam in one test: the real composer calling the real `runTurn`,
 * with only the network and the streaming reader stubbed. Each half is covered
 * on its own elsewhere; this is what proves they are actually connected.
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
/** Runs while the first response is "streaming", standing in for the user typing. */
let whileStreaming: () => void = () => {};
let responseIndex = 0;

/** First response calls a client-side tool; the second answers. */
function nextResponse() {
  responseIndex += 1;
  if (responseIndex === 1) {
    return { output: [{ type: "function_call", name: "note_it", arguments: "{}", call_id: "call_1" }], output_text: "" };
  }
  return { output: [], output_text: "done" };
}

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
  finalizeStreamedResponse: () => {},
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
  responseIndex = 0;
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
  const second = bodies[1].input;
  const texts = second.map(msg => (typeof msg.content === "string" ? msg.content : ""));
  assert.ok(
    texts.includes("actually, keep it short"),
    `the queued message should be in the second request, got: ${JSON.stringify(texts)}`,
  );
  assert.equal(queuedPromptCount(), 0, "and should have left the queue");
});
