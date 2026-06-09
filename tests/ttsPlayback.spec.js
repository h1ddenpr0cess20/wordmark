import test from "node:test";
import assert from "node:assert/strict";

// playback.js is an ES module that reads shared state from tts/config.js and
// tts/resources.js. We drive the real modules with global stubs and assert
// observable effects on ttsRuntime / the DOM stubs / the URL stub.

class MockAudio {
  constructor(url) {
    this.url = url;
    this.currentTime = 0;
    this.paused = true;
    this.playCalls = 0;
    this.onended = null;
  }
  play() {
    this.paused = false;
    this.playCalls += 1;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

let querySelectorAllResult = [];
const urlStub = {
  created: [],
  revoked: [],
  createObjectURL() {
    const url = `blob:${this.created.length + 1}`;
    this.created.push(url);
    return url;
  },
  revokeObjectURL(url) {
    this.revoked.push(url);
  },
};
let timeouts = [];

globalThis.window = { VERBOSE_LOGGING: false };
globalThis.document = {
  querySelectorAll: (selector) => (selector === ".tts-play-pause" ? querySelectorAllResult : []),
  getElementById: () => null,
};
globalThis.URL = urlStub;
globalThis.Audio = MockAudio;
globalThis.setTimeout = (fn, ms) => { timeouts.push({ fn, ms }); return 0; };
// Minimal indexedDB so resources.addUrl -> saveAudioToDb doesn't throw synchronously.
globalThis.indexedDB = { open: () => ({ onsuccess: null, onerror: null, onupgradeneeded: null }) };

const { ttsConfig, ttsRuntime, ttsSvgIcons } = await import("../src/ts/services/tts/config.ts");
const { stopTtsAudio, playTtsAudio, handleTtsAudioEnded } = await import("../src/ts/services/tts/playback.ts");

function reset() {
  ttsRuntime.activeTtsAudio = null;
  ttsRuntime.activeTtsAudioUrl = null;
  ttsRuntime.autoplayActive = false;
  ttsConfig.autoplay = true;
  querySelectorAllResult = [];
  urlStub.created = [];
  urlStub.revoked = [];
  timeouts = [];
}

test("stopTtsAudio resets controls and revokes resources", () => {
  reset();
  const status = { style: { display: "inline" }, textContent: "Playing" };
  const button = {
    innerHTML: "<svg data-icon=\"pause\"></svg>",
    title: "",
    setAttribute() {},
    parentElement: { querySelector: (s) => (s === ".tts-status" ? status : null) },
  };
  querySelectorAllResult = [button];
  ttsRuntime.activeTtsAudio = { currentTime: 5, pause() { this.paused = true; } };
  ttsRuntime.activeTtsAudioUrl = "blob:mock";

  stopTtsAudio();

  assert.equal(ttsRuntime.activeTtsAudio, null);
  assert.equal(ttsRuntime.activeTtsAudioUrl, null);
  assert.ok(urlStub.revoked.includes("blob:mock"));
  assert.equal(button.innerHTML, ttsSvgIcons.play);
  assert.equal(status.textContent, "Stopped");
});

test("playTtsAudio creates audio, stores resources, and sets handlers", () => {
  reset();
  const audioData = new Uint8Array([1, 2, 3]);

  playTtsAudio(audioData);

  assert.ok(ttsRuntime.activeTtsAudio);
  assert.equal(urlStub.created.length, 1);
  assert.equal(ttsRuntime.activeTtsAudioUrl, urlStub.created[0]);

  // Simulate audio ending.
  assert.equal(typeof ttsRuntime.activeTtsAudio.onended, "function");
  ttsRuntime.activeTtsAudio.onended();

  assert.equal(ttsRuntime.activeTtsAudio, null);
  assert.equal(ttsRuntime.activeTtsAudioUrl, null);
  assert.ok(urlStub.revoked.includes(urlStub.created[0]));
});

test("handleTtsAudioEnded resets UI state and triggers queue when autoplay", () => {
  reset();
  ttsConfig.autoplay = true;
  const status = { textContent: "", style: { display: "none" } };
  const playPauseButton = { innerHTML: "<svg data-icon=\"pause\"></svg>", title: "", setAttribute() {} };
  const tracker = { isPlaying: true };

  const handler = handleTtsAudioEnded(playPauseButton, status, "blob:current", tracker);
  ttsRuntime.activeTtsAudioUrl = "blob:current";
  ttsRuntime.activeTtsAudio = {};

  handler();

  assert.equal(playPauseButton.innerHTML, ttsSvgIcons.play);
  assert.equal(status.textContent, "Finished");
  assert.equal(ttsRuntime.activeTtsAudioUrl, null);
  assert.equal(tracker.isPlaying, false);
  // The queue continuation is scheduled with a 500ms timeout when autoplay is on.
  assert.ok(timeouts.some(t => t.ms === 500));
});
