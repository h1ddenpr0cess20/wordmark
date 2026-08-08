import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><body><div id='chat-box'></div></body>", { url: "https://example.com" });
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLImageElement = dom.window.HTMLImageElement;
globalThis.HTMLVideoElement = dom.window.HTMLVideoElement;
globalThis.localStorage = dom.window.localStorage;
globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
  setTimeout(() => cb(0), 0)) as unknown as typeof requestAnimationFrame;

const { state, elements } = await import("../src/ts/init/state.ts");
const { renderConversationMessages } = await import("../src/ts/services/history/render.ts");
const { decorateAssistantMessage } = await import("../src/ts/components/messageActions.ts");

type ConversationRecord = Parameters<typeof renderConversationMessages>[0];

const IMAGE = { filename: "generated-1.png", prompt: "a cat", timestamp: "t", associatedMessageId: "a1", isStoredInDb: true, mediaType: "image", mimeType: "image/png" };
const WITH_IMAGE = "[[MEDIA: generated-1.png]]\n\nHere is your cat.";
const WITHOUT_IMAGE = "No image this time.";

function conversation(assistant: Record<string, unknown>): ConversationRecord {
  return {
    id: "c1",
    name: "conversation",
    messages: [
      { id: "u1", role: "user", content: "draw a cat" },
      { id: "a1", role: "assistant", ...assistant },
    ],
    images: [{ ...IMAGE }],
  } as unknown as ConversationRecord;
}

function loadConversation(convo: ConversationRecord) {
  elements.chatBox = document.getElementById("chat-box");
  elements.chatBox!.innerHTML = "";
  state.messageImages = {};
  state.variantImages = {};
  state.imageDataCache = new Map();
  state.conversationHistory = convo.messages as typeof state.conversationHistory;
  state.generatedImages = convo.images as typeof state.generatedImages;
  renderConversationMessages(convo, new Map([["generated-1.png", "data:image/png;base64,AAAA"]]));
  return document.getElementById("a1")!;
}

test("a replayed conversation attaches a generated image to the message that references it", () => {
  const messageElement = loadConversation(conversation({ content: WITH_IMAGE, hasImages: true }));

  const image = messageElement.querySelector<HTMLImageElement>(".generated-images img");
  assert.ok(image, "the image is rendered inside the message");
  assert.equal(image!.dataset.filename, "generated-1.png");
  assert.deepEqual(Object.keys(state.messageImages), ["a1"]);
});

test("cycling back to an earlier response version restores its images after a reload", () => {
  const messageElement = loadConversation(conversation({
    content: WITH_IMAGE,
    hasImages: true,
    variants: [
      { content: WITH_IMAGE, hasImages: true },
      { content: WITHOUT_IMAGE, hasImages: false },
    ],
    activeVariant: 0,
  }));

  assert.ok(messageElement.querySelector(".generated-images img"), "version 1 renders its image on load");

  decorateAssistantMessage(messageElement, "a1");
  messageElement.querySelector<HTMLButtonElement>(".message-version-next")!.click();
  assert.equal(messageElement.querySelector(".generated-images img"), null, "version 2 has no image");

  messageElement.querySelector<HTMLButtonElement>(".message-version-prev")!.click();
  const restored = messageElement.querySelector<HTMLImageElement>(".generated-images img");
  assert.ok(restored, "version 1's image comes back");
  assert.equal(restored!.dataset.filename, "generated-1.png");
});

test("a version whose media record is gone renders without a broken thumbnail", () => {
  const convo = conversation({
    content: WITH_IMAGE,
    hasImages: true,
    variants: [
      { content: WITH_IMAGE, hasImages: true },
      { content: WITHOUT_IMAGE, hasImages: false },
    ],
    activeVariant: 0,
  });
  const messageElement = loadConversation(convo);

  state.generatedImages = [];
  state.imageDataCache = new Map();
  state.messageImages = {};
  state.variantImages = {};

  decorateAssistantMessage(messageElement, "a1");
  messageElement.querySelector<HTMLButtonElement>(".message-version-next")!.click();
  messageElement.querySelector<HTMLButtonElement>(".message-version-prev")!.click();

  assert.equal(messageElement.querySelector(".generated-images img"), null);
  const hidden = messageElement.querySelector(".hidden-image-placeholder");
  assert.ok(hidden, "the orphaned placeholder stays behind the hiding class");
  assert.equal(hidden!.textContent, "[[MEDIA: generated-1.png]]");
});
