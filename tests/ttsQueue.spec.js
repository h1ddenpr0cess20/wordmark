import test from "node:test";
import assert from "node:assert/strict";

// queue.js is an ES module sharing state via tts/config.js. Drive the real
// module with DOM/global stubs and assert on the shared ttsMessageQueue /
// ttsRuntime plus the play-button stubs.

let elements = new Map();
let timeouts = [];

globalThis.window = { VERBOSE_LOGGING: false };
globalThis.document = { getElementById: (id) => elements.get(id) || null };
globalThis.setTimeout = (fn, ms) => { timeouts.push({ fn, ms }); return 0; };

const { ttsConfig, ttsRuntime, ttsMessageQueue } = await import("../src/ts/services/tts/config.js");
const { playNextMessageInQueue, addMessageToTtsQueue } = await import("../src/ts/services/tts/queue.js");

function reset() {
  ttsConfig.enabled = true;
  ttsConfig.autoplay = true;
  ttsRuntime.activeTtsAudio = null;
  ttsRuntime.autoplayActive = false;
  ttsMessageQueue.length = 0;
  elements = new Map();
  timeouts = [];
}

// An element that passes shouldSkipTts (not a system message, no code keywords)
// and optionally exposes a .tts-play-pause button via .tts-controls.
function makeMessage(playButton = null) {
  const controls = playButton
    ? { querySelector: (s) => (s === ".tts-play-pause" ? playButton : null) }
    : null;
  return {
    classList: { contains: () => false },
    querySelector: (s) => {
      if (s === ".message-text") return { innerText: "Hello there" };
      if (s === ".tts-controls") return controls;
      return null;
    },
  };
}

test("playNextMessageInQueue stops autoplay when queue empty", () => {
  reset();
  ttsRuntime.autoplayActive = true;
  playNextMessageInQueue();
  assert.equal(ttsRuntime.autoplayActive, false);
});

test("playNextMessageInQueue skips when audio already active", () => {
  reset();
  let clicked = false;
  elements.set("msg-1", makeMessage({ click() { clicked = true; } }));
  ttsRuntime.activeTtsAudio = { playing: true };
  ttsMessageQueue.push("msg-1");

  playNextMessageInQueue();

  assert.equal(clicked, false);
  assert.equal(ttsMessageQueue.length, 1);
});

test("playNextMessageInQueue clicks play button and removes from queue", () => {
  reset();
  let clicked = false;
  elements.set("msg-queue", makeMessage({ click() { clicked = true; } }));
  ttsMessageQueue.push("msg-queue");

  playNextMessageInQueue();

  assert.equal(clicked, true);
  assert.equal(ttsMessageQueue.length, 0);
});

test("addMessageToTtsQueue enqueues messages and rejects duplicates/disabled", () => {
  reset();
  // Audio active so enqueue does not immediately drain the queue.
  ttsRuntime.activeTtsAudio = { playing: true };
  elements.set("msg-1", makeMessage());

  addMessageToTtsQueue("msg-1");
  assert.deepEqual(ttsMessageQueue, ["msg-1"]);

  // Duplicate is ignored.
  addMessageToTtsQueue("msg-1");
  assert.equal(ttsMessageQueue.length, 1);

  // Skipped when TTS disabled.
  ttsConfig.enabled = false;
  addMessageToTtsQueue("msg-2");
  assert.equal(ttsMessageQueue.includes("msg-2"), false);
});

test("addMessageToTtsQueue triggers playback when autoplay and idle", () => {
  reset();
  ttsRuntime.autoplayActive = true;
  ttsRuntime.activeTtsAudio = null;
  let clicked = false;
  elements.set("msg-go", makeMessage({ click() { clicked = true; } }));

  addMessageToTtsQueue("msg-go");

  // playback was triggered: the play button was clicked and the queue drained.
  assert.equal(clicked, true);
  assert.equal(ttsMessageQueue.length, 0);
});
