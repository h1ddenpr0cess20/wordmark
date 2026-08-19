import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

/**
 * A turn can stream in more than one stretch: a tool call splits it, and so
 * does a message the user types mid-answer. Each stretch builds a fresh
 * runtime, so what the last one wrote has to be picked back up — otherwise the
 * answer on screen is erased and rewritten every time the turn resumes.
 */

const dom = new JSDOM("<!DOCTYPE html><body></body>", { url: "https://example.com" });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  localStorage: dom.window.localStorage,
  requestAnimationFrame: (cb: FrameRequestCallback) => { cb(0); return 0; },
  Node: dom.window.Node,
});

const { createStreamingRuntime } = await import("../src/ts/services/streaming/runtime.ts");

/** A loading bubble with the containers the runtime expects. */
function makeBubble() {
  const loadingMessage = dom.window.document.createElement("div");
  loadingMessage.id = "loading-1";
  const contentWrapper = dom.window.document.createElement("div");
  contentWrapper.className = "message-content";
  const mainContentContainer = dom.window.document.createElement("div");
  mainContentContainer.className = "main-response-content";
  contentWrapper.appendChild(mainContentContainer);
  loadingMessage.appendChild(contentWrapper);
  dom.window.document.body.appendChild(loadingMessage);
  return { loadingMessage, contentWrapper, mainContentContainer };
}

/** Streams `text` into the bubble as one stretch of a turn. */
function streamStretch(bubble: ReturnType<typeof makeBubble>, text: string) {
  const runtime = createStreamingRuntime({
    loadingMessage: bubble.loadingMessage,
    contentWrapper: bubble.contentWrapper,
    placeholderElement: null,
    mainContentContainer: bubble.mainContentContainer,
    thinkingId: "thinking-loading-1",
    existingThinkingContainer: null,
  });
  runtime.appendOutputText(text);
  runtime.render();
  return runtime;
}

test("a resumed turn keeps the half-written answer on screen", () => {
  const bubble = makeBubble();
  streamStretch(bubble, "Here is the first half");
  assert.match(bubble.mainContentContainer.innerHTML, /Here is the first half/);

  streamStretch(bubble, "and the rest.");

  assert.match(
    bubble.mainContentContainer.innerHTML,
    /Here is the first half/,
    "what the interrupted stretch wrote is still there",
  );
  assert.match(bubble.mainContentContainer.innerHTML, /and the rest\./);
});

test("a resumed stretch reports only its own text", () => {
  const bubble = makeBubble();
  streamStretch(bubble, "Here is the first half");
  const resumed = streamStretch(bubble, "and the rest.");

  assert.equal(
    resumed.getOutputText(),
    "and the rest.",
    "the caller adds this to what it already has; reporting the earlier "
      + "stretch again would duplicate it in the finished message",
  );
});

test("a fresh bubble starts empty", () => {
  const first = makeBubble();
  streamStretch(first, "An answer to one question");

  const second = makeBubble();
  streamStretch(second, "An answer to another");

  assert.doesNotMatch(
    second.mainContentContainer.innerHTML,
    /one question/,
    "one turn's text never leaks into the next",
  );
});
