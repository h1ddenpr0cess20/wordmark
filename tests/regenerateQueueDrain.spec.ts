import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

/**
 * A regeneration ends a turn too, so it owes the prompt queue the same drain
 * the ordinary send path performs. Without it a message typed while a
 * regenerated answer streamed would sit in the queue until something else was
 * sent.
 *
 * Run requires `--experimental-test-module-mocks` (wired in the npm test script).
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

const turns: string[][] = [];

mockModule("../src/ts/services/api.ts", {
  responsesClient: {
    runTurn: async ({ inputMessages }: { inputMessages?: Array<{ content?: string }> }) => {
      turns.push((inputMessages || []).map(msg => String(msg.content)));
      return { response: {}, outputText: "an answer", reasoningText: "" };
    },
    isToolEnabled: () => false,
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

const { state, elements } = await import("../src/ts/init/state.ts");
const { enqueuePrompt, clearPromptQueue, queuedPromptCount, queuedPrompts } =
  await import("../src/ts/components/promptQueue.ts");
const { regenerateMessage } = await import("../src/ts/components/messageActions.ts");

elements.userInput = dom.window.document.getElementById("user-input") as HTMLTextAreaElement;
elements.sendButton = dom.window.document.getElementById("send-button") as HTMLButtonElement;
elements.chatBox = dom.window.document.getElementById("chat-box") as HTMLElement;
elements.modelSelector = dom.window.document.getElementById("model-selector") as HTMLSelectElement;

/** Seeds a one-exchange conversation whose assistant message can be regenerated. */
function seedConversation() {
  clearPromptQueue();
  turns.length = 0;
  state.isResponsePending = false;
  state.activeAbortController = null;
  state.pendingUploads = [];
  state.pendingDocuments = [];
  state.conversationHistory = [
    { role: "user", content: "first question", id: "msg-user" },
    { role: "assistant", content: "first answer", id: "msg-assistant" },
  ];
  elements.chatBox!.innerHTML =
    "<div class='message user' id='msg-user'><div class='message-content'>first question</div></div>"
    + "<div class='message assistant' id='msg-assistant'><div class='message-content'>first answer</div></div>";
}

/** Lets the queued microtasks that follow a settled turn run. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test("a message queued during a regeneration is sent once it finishes", async () => {
  seedConversation();
  enqueuePrompt("and one more thing");

  await regenerateMessage("msg-assistant");
  await settle();
  await settle();

  assert.equal(queuedPromptCount(), 0, "the queued message should not be stranded");
  assert.equal(turns.length, 2, "the regeneration and then the queued message");
  assert.ok(
    turns[1].includes("and one more thing"),
    "the queued message should be sent as its own turn",
  );
});

test("a regeneration with an empty queue sends nothing extra", async () => {
  seedConversation();

  await regenerateMessage("msg-assistant");
  await settle();
  await settle();

  assert.equal(turns.length, 1);
});

test("a step an autonomous run planned is not released by a regeneration", async () => {
  seedConversation();
  // A run mid-flight would otherwise authorize its steps to drain: a
  // regeneration spends none of its budget and never asks it what comes next,
  // so it is not the ending that gets to release one.
  state.agentRun = { id: "run-1", goal: "write the report", status: "running", turnsUsed: 1, maxTurns: 8 };
  enqueuePrompt("step two", [], [], { origin: "agent", label: "step two", runId: "run-1" });

  await regenerateMessage("msg-assistant");
  await settle();
  await settle();

  assert.equal(turns.length, 1, "only the regeneration itself is sent");
  assert.deepEqual(queuedPrompts().map(entry => entry.text), ["step two"], "the step stays queued");
  state.agentRun = null;
  clearPromptQueue();
});
