import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadWindowScript } from './helpers/loadWindowScript.js';

function loadQueueModule({ document, windowOverrides = {}, setTimeoutImpl = fn => fn() }) {
  const modulePath = path.resolve('src/js/services/tts/queue.js');
  return loadWindowScript(modulePath, {
    document,
    window: {
      ttsConfig: { enabled: true, autoplay: true, voice: 'ash' },
      ttsMessageQueue: [],
      ttsAutoplayActive: false,
      activeTtsAudio: null,
      shouldSkipTts: () => false,
      playQueuedTtsMessage: () => {},
      playNextMessageInQueue: () => {},
      stopTtsAudio: () => {},
      ...windowOverrides,
    },
    globals: {
      setTimeout: setTimeoutImpl,
    },
  });
}

test('playNextMessageInQueue stops autoplay when queue empty', () => {
  const windowObj = loadQueueModule({
    document: {
      getElementById() {
        return null;
      },
    },
  });

  windowObj.ttsAutoplayActive = true;
  windowObj.ttsMessageQueue = [];
  windowObj.playNextMessageInQueue();
  assert.equal(windowObj.ttsAutoplayActive, false);
});

test('playNextMessageInQueue skips when audio already active', () => {
  const playClicks = [];
  const messageId = 'msg-1';

  const playButton = {
    click() {
      playClicks.push('clicked');
    },
  };

  const controls = {
    querySelector(selector) {
      if (selector === '.tts-play-pause') {
        return playButton;
      }
      return null;
    },
  };

  const messageElement = {
    querySelector(selector) {
      if (selector === '.tts-controls') {
        return controls;
      }
      return null;
    },
  };

  const windowObj = loadQueueModule({
    document: {
      getElementById(id) {
        if (id === messageId) {
          return messageElement;
        }
        return null;
      },
    },
    windowOverrides: {
      activeTtsAudio: { playing: true },
    },
  });

  windowObj.ttsMessageQueue = [messageId];
  windowObj.playNextMessageInQueue();
  assert.equal(playClicks.length, 0);
  assert.equal(windowObj.ttsMessageQueue.length, 1);
});

test('playNextMessageInQueue clicks play button and removes from queue', () => {
  const messageId = 'msg-queue';
  let clicked = false;

  const playButton = {
    click() {
      clicked = true;
    },
  };

  const controls = {
    querySelector(selector) {
      if (selector === '.tts-play-pause') {
        return playButton;
      }
      return null;
    },
  };

  const messageElement = {
    querySelector(selector) {
      if (selector === '.tts-controls') {
        return controls;
      }
      return null;
    },
  };

  const windowObj = loadQueueModule({
    document: {
      getElementById(id) {
        if (id === messageId) {
          return messageElement;
        }
        return null;
      },
    },
    setTimeoutImpl: (fn) => fn(),
  });

  windowObj.ttsMessageQueue = [messageId];
  windowObj.playNextMessageInQueue();
  assert.equal(clicked, true);
  assert.equal(windowObj.ttsMessageQueue.length, 0);
});

test('addMessageToTtsQueue enqueues messages and triggers playback', () => {
  const enqueueCalls = [];

  const windowObj = loadQueueModule({
    document: {
      getElementById() {
        return null;
      },
    },
    windowOverrides: {
      ttsAutoplayActive: true,
      activeTtsAudio: null,
    },
  });

  windowObj.playNextMessageInQueue = () => {
    enqueueCalls.push('play');
  };

  windowObj.ttsMessageQueue = [];
  windowObj.addMessageToTtsQueue('msg-1');
  assert.deepEqual(windowObj.ttsMessageQueue, ['msg-1']);
  assert.equal(enqueueCalls.length, 1);

  // Duplicate should be ignored
  windowObj.addMessageToTtsQueue('msg-1');
  assert.equal(windowObj.ttsMessageQueue.length, 1);

  // Skip when disabled
  windowObj.ttsConfig.enabled = false;
  windowObj.addMessageToTtsQueue('msg-2');
  assert.equal(windowObj.ttsMessageQueue.includes('msg-2'), false);
});
