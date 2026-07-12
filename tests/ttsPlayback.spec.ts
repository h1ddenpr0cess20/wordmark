import test from "node:test";
import assert from "node:assert/strict";


class MockAudio {
  url: string;
  currentTime = 0;
  paused = true;
  playCalls = 0;
  onended: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
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

let querySelectorAllResult: unknown[] = [];
const urlStub = {
  created: [] as string[],
  revoked: [] as string[],
  createObjectURL() {
    const url = `blob:${this.created.length + 1}`;
    this.created.push(url);
    return url;
  },
  revokeObjectURL(url: string) {
    this.revoked.push(url);
  },
};
let timeouts: Array<{ fn: unknown; ms: unknown }> = [];

globalThis.window = { VERBOSE_LOGGING: false } as unknown as Window & typeof globalThis;
globalThis.document = {
  querySelectorAll: (selector: string) => (selector === ".tts-play-pause" ? querySelectorAllResult : []),
  getElementById: () => null,
} as unknown as Document;
Object.assign(globalThis.URL, {
  createObjectURL: urlStub.createObjectURL.bind(urlStub),
  revokeObjectURL: urlStub.revokeObjectURL.bind(urlStub),
});
globalThis.Audio = MockAudio as unknown as typeof Audio;
globalThis.setTimeout = ((fn: unknown, ms: unknown) => { timeouts.push({ fn, ms }); return 0; }) as unknown as typeof setTimeout;
globalThis.indexedDB = { open: () => ({ onsuccess: null, onerror: null, onupgradeneeded: null }) } as unknown as IDBFactory;

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
    parentElement: { querySelector: (s: string) => (s === ".tts-status" ? status : null) },
  };
  querySelectorAllResult = [button];
  const activeAudio = { currentTime: 5, paused: false, pause() { this.paused = true; } };
  ttsRuntime.activeTtsAudio = activeAudio as unknown as HTMLAudioElement;
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

  playTtsAudio(audioData as unknown as ArrayBuffer);

  assert.ok(ttsRuntime.activeTtsAudio);
  assert.equal(urlStub.created.length, 1);
  assert.equal(ttsRuntime.activeTtsAudioUrl, urlStub.created[0]);

  assert.equal(typeof ttsRuntime.activeTtsAudio!.onended, "function");
  (ttsRuntime.activeTtsAudio!.onended as unknown as () => void)();

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

  const handler = handleTtsAudioEnded(
    playPauseButton as unknown as HTMLElement,
    status as unknown as HTMLElement,
    "blob:current",
    tracker,
  );
  ttsRuntime.activeTtsAudioUrl = "blob:current";
  ttsRuntime.activeTtsAudio = {} as unknown as HTMLAudioElement;

  handler();

  assert.equal(playPauseButton.innerHTML, ttsSvgIcons.play);
  assert.equal(status.textContent, "Finished");
  assert.equal(ttsRuntime.activeTtsAudioUrl, null);
  assert.equal(tracker.isPlaying, false);
  assert.ok(timeouts.some(t => t.ms === 500));
});
