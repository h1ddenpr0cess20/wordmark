import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><body></body>");
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document;

const { addPlaceholderTtsControls } = await import("../src/ts/services/tts/controls.js");

function addMessage(id: string): HTMLElement {
  const message = document.createElement("div");
  message.id = id;
  const content = document.createElement("div");
  content.className = "message-content";
  message.appendChild(content);
  document.body.appendChild(message);
  return message;
}

test("addPlaceholderTtsControls injects on-demand controls into the message content", () => {
  const message = addMessage("m1");
  addPlaceholderTtsControls("m1", "hello world");

  const controls = message.querySelector(".message-content > .tts-controls");
  assert.ok(controls, "controls are placed inside .message-content");
  assert.equal(controls!.getAttribute("data-original-text"), "hello world");
  assert.equal(controls!.getAttribute("data-audio-generated"), "false");
  assert.ok(controls!.getAttribute("data-voice"), "records the configured voice");
  assert.ok(controls!.querySelector("button.tts-play-pause"), "has a play button");

  const status = controls!.querySelector<HTMLElement>(".tts-status");
  assert.ok(status, "has a status element");
  assert.equal(status!.style.display, "none", "status starts hidden");
});

test("addPlaceholderTtsControls is a no-op when the message id is not in the DOM", () => {
  assert.doesNotThrow(() => addPlaceholderTtsControls("missing", "x"));
  assert.equal(document.querySelectorAll("#missing").length, 0);
});

test("addPlaceholderTtsControls replaces existing controls instead of stacking them", () => {
  const message = addMessage("m2");
  addPlaceholderTtsControls("m2", "first");
  addPlaceholderTtsControls("m2", "second");

  const controls = message.querySelectorAll(".tts-controls");
  assert.equal(controls.length, 1, "only one controls container remains");
  assert.equal(controls[0].getAttribute("data-original-text"), "second", "rebuilt with the latest text");
});
