import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM(
  "<!DOCTYPE html><body><div class='input-wrapper'><div class='upload-previews'></div><textarea id='user-input'></textarea></div></body>",
  { url: "https://example.com" },
);
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.localStorage = dom.window.localStorage;
// The depth-cap refusal surfaces a notification, which animates itself in.
globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => { cb(0); return 0; }) as unknown as typeof requestAnimationFrame;

const { state, elements } = await import("../src/ts/init/state.ts");
const {
  enqueuePrompt,
  queuedPrompts,
  queuedPromptCount,
  removeQueuedPrompt,
  clearPromptQueue,
  restoreNextPrompt,
  takeInterjections,
  MAX_QUEUE_DEPTH,
} = await import("../src/ts/components/promptQueue.ts");

elements.userInput = dom.window.document.getElementById("user-input") as HTMLTextAreaElement;

function reset() {
  clearPromptQueue();
  state.pendingUploads = [];
  state.pendingDocuments = [];
  if (elements.userInput) elements.userInput.value = "";
}

test("queued prompts drain in the order they were added", () => {
  reset();
  enqueuePrompt("first");
  enqueuePrompt("second");

  assert.equal(queuedPromptCount(), 2);
  assert.ok(restoreNextPrompt());
  assert.equal(elements.userInput?.value, "first");
  assert.ok(restoreNextPrompt());
  assert.equal(elements.userInput?.value, "second");
  assert.equal(restoreNextPrompt(), null);
});

test("an empty prompt with no attachments is not queued", () => {
  reset();
  assert.equal(enqueuePrompt("", [], []), null);
  assert.equal(queuedPromptCount(), 0);
});

test("a prompt with only attachments is queued and restores them", () => {
  reset();
  const documents = [{ name: "report.pdf", size: 10, type: "application/pdf" }];
  assert.ok(enqueuePrompt("", [], documents));

  assert.ok(restoreNextPrompt());
  assert.equal(elements.userInput?.value, "");
  assert.deepEqual(state.pendingDocuments, documents);
});

test("queuing snapshots the attachments so later composer edits do not leak in", () => {
  reset();
  const uploads = [{ filename: "a.png" }];
  enqueuePrompt("with image", uploads, []);
  uploads.push({ filename: "b.png" });

  assert.equal(queuedPrompts()[0].uploads.length, 1);
});

test("a queued prompt can be removed by id", () => {
  reset();
  const first = enqueuePrompt("first");
  enqueuePrompt("second");

  removeQueuedPrompt(first!.id);
  assert.equal(queuedPromptCount(), 1);
  assert.equal(queuedPrompts()[0].text, "second");
});

test("queued prompt chips render above the attachment previews and escape their text", () => {
  reset();
  enqueuePrompt("<img src=x onerror=alert(1)>");

  const wrapper = dom.window.document.querySelector(".input-wrapper")!;
  const queue = wrapper.querySelector(".prompt-queue")!;
  assert.ok(queue);
  assert.equal(queue.nextElementSibling?.className, "upload-previews");
  assert.equal(queue.querySelectorAll(".queued-prompt").length, 1);
  assert.match(queue.innerHTML, /&lt;img src=x/);
  assert.equal(queue.querySelector("img"), null);
});

test("clearing the queue empties the rendered chips", () => {
  reset();
  enqueuePrompt("first");
  clearPromptQueue();

  const queue = dom.window.document.querySelector(".prompt-queue")!;
  assert.equal(queue.querySelectorAll(".queued-prompt").length, 0);
});

test("a user message jumps ahead of steps the run already queued", () => {
  reset();
  enqueuePrompt("step one", [], [], { origin: "agent" });
  enqueuePrompt("step two", [], [], { origin: "agent" });
  enqueuePrompt("actually, do this instead");

  assert.equal(restoreNextPrompt()?.text, "actually, do this instead");
  assert.equal(restoreNextPrompt()?.text, "step one");
});

