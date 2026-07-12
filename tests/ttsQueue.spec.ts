import test from "node:test";
import assert from "node:assert/strict";


let elements = new Map<string, unknown>();
let timeouts: Array<{ fn: unknown; ms: unknown }> = [];

globalThis.window = { VERBOSE_LOGGING: false } as unknown as Window & typeof globalThis;
globalThis.document = { getElementById: (id: string) => elements.get(id) || null } as unknown as Document;
globalThis.setTimeout = ((fn: unknown, ms: unknown) => { timeouts.push({ fn, ms }); return 0; }) as unknown as typeof setTimeout;

const { ttsConfig, ttsRuntime, ttsMessageQueue } = await import("../src/ts/services/tts/config.ts");
const { playNextMessageInQueue, addMessageToTtsQueue } = await import("../src/ts/services/tts/queue.ts");

function reset() {
  ttsConfig.enabled = true;
  ttsConfig.autoplay = true;
  ttsRuntime.activeTtsAudio = null;
  ttsRuntime.autoplayActive = false;
  ttsMessageQueue.length = 0;
  elements = new Map();
  timeouts = [];
}

function makeMessage(playButton: { click(): void } | null = null) {
  const controls = playButton
    ? { querySelector: (s: string) => (s === ".tts-play-pause" ? playButton : null) }
    : null;
  return {
    classList: { contains: () => false },
    querySelector: (s: string) => {
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
  ttsRuntime.activeTtsAudio = { playing: true } as unknown as HTMLAudioElement;
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
  ttsRuntime.activeTtsAudio = { playing: true } as unknown as HTMLAudioElement;
  elements.set("msg-1", makeMessage());

  addMessageToTtsQueue("msg-1");
  assert.deepEqual(ttsMessageQueue, ["msg-1"]);

  addMessageToTtsQueue("msg-1");
  assert.equal(ttsMessageQueue.length, 1);

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

  assert.equal(clicked, true);
  assert.equal(ttsMessageQueue.length, 0);
});
