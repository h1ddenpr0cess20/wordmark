window.stopTtsAudio = function() {
  if (!window.activeTtsAudio) {
    return;
  }

  try {
    window.activeTtsAudio.pause();
    window.activeTtsAudio.currentTime = 0;

    if (window.activeTtsAudioUrl) {
      window.ttsAudioResources.removeUrl(window.activeTtsAudioUrl);
      URL.revokeObjectURL(window.activeTtsAudioUrl);
      window.activeTtsAudioUrl = null;
    }

    window.activeTtsAudio = null;

    document.querySelectorAll('.tts-play-pause').forEach((btn) => {
      const svgContent = btn.innerHTML;
      if (svgContent.includes('pause') || !svgContent.includes('polygon')) {
        btn.innerHTML = window.ttsSvgIcons.play;
        btn.title = 'Play voice';
        btn.setAttribute('aria-label', 'Play voice');

        const statusText = btn.parentElement?.querySelector('.tts-status');
        if (statusText && statusText.style.display === 'inline') {
          statusText.textContent = 'Stopped';
          setTimeout(() => {
            statusText.style.display = 'none';
          }, 2000);
        }
      }
    });
  } catch (error) {
    console.error('Error stopping TTS audio:', error);
  }
};

window.playTtsAudio = function(audioData) {
  if (!audioData) {
    return;
  }

  try {
    window.stopTtsAudio();

    const audioBlob = new Blob([audioData], { type: 'audio/wav' });
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    window.activeTtsAudio = audio;
    window.activeTtsAudioUrl = audioUrl;
    window.ttsAudioResources.addUrl(audioUrl, `test_audio_${Date.now()}`, audioData);

    audio.onended = () => {
      window.ttsAudioResources.removeUrl(audioUrl);
      URL.revokeObjectURL(audioUrl);
      window.activeTtsAudioUrl = null;
      window.activeTtsAudio = null;
    };

    audio.play().catch((error) => {
      console.error('Failed to play TTS audio:', error);
      window.activeTtsAudio = null;
      window.activeTtsAudioUrl = null;
      window.ttsAudioResources.removeUrl(audioUrl);
      URL.revokeObjectURL(audioUrl);
    });
  } catch (error) {
    console.error('Error playing TTS audio:', error);
  }
};

window.handleTtsAudioEnded = function(playPauseButton, statusText, audioUrl, isPlayingRef) {
  return function() {
    if (isPlayingRef) {
      isPlayingRef.isPlaying = false;
    }

    playPauseButton.innerHTML = window.ttsSvgIcons.play;
    playPauseButton.title = 'Play voice';
    playPauseButton.setAttribute('aria-label', 'Play voice');
    statusText.textContent = 'Finished';
    statusText.style.display = 'inline';
    setTimeout(() => {
      statusText.style.display = 'none';
    }, 2000);

    window.activeTtsAudio = null;

    if (window.activeTtsAudioUrl === audioUrl) {
      window.activeTtsAudioUrl = null;
    }

    if (window.ttsConfig.autoplay) {
      setTimeout(() => window.playNextMessageInQueue(), 500);
    }
  };
};

window.handleAudioEnded = function() {
  if (window.VERBOSE_LOGGING) {
    console.info('Audio finished, checking for next message in queue');
  }
  window.activeTtsAudio = null;
  window.activeTtsAudioUrl = null;

  if (window.ttsConfig.autoplay && window.ttsAutoplayActive) {
    window.playQueuedTtsMessage();
  }
};

window.handleAudioError = function(event) {
  console.error('Audio playback error:', event);
  window.activeTtsAudio = null;
  window.activeTtsAudioUrl = null;

  if (window.ttsConfig.autoplay && window.ttsAutoplayActive) {
    console.error('Audio error, trying next message in queue');
    window.playQueuedTtsMessage();
  }
};