test("agent entries stay put when the drain is not allowed to send them", () => {
  reset();
  enqueuePrompt("step one", [], [], { origin: "agent" });

  assert.equal(restoreNextPrompt(false), null);
  assert.equal(queuedPromptCount("agent"), 1);
});

test("a disallowed drain still sends the user's own messages", () => {
  reset();
  enqueuePrompt("step one", [], [], { origin: "agent" });
  enqueuePrompt("mine");

  assert.equal(restoreNextPrompt(false)?.text, "mine");
  assert.equal(queuedPromptCount("agent"), 1);
});

test("clearing one origin leaves the other origin's entries alone", () => {
  reset();
  enqueuePrompt("mine");
  enqueuePrompt("step one", [], [], { origin: "agent" });
  enqueuePrompt("step two", [], [], { origin: "agent" });

  assert.equal(clearPromptQueue("agent"), 2);
  assert.equal(queuedPromptCount(), 1);
  assert.equal(queuedPrompts()[0].text, "mine");
});

test("clearing an origin with nothing to remove reports zero", () => {
  reset();
  enqueuePrompt("mine");

  assert.equal(clearPromptQueue("agent"), 0);
  assert.equal(queuedPromptCount(), 1);
});

test("the queue refuses entries past its depth cap", () => {
  reset();
  for (let i = 0; i < MAX_QUEUE_DEPTH; i += 1) {
    assert.ok(enqueuePrompt(`step ${i}`, [], [], { origin: "agent" }));
  }

  assert.equal(enqueuePrompt("one too many", [], [], { origin: "agent" }), null);
  assert.equal(queuedPromptCount(), MAX_QUEUE_DEPTH);
});

test("agent chips carry their label, badge, and origin marker", () => {
  reset();
  enqueuePrompt("write the summary section of the report", [], [], {
    origin: "agent",
    label: "write the summary",
    runId: "run-1",
  });

  const chip = dom.window.document.querySelector(".queued-prompt.agent")!;
  assert.equal(chip.getAttribute("data-origin"), "agent");
  assert.match(chip.innerHTML, /write the summary</);
  assert.match(chip.innerHTML, /queued-prompt-badge/);
});

test("chips are numbered in the order the queue will actually drain", () => {
  reset();
  enqueuePrompt("step one", [], [], { origin: "agent", label: "step one" });
  enqueuePrompt("typed later");

  const chips = [...dom.window.document.querySelectorAll(".queued-prompt")];
  assert.deepEqual(
    chips.map(chip => chip.querySelector(".queued-prompt-text")?.textContent),
    ["typed later", "step one"],
    "the user's message is listed first because it sends first",
  );
  assert.equal(chips[0].querySelector(".queued-prompt-index")?.textContent, "1");
});

test("mid-turn delivery takes the user's typed messages, oldest first", () => {
  reset();
  enqueuePrompt("first");
  enqueuePrompt("second");

  assert.deepEqual(takeInterjections().map(entry => entry.text), ["first", "second"]);
  assert.equal(queuedPromptCount(), 0);
  assert.equal(dom.window.document.querySelectorAll(".queued-prompt").length, 0);
});

test("mid-turn delivery leaves attachments and agent steps queued", () => {
  reset();
  enqueuePrompt("just text");
  enqueuePrompt("with a file", [], [{ name: "report.pdf", size: 10, type: "application/pdf" }]);
  enqueuePrompt("step one", [], [], { origin: "agent" });

  assert.deepEqual(takeInterjections().map(entry => entry.text), ["just text"]);
  assert.deepEqual(queuedPrompts().map(entry => entry.text), ["with a file", "step one"]);
});

test("mid-turn delivery with nothing eligible leaves the queue untouched", () => {
  reset();
  enqueuePrompt("step one", [], [], { origin: "agent" });

  assert.deepEqual(takeInterjections(), []);
  assert.equal(queuedPromptCount("agent"), 1);
});
