import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

/**
 * The composer half of mid-turn delivery: what the user sees and what the
 * conversation records when a message typed during a turn is handed to that
 * turn instead of waiting for the next one.
 *
 * The network, persistence, and compaction are replaced with fakes; the real
 * composer, the real queue, and the real transcript rendering run.
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

/** Set by each test: what the fake turn does once it is under way. */
let duringTurn: (collect: () => unknown) => void = () => {};
let saves = 0;

mockModule("../src/ts/services/api.ts", {
  responsesClient: {
    runTurn: async ({ collectInterjections }: { collectInterjections?: () => unknown }) => {
      duringTurn(() => (collectInterjections ? collectInterjections() : []));
      return { response: {}, outputText: "all done", reasoningText: "" };
    },
    isToolEnabled: () => false,
  },
});
mockModule("../src/ts/services/history/persistence.ts", {
  saveCurrentConversation: () => { saves += 1; },
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
const { sendMessage } = await import("../src/ts/components/interaction.ts");

elements.userInput = dom.window.document.getElementById("user-input") as HTMLTextAreaElement;
elements.sendButton = dom.window.document.getElementById("send-button") as HTMLButtonElement;
elements.chatBox = dom.window.document.getElementById("chat-box") as HTMLElement;

function reset() {
  clearPromptQueue();
  state.conversationHistory = [];
  state.pendingUploads = [];
  state.pendingDocuments = [];
  state.isResponsePending = false;
  state.activeAbortController = null;
  elements.chatBox!.innerHTML = "";
  elements.userInput!.value = "";
  saves = 0;
  duringTurn = () => {};
}

/** Runs one turn, typing `queued` into the composer once it is under way. */
async function turnWithInterjection(opening: string, queued: string) {
  reset();
  elements.userInput!.value = opening;
  duringTurn = (collect) => {
    enqueuePrompt(queued);
    collect();
  };
  await sendMessage();
}

test("a message typed mid-turn is handed to the running turn", async () => {
  await turnWithInterjection("start the report", "actually, keep it short");

  assert.equal(queuedPromptCount(), 0, "the entry should leave the queue");
  assert.deepEqual(
    state.conversationHistory.map(msg => msg.content),
    ["start the report", "actually, keep it short"],
    "both messages belong to the conversation, in the order they were said",
  );
  assert.ok(saves > 1, "the delivered message should be persisted, not just rendered");
});

test("the delivered message appears above the answer still being written", async () => {
  await turnWithInterjection("start the report", "actually, keep it short");

  const messages = [...elements.chatBox!.children].map(el => el.className);
  assert.equal(messages.length, 3);
  assert.match(messages[0], /user/);
  assert.match(messages[1], /user/, "the interjection sits above the assistant bubble");
  assert.match(messages[2], /assistant/);
});

test("an interjection carrying attachments waits for a turn of its own", async () => {
  reset();
  elements.userInput!.value = "start the report";
  let stillQueued: string[] = [];
  duringTurn = (collect) => {
    enqueuePrompt("look at this too", [], [{ name: "report.pdf", size: 10, type: "application/pdf" }]);
    collect();
    stillQueued = queuedPrompts().map(entry => entry.text);
    // Left to the post-turn drain in the app; dropped here so this test does
    // not start a second turn behind its own back.
    clearPromptQueue();
  };
  await sendMessage();

  assert.deepEqual(stillQueued, ["look at this too"], "the attachment entry is not delivered mid-turn");
  assert.deepEqual(state.conversationHistory.map(msg => msg.content), ["start the report"]);
});

test("a turn nobody interrupts records only its own message", async () => {
  reset();
  elements.userInput!.value = "start the report";
  duringTurn = (collect) => { collect(); };
  await sendMessage();

  assert.deepEqual(state.conversationHistory.map(msg => msg.content), ["start the report"]);
  assert.equal(elements.chatBox!.children.length, 2);
});

test("a step an autonomous run scheduled is never delivered mid-turn", async () => {
  reset();
  elements.userInput!.value = "start the report";
  let stillQueued: string[] = [];
  duringTurn = (collect) => {
    enqueuePrompt("step two", [], [], { origin: "agent", label: "step two" });
    enqueuePrompt("and keep it short");
    collect();
    stillQueued = queuedPrompts().map(entry => entry.text);
    clearPromptQueue();
  };
  await sendMessage();

  assert.deepEqual(stillQueued, ["step two"], "the run's own step stays queued");
  assert.deepEqual(
    state.conversationHistory.map(msg => msg.content),
    ["start the report", "and keep it short"],
    "only what the user typed joins the running turn",
  );
});
