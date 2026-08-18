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

const { state, elements } = await import("../src/ts/init/state.ts");
const {
  enqueuePrompt,
  queuedPrompts,
  queuedPromptCount,
  removeQueuedPrompt,
  clearPromptQueue,
  restoreNextPrompt,
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
  assert.equal(restoreNextPrompt(), false);
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
