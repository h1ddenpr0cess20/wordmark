/**
 * TTS autoplay queue.
 *
 * @remarks
 * Manages the queue of messages to read aloud, driving sequential autoplay and
 * its start/stop lifecycle.
 */

import { ttsConfig, ttsRuntime, ttsMessageQueue } from "./config.ts";
import { shouldSkipTts } from "./filters.ts";
import { stopTtsAudio } from "./playback.ts";
import { createScopedLogger } from "../../utils/logger.ts";

const logTts = createScopedLogger("tts");

/**
 * Plays the next queued message by clicking its play control, skipping entries
 * whose elements/controls are gone. Stops when the queue empties or autoplay is
 * off, and no-ops while audio is already playing.
 */
export function playNextMessageInQueue() {
  if (!ttsMessageQueue.length || !ttsConfig.autoplay) {
    logTts("Autoplay sequence ended: queue empty or autoplay disabled");
    ttsRuntime.autoplayActive = false;
    return;
  }

  if (ttsRuntime.activeTtsAudio) {
    logTts("Audio already playing, will continue queue when finished");
    return;
  }

  logTts("Playing next message in queue. Queue length:", ttsMessageQueue.length);

  const nextMessageId = ttsMessageQueue[0];
  const messageElement = document.getElementById(nextMessageId);

  if (messageElement) {
    const controlsContainer = messageElement.querySelector(".tts-controls");
    const playButton = controlsContainer?.querySelector<HTMLElement>(".tts-play-pause");

    if (playButton) {
      ttsMessageQueue.shift();
      try {
        playButton.click();
        return;
      } catch (error) {
        console.error("Error clicking play button:", error);
        setTimeout(() => playNextMessageInQueue(), 100);
        return;
      }
    }

    console.warn("Could not find play controls for message:", nextMessageId);
  } else {
    console.warn("Could not find message element:", nextMessageId);
  }

  ttsMessageQueue.shift();
  setTimeout(() => playNextMessageInQueue(), 100);
}

/**
 * Enqueues a message for autoplay (when enabled and not filtered), starting the
 * autoplay sequence if nothing is currently playing.
 */
export function addMessageToTtsQueue(messageId: string) {
  if (!ttsConfig.enabled || !ttsConfig.autoplay) {
    return;
  }

  if (shouldSkipTts(messageId)) {
    return;
  }

  if (!ttsMessageQueue.includes(messageId)) {
    ttsMessageQueue.push(messageId);
    logTts("Adding message to TTS queue:", messageId);

    if (!ttsRuntime.activeTtsAudio && ttsRuntime.autoplayActive) {
      logTts("No active audio, starting autoplay sequence");
      playQueuedTtsMessage();
    } else if (ttsRuntime.activeTtsAudio) {
      logTts("Audio already playing, message queued for later playback");
    }
  }
}

/** Activates the autoplay sequence and begins playing the queue, if idle. */
export function startTtsAutoplay() {
  if (ttsConfig.enabled && ttsConfig.autoplay && !ttsRuntime.autoplayActive) {
    ttsRuntime.autoplayActive = true;
    logTts("Starting TTS autoplay sequence.");
    playQueuedTtsMessage();
  } else {
    logTts("TTS autoplay not started: already active or disabled.");
  }
}

/** Deactivates autoplay and stops any currently playing audio. */
export function stopTtsAutoplay() {
  if (ttsRuntime.autoplayActive) {
    ttsRuntime.autoplayActive = false;
    logTts("Stopping TTS autoplay sequence.");
    stopTtsAudio();
  }
}

/** Thin wrapper around {@link playNextMessageInQueue} kept for older handlers. */
export function playQueuedTtsMessage() {
  playNextMessageInQueue();
}
