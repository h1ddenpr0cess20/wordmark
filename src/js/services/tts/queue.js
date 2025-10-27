window.playNextMessageInQueue = function() {
  if (!window.ttsMessageQueue.length || !window.ttsConfig.autoplay) {
    if (window.VERBOSE_LOGGING) {
      console.info('Autoplay sequence ended: queue empty or autoplay disabled');
    }
    window.ttsAutoplayActive = false;
    return;
  }

  if (window.activeTtsAudio) {
    if (window.VERBOSE_LOGGING) {
      console.info('Audio already playing, will continue queue when finished');
    }
    return;
  }

  if (window.VERBOSE_LOGGING) {
    console.info('Playing next message in queue. Queue length:', window.ttsMessageQueue.length);
  }

  const nextMessageId = window.ttsMessageQueue[0];
  const messageElement = document.getElementById(nextMessageId);

  if (messageElement) {
    const controlsContainer = messageElement.querySelector('.tts-controls');
    const playButton = controlsContainer?.querySelector('.tts-play-pause');

    if (playButton) {
      window.ttsMessageQueue.shift();
      try {
        playButton.click();
        return;
      } catch (error) {
        console.error('Error clicking play button:', error);
        setTimeout(() => window.playNextMessageInQueue(), 100);
        return;
      }
    }

    console.warn('Could not find play controls for message:', nextMessageId);
  } else {
    console.warn('Could not find message element:', nextMessageId);
  }

  window.ttsMessageQueue.shift();
  setTimeout(() => window.playNextMessageInQueue(), 100);
};

window.addMessageToTtsQueue = function(messageId) {
  if (!window.ttsConfig.enabled || !window.ttsConfig.autoplay) {
    return;
  }

  if (window.shouldSkipTts(messageId)) {
    return;
  }

  if (!window.ttsMessageQueue.includes(messageId)) {
    window.ttsMessageQueue.push(messageId);
    if (window.VERBOSE_LOGGING) {
      console.info('Adding message to TTS queue:', messageId);
    }

    if (!window.activeTtsAudio && window.ttsAutoplayActive) {
      if (window.VERBOSE_LOGGING) {
        console.info('No active audio, starting autoplay sequence');
      }
      window.playQueuedTtsMessage();
    } else if (window.activeTtsAudio && window.VERBOSE_LOGGING) {
      console.info('Audio already playing, message queued for later playback');
    }
  }
};

window.startTtsAutoplay = function() {
  if (window.ttsConfig.enabled && window.ttsConfig.autoplay && !window.ttsAutoplayActive) {
    window.ttsAutoplayActive = true;
    if (window.VERBOSE_LOGGING) {
      console.info('Starting TTS autoplay sequence.');
    }
    window.playQueuedTtsMessage();
  } else if (window.VERBOSE_LOGGING) {
    console.info('TTS autoplay not started: already active or disabled.');
  }
};

window.stopTtsAutoplay = function() {
  if (window.ttsAutoplayActive) {
    window.ttsAutoplayActive = false;
    if (window.VERBOSE_LOGGING) {
      console.info('Stopping TTS autoplay sequence.');
    }
    window.stopTtsAudio();
  }
};

// Legacy helper used by older handlers – keep as thin wrapper
window.playQueuedTtsMessage = function() {
  window.playNextMessageInQueue();
};

