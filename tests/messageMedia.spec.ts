import test from "node:test";
import assert from "node:assert/strict";

import { state } from "../src/ts/init/state.ts";
import { extractMediaFilenames, buildMessageMediaHtml } from "../src/ts/services/messageMedia.ts";
import type { GeneratedImage } from "../src/types/common.ts";

function reset(images: unknown[] = []) {
  state.generatedImages = images as GeneratedImage[];
  state.imageDataCache = new Map();
}

test("extractMediaFilenames reads both placeholder forms in order, without duplicates", () => {
  const content = "[[MEDIA: a.png]]\n[[IMAGE:b.png]]\ntext [[MEDIA: a.png]] more";
  assert.deepEqual(extractMediaFilenames(content), ["a.png", "b.png"]);
});

test("extractMediaFilenames returns nothing for empty or non-string content", () => {
  assert.deepEqual(extractMediaFilenames(""), []);
  assert.deepEqual(extractMediaFilenames(undefined as unknown as string), []);
  assert.deepEqual(extractMediaFilenames("no placeholders here"), []);
});

test("buildMessageMediaHtml rebuilds thumbnails from the records' own urls", () => {
  reset([
    { filename: "a.png", url: "data:image/png;base64,AAA", prompt: "a cat", mediaType: "image" },
    { filename: "b.png", url: "data:image/png;base64,BBB", prompt: "", mediaType: "image" },
  ]);

  const html = buildMessageMediaHtml("[[MEDIA: b.png]]\n[[MEDIA: a.png]]\n\nhere you go");
  assert.equal(html.length, 2);
  assert.match(html[0], /data-filename="b\.png"/);
  assert.match(html[1], /data-filename="a\.png"/);
  assert.match(html[1], /data-prompt="a cat"/);
});

test("buildMessageMediaHtml falls back to the image data cache when the record has no url", () => {
  reset([{ filename: "a.png", prompt: "", mediaType: "image", isStoredInDb: true }]);
  state.imageDataCache.set("a.png", "data:image/png;base64,CCC");

  const html = buildMessageMediaHtml("[[MEDIA: a.png]]");
  assert.equal(html.length, 1);
  assert.match(html[0], /src="data:image\/png;base64,CCC"/);
});

test("buildMessageMediaHtml builds a video element for video records", () => {
  reset([{ filename: "clip.mp4", url: "blob:clip", mediaType: "video", mimeType: "video/mp4" }]);

  const html = buildMessageMediaHtml("[[MEDIA: clip.mp4]]");
  assert.equal(html.length, 1);
  assert.match(html[0], /^<video /);
});

test("buildMessageMediaHtml skips placeholders with no record or no resolvable source", () => {
  reset([{ filename: "a.png", prompt: "", mediaType: "image" }]);

  assert.deepEqual(buildMessageMediaHtml("[[MEDIA: missing.png]]"), []);
  assert.deepEqual(buildMessageMediaHtml("[[MEDIA: a.png]]"), []);
});

test("buildMessageMediaHtml returns nothing when there are no generated images", () => {
  reset([]);
  assert.deepEqual(buildMessageMediaHtml("[[MEDIA: a.png]]"), []);
});
