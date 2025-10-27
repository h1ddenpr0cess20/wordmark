import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadWindowScript } from './helpers/loadWindowScript.js';

function createDocumentStub(buttons) {
  return {
    querySelectorAll(selector) {
      if (selector === '.tts-play-pause') {
        return buttons;
      }
      return [];
    },
  };
}

class MockAudio {
  constructor(url) {
    this.url = url;
    this.currentTime = 0;
    this.paused = true;
    this.playCalls = 0;
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

function loadPlaybackModule({ document, windowOverrides = {}, urlStubs, setTimeoutImpl = fn => fn() }) {
  const modulePath = path.resolve('src/js/services/tts/playback.js');
  return loadWindowScript(modulePath, {
    document,
    window: {
      ttsAudioResources: {
        added: [],
        removed: [],
        addUrl(url, id, data) {
          this.added.push({ url, id, data });
        },
        removeUrl(url) {
          this.removed.push(url);
        },
        getAudioData() {
          return null;
        },
      },
      ttsSvgIcons: {
        play: '<svg data-icon="play"></svg>',
        stop: '<svg data-icon="stop"></svg>',
      },
      ttsConfig: { autoplay: true },
      playNextMessageInQueue: () => {},
      ...windowOverrides,
    },
    globals: {
      URL: urlStubs,
      Audio: MockAudio,
      Blob,
      setTimeout: setTimeoutImpl,
    },
  });
}

test('stopTtsAudio resets controls and revokes resources', () => {
  const buttons = [];
  const status = {
    style: { display: 'inline' },
    textContent: 'Playing',
  };

  function createButton() {
    return {
      innerHTML: '<svg data-icon="pause"></svg>',
      title: '',
      attributes: {},
      parentElement: {
        querySelector(selector) {
          if (selector === '.tts-status') {
            return status;
          }
          return null;
        },
      },
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
    };
  }

  buttons.push(createButton());

  const urlStubs = {
    revoked: [],
    createObjectURL() {
      return 'blob:mock';
    },
    revokeObjectURL(url) {
      this.revoked.push(url);
    },
  };

  const windowObj = loadPlaybackModule({
    document: createDocumentStub(buttons),
    windowOverrides: {
      activeTtsAudio: {
        pauseCalled: false,
        currentTime: 5,
        pause() {
          this.pauseCalled = true;
        },
      },
      activeTtsAudioUrl: 'blob:mock',
    },
    urlStubs,
  });

  windowObj.stopTtsAudio();
  assert.equal(windowObj.activeTtsAudio, null);
  assert.equal(windowObj.activeTtsAudioUrl, null);
  assert.equal(windowObj.ttsAudioResources.removed[0], 'blob:mock');
  assert.equal(urlStubs.revoked[0], 'blob:mock');
  assert.equal(buttons[0].innerHTML, '<svg data-icon="play"></svg>');
  assert.equal(status.textContent, 'Stopped');
});

test('playTtsAudio creates audio, stores resources, and sets handlers', async () => {
  const urlStubs = {
    created: [],
    revoked: [],
    createObjectURL(blob) {
      const url = `blob:${this.created.length + 1}`;
      this.created.push({ url, blob });
      return url;
    },
    revokeObjectURL(url) {
      this.revoked.push(url);
    },
  };

  const windowObj = loadPlaybackModule({
    document: createDocumentStub([]),
    windowOverrides: {
      ttsAudioResources: {
        added: [],
        removed: [],
        addUrl(url, id, data) {
          this.added.push({ url, id, data });
        },
        removeUrl(url) {
          this.removed.push(url);
        },
        getAudioData() {
          return null;
        },
      },
    },
    urlStubs,
  });

  const audioData = new Uint8Array([1, 2, 3]);
  windowObj.playTtsAudio(audioData);

  assert.ok(windowObj.activeTtsAudio);
  assert.equal(windowObj.ttsAudioResources.added.length, 1);
  assert.equal(urlStubs.created.length, 1);
  assert.equal(windowObj.activeTtsAudioUrl, urlStubs.created[0].url);

  // Simulate audio ending
  if (typeof windowObj.activeTtsAudio.onended === 'function') {
    windowObj.activeTtsAudio.onended();
  }

  assert.equal(windowObj.activeTtsAudio, null);
  assert.equal(windowObj.ttsAudioResources.removed.length, 1);
  assert.equal(urlStubs.revoked.length, 1);
});

test('handleTtsAudioEnded resets UI state and triggers queue when autoplay', () => {
  const urlStubs = {
    createObjectURL() {
      return 'blob:1';
    },
    revokeObjectURL() {},
  };

  let queueCalls = 0;
  const windowObj = loadPlaybackModule({
    document: createDocumentStub([]),
    windowOverrides: {
      playNextMessageInQueue() {
        queueCalls += 1;
      },
      ttsConfig: { autoplay: true },
      ttsAudioResources: {
        addUrl() {},
        removeUrl() {},
        getAudioData() {
          return null;
        },
      },
    },
    setTimeoutImpl: (fn) => fn(),
    urlStubs,
  });

  const statusText = { textContent: '', style: { display: 'none' } };
  const playPauseButton = {
    innerHTML: '<svg data-icon="pause"></svg>',
    title: '',
    setAttribute() {},
  };
  const tracker = { isPlaying: true };

  const handler = windowObj.handleTtsAudioEnded(playPauseButton, statusText, 'blob:current', tracker);
  windowObj.activeTtsAudioUrl = 'blob:current';
  windowObj.activeTtsAudio = {};

  handler();

  assert.equal(playPauseButton.innerHTML, '<svg data-icon="play"></svg>');
  assert.equal(statusText.textContent, 'Finished');
  assert.equal(windowObj.activeTtsAudioUrl, null);
  assert.equal(queueCalls, 1);
  assert.equal(tracker.isPlaying, false);
});
