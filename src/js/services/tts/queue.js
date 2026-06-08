import { ttsConfig, ttsRuntime, ttsMessageQueue } from "./config.js";
import { shouldSkipTts } from "./filters.js";
import { stopTtsAudio } from "./playback.js";
import { state } from "../../init/state.js";

export function playNextMessageInQueue() {
  if (!ttsMessageQueue.length || !ttsConfig.autoplay) {
    if (state.verboseLogging) {
      console.info("Autoplay sequence ended: queue empty or autoplay disabled");
    }
    ttsRuntime.autoplayActive = false;
    return;
  }

  if (ttsRuntime.activeTtsAudio) {
    if (state.verboseLogging) {
      console.info("Audio already playing, will continue queue when finished");
    }
    return;
  }

  if (state.verboseLogging) {
    console.info("Playing next message in queue. Queue length:", ttsMessageQueue.length);
  }

  const nextMessageId = ttsMessageQueue[0];
  const messageElement = document.getElementById(nextMessageId);

  if (messageElement) {
    const controlsContainer = messageElement.querySelector(".tts-controls");
    const playButton = controlsContainer?.querySelector(".tts-play-pause");

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

export function addMessageToTtsQueue(messageId) {
  if (!ttsConfig.enabled || !ttsConfig.autoplay) {
    return;
  }

  if (shouldSkipTts(messageId)) {
    return;
  }

  if (!ttsMessageQueue.includes(messageId)) {
    ttsMessageQueue.push(messageId);
    if (state.verboseLogging) {
      console.info("Adding message to TTS queue:", messageId);
    }

    if (!ttsRuntime.activeTtsAudio && ttsRuntime.autoplayActive) {
      if (state.verboseLogging) {
        console.info("No active audio, starting autoplay sequence");
      }
      playQueuedTtsMessage();
    } else if (ttsRuntime.activeTtsAudio && state.verboseLogging) {
      console.info("Audio already playing, message queued for later playback");
    }
  }
}

export function startTtsAutoplay() {
  if (ttsConfig.enabled && ttsConfig.autoplay && !ttsRuntime.autoplayActive) {
    ttsRuntime.autoplayActive = true;
    if (state.verboseLogging) {
      console.info("Starting TTS autoplay sequence.");
    }
    playQueuedTtsMessage();
  } else if (state.verboseLogging) {
    console.info("TTS autoplay not started: already active or disabled.");
  }
}

export function stopTtsAutoplay() {
  if (ttsRuntime.autoplayActive) {
    ttsRuntime.autoplayActive = false;
    if (state.verboseLogging) {
      console.info("Stopping TTS autoplay sequence.");
    }
    stopTtsAudio();
  }
}

// Legacy helper used by older handlers – keep as thin wrapper
export function playQueuedTtsMessage() {
  playNextMessageInQueue();
}
