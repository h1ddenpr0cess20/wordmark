import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><body></body>");
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document;

const {
  showImageWaitSpinner,
  hideImageWaitSpinner,
  showImageWaitSpinnerById,
  hideImageWaitSpinnerById,
} = await import("../src/ts/components/ui/imageWaitSpinner.js");

function messageWithContent(id = ""): HTMLElement {
  const message = document.createElement("div");
  if (id) {
    message.id = id;
  }
  const content = document.createElement("div");
  content.className = "message-content";
  message.appendChild(content);
  document.body.appendChild(message);
  return message;
}

test("showImageWaitSpinner appends the spinner to the content wrapper", () => {
  const message = messageWithContent();
  showImageWaitSpinner(message);
  const spinner = message.querySelector(".message-content .image-wait-spinner");
  assert.ok(spinner, "spinner should be appended");
  assert.ok(spinner!.classList.contains("loading-animation"), "spinner reuses the loading-dots animation");
  assert.equal(spinner!.querySelectorAll(".loading-dot").length, 3);
  message.remove();
});

test("showImageWaitSpinner is idempotent", () => {
  const message = messageWithContent();
  showImageWaitSpinner(message);
  showImageWaitSpinner(message);
  assert.equal(message.querySelectorAll(".image-wait-spinner").length, 1);
  message.remove();
});

test("showImageWaitSpinner tolerates null and wrapper-less messages", () => {
  assert.doesNotThrow(() => showImageWaitSpinner(null));
  const bare = document.createElement("div");
  showImageWaitSpinner(bare);
  assert.equal(bare.querySelector(".image-wait-spinner"), null);
});

test("hideImageWaitSpinner removes the spinner", () => {
  const message = messageWithContent();
  showImageWaitSpinner(message);
  hideImageWaitSpinner(message);
  assert.equal(message.querySelector(".image-wait-spinner"), null);
  assert.doesNotThrow(() => hideImageWaitSpinner(message));
  assert.doesNotThrow(() => hideImageWaitSpinner(null));
  message.remove();
});

test("byId variants resolve the message through the DOM and tolerate missing ids", () => {
  const message = messageWithContent("loading-msg-1");
  showImageWaitSpinnerById("loading-msg-1");
  assert.ok(message.querySelector(".image-wait-spinner"));
  hideImageWaitSpinnerById("loading-msg-1");
  assert.equal(message.querySelector(".image-wait-spinner"), null);
  assert.doesNotThrow(() => showImageWaitSpinnerById(""));
  assert.doesNotThrow(() => showImageWaitSpinnerById("no-such-id"));
  assert.doesNotThrow(() => hideImageWaitSpinnerById(""));
  message.remove();
});
