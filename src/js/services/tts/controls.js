window.generateTtsForMessage = async function(text, messageId) {
  if (!this.ttsConfig.enabled) {
    return;
  }

  try {
    if (window.activeTtsAudio && window.activeTtsAudio.paused) {
      if (window.VERBOSE_LOGGING) {
        console.info('Active TTS audio is paused; treating as stopped before queuing next message.');
      }
      window.stopTtsAudio();
    }

    const lowerText = text.toLowerCase();
    const keywordsToFilter = ['voice playback stopped', 'tts test', 'testing tts', 'stop voice'];

    if (keywordsToFilter.some((keyword) => lowerText.includes(keyword))) {
      console.info('Skipping TTS for system message or message with trigger keywords');
      return;
    }

    if (this.ttsConfig.autoplay) {
      const audioData = await this.generateSpeech(text);

      if (audioData) {
        this.addTtsControlsToMessage(audioData, messageId, text);

        if (!window.ttsMessageQueue.includes(messageId)) {
          console.info('Adding message to TTS queue:', messageId);
          window.ttsMessageQueue.push(messageId);

          if (!window.activeTtsAudio) {
            console.info('No active audio, starting autoplay sequence');
            window.ttsAutoplayActive = true;
            window.playNextMessageInQueue();
          } else {
            console.info('Audio already playing, message queued for later playback');
          }
        }
      } else {
        if (!window.ttsErrorShown) {
          window.ttsErrorShown = true;
          if (window.showError) {
            window.showError('TTS failed. Please check your API key configuration.');
          }
          setTimeout(() => {
            window.ttsErrorShown = false;
          }, 30000);
        }

        if (window.ttsToggle) {
          window.ttsToggle.checked = false;
          window.ttsConfig.enabled = false;
        }
      }
    } else {
      this.addPlaceholderTtsControls(messageId, text);
    }
  } catch (error) {
    console.error('Failed to generate TTS for message:', error);
  }
};

window.addPlaceholderTtsControls = function(messageId, text) {
  const messageElement = document.getElementById(messageId);
  if (!messageElement) {
    return;
  }

  const existingControls = messageElement.querySelector('.tts-controls');
  if (existingControls) {
    try {
      existingControls.parentNode.removeChild(existingControls);
    } catch (error) {
      console.error('Error removing existing TTS controls:', error);
    }
  }

  const controlsContainer = document.createElement('div');
  controlsContainer.className = 'tts-controls';
  controlsContainer.setAttribute('data-original-text', text);
  controlsContainer.setAttribute('data-voice', window.ttsConfig.voice);
  controlsContainer.setAttribute('data-audio-generated', 'false');

  const playButton = document.createElement('button');
  playButton.className = 'tts-play-pause';
  playButton.title = 'Generate and play voice';
  playButton.setAttribute('aria-label', 'Generate and play voice');
  playButton.innerHTML = window.ttsSvgIcons.play;

  const statusText = document.createElement('span');
  statusText.className = 'tts-status';
  statusText.style.display = 'none';

  const loadingSpinner = document.createElement('div');
  loadingSpinner.className = 'tts-loading-spinner';

  playButton.addEventListener('click', async() => {
    playButton.innerHTML = '';
    playButton.appendChild(loadingSpinner);
    statusText.textContent = 'Generating...';
    statusText.style.display = 'inline';

    try {
      const audioData = await window.generateSpeech(text);

      if (audioData) {
        window.addTtsControlsToMessage(audioData, messageId, text);
        setTimeout(() => {
          const newControls = document.getElementById(messageId)?.querySelector('.tts-controls');
          const newPlayButton = newControls?.querySelector('.tts-play-pause');
          if (newPlayButton) {
            newPlayButton.click();
          }
        }, 100);
      } else {
        statusText.textContent = 'Failed to generate audio';
        playButton.innerHTML = window.ttsSvgIcons.play;
        setTimeout(() => {
          statusText.style.display = 'none';
        }, 3000);
      }
    } catch (error) {
      console.error('Failed to generate audio on demand:', error);
      playButton.innerHTML = window.ttsSvgIcons.play;
      statusText.textContent = 'Error';
      statusText.style.display = 'inline';
      setTimeout(() => {
        statusText.style.display = 'none';
      }, 3000);
    }
  });

  controlsContainer.appendChild(playButton);
  controlsContainer.appendChild(statusText);

  const contentElement = messageElement.querySelector('.message-content');
  if (contentElement) {
    contentElement.appendChild(controlsContainer);
  } else {
    messageElement.appendChild(controlsContainer);
  }
};

window.addTtsControlsToMessage = function(audioData, messageId, originalText) {
  const messageElement = document.getElementById(messageId);
  if (!messageElement) {
    return;
  }

  const existingControls = messageElement.querySelector('.tts-controls');
  if (existingControls) {
    try {
      existingControls.parentNode.removeChild(existingControls);
    } catch (error) {
      console.error('Error removing existing TTS controls:', error);
    }
  }

  const audioBlob = new Blob([audioData], { type: 'audio/wav' });
  const audioUrl = URL.createObjectURL(audioBlob);

  window.ttsAudioResources.addUrl(audioUrl, messageId, audioData);

  const audio = new Audio(audioUrl);
  const playbackState = { isPlaying: false };
  const controlsContainer = document.createElement('div');
  controlsContainer.className = 'tts-controls';
  controlsContainer.setAttribute('data-original-text', originalText);
  controlsContainer.setAttribute('data-voice', window.ttsConfig.voice);

  const playPauseButton = document.createElement('button');
  playPauseButton.className = 'tts-play-pause';
  playPauseButton.title = 'Play voice';
  playPauseButton.setAttribute('aria-label', 'Play voice');
  playPauseButton.innerHTML = window.ttsSvgIcons.play;

  const stopButton = document.createElement('button');
  stopButton.className = 'tts-stop';
  stopButton.title = 'Stop and reset voice';
  stopButton.setAttribute('aria-label', 'Stop voice');
  stopButton.innerHTML = window.ttsSvgIcons.stop;

  const downloadButton = document.createElement('button');
  downloadButton.className = 'tts-download';
  downloadButton.title = 'Download audio';
  downloadButton.setAttribute('aria-label', 'Download audio');
  downloadButton.innerHTML = window.ttsSvgIcons.download;

  const statusText = document.createElement('span');
  statusText.className = 'tts-status';
  statusText.style.display = 'none';

  const loadingSpinner = document.createElement('div');
  loadingSpinner.className = 'tts-loading-spinner';

  if (!document.getElementById('tts-spinner-style')) {
    const style = document.createElement('style');
    style.id = 'tts-spinner-style';
    style.textContent = `
      @keyframes tts-spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  let isLoading = false;
  let isPlaying = false;

  playPauseButton.addEventListener('click', async() => {
    if (isLoading) {
      return;
    }

    const audioVoice = controlsContainer.getAttribute('data-voice');
    const currentVoice = window.ttsConfig.voice;

    if (audioVoice !== currentVoice) {
      if (isPlaying) {
        audio.pause();
        audio.currentTime = 0;
        isPlaying = false;
      }

      isLoading = true;
      playPauseButton.innerHTML = '';
      playPauseButton.appendChild(loadingSpinner);

      const messageText = controlsContainer.getAttribute('data-original-text');
      if (messageText) {
        try {
          const newAudioData = await window.generateSpeech(messageText);
          if (newAudioData) {
            window.ttsAudioResources.removeUrl(audioUrl);
            URL.revokeObjectURL(audioUrl);
            window.addTtsControlsToMessage(newAudioData, messageId, messageText);
            setTimeout(() => {
              const newControls = document.getElementById(messageId)?.querySelector('.tts-controls');
              const newPlayButton = newControls?.querySelector('.tts-play-pause');
              if (newPlayButton) {
                newPlayButton.click();
              }
            }, 100);
            return;
          }

          isLoading = false;
          playPauseButton.innerHTML = window.ttsSvgIcons.play;
          statusText.textContent = 'Voice change failed';
          statusText.style.display = 'inline';
          setTimeout(() => {
            statusText.style.display = 'none';
          }, 3000);
          return;
        } catch (error) {
          console.error('Failed to regenerate audio:', error);
          isLoading = false;
          playPauseButton.innerHTML = window.ttsSvgIcons.play;
          statusText.textContent = 'Error';
          statusText.style.display = 'inline';
          setTimeout(() => {
            statusText.style.display = 'none';
          }, 3000);
          return;
        }
      }
    }

    if (audio.paused) {
      if (audio.readyState < 3 && !isPlaying) {
        isLoading = true;
        playPauseButton.innerHTML = '';
        playPauseButton.appendChild(loadingSpinner);

        if (window.activeTtsAudio && window.activeTtsAudio !== audio) {
          window.activeTtsAudio.pause();
          window.activeTtsAudio.currentTime = 0;

          document.querySelectorAll('.tts-play-pause').forEach((btn) => {
            if (btn !== playPauseButton && !btn.contains(loadingSpinner)) {
              btn.innerHTML = window.ttsSvgIcons.play;
              btn.title = 'Play voice';
              btn.setAttribute('aria-label', 'Play voice');
            }
          });
        }

        const canPlayHandler = () => {
          isLoading = false;
          audio.play().then(() => {
            playbackState.isPlaying = true;
            isPlaying = true;
            playPauseButton.innerHTML = window.ttsSvgIcons.pause;
            playPauseButton.title = 'Pause voice';
            playPauseButton.setAttribute('aria-label', 'Pause voice');
            statusText.textContent = 'Playing';
            statusText.style.display = 'inline';
            window.activeTtsAudio = audio;
          }).catch((error) => {
            console.error('Failed to play audio:', error);
            playPauseButton.innerHTML = window.ttsSvgIcons.play;
            statusText.textContent = 'Failed';
            statusText.style.display = 'inline';
            setTimeout(() => {
              statusText.style.display = 'none';
            }, 3000);
          });
        };

        if (audio.readyState >= 3) {
          canPlayHandler();
        } else {
          audio.addEventListener('canplay', canPlayHandler, { once: true });
        }
      } else {
        audio.play();
        playbackState.isPlaying = true;
        isPlaying = true;
        playPauseButton.innerHTML = window.ttsSvgIcons.pause;
        playPauseButton.title = 'Pause voice';
        playPauseButton.setAttribute('aria-label', 'Pause voice');
        statusText.textContent = 'Playing';
        statusText.style.display = 'inline';
        window.activeTtsAudio = audio;
      }
    } else {
      audio.pause();
      playbackState.isPlaying = false;
      isPlaying = false;
      playPauseButton.innerHTML = window.ttsSvgIcons.play;
      playPauseButton.title = 'Play voice';
      playPauseButton.setAttribute('aria-label', 'Play voice');
      statusText.textContent = 'Paused';
      statusText.style.display = 'inline';
      if (window.activeTtsAudio === audio) {
        window.activeTtsAudio = null;
      }
      setTimeout(() => {
        if (audio.paused) {
          statusText.style.display = 'none';
        }
      }, 2000);
    }
  });

  stopButton.addEventListener('click', () => {
    audio.pause();
    audio.currentTime = 0;
    isPlaying = false;
    playPauseButton.innerHTML = window.ttsSvgIcons.play;
    playPauseButton.title = 'Play voice';
    playPauseButton.setAttribute('aria-label', 'Play voice');
    statusText.textContent = 'Stopped';
    statusText.style.display = 'inline';
    setTimeout(() => {
      statusText.style.display = 'none';
    }, 2000);

    if (window.activeTtsAudio === audio) {
      window.activeTtsAudio = null;
    }
  });

  downloadButton.addEventListener('click', () => {
    statusText.textContent = 'Downloading...';
    statusText.style.display = 'inline';

    try {
      const now = new Date();
      const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
      const voiceName = window.ttsConfig.voice;
      const filename = `tts_${voiceName}_${timestamp}.wav`;

      const cachedAudioData = window.ttsAudioResources.getAudioData(messageId);

      if (cachedAudioData) {
        if (typeof window.exportAudioForDownload === 'function') {
          window.exportAudioForDownload(cachedAudioData, filename);
          statusText.textContent = 'Downloaded';
        } else {
          const blob = new Blob([cachedAudioData], { type: 'audio/wav' });
          const url = URL.createObjectURL(blob);

          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          setTimeout(() => URL.revokeObjectURL(url), 100);
          statusText.textContent = 'Downloaded';
        }
      } else {
        const a = document.createElement('a');
        a.href = audioUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        statusText.textContent = 'Downloaded';
      }

      setTimeout(() => {
        statusText.style.display = 'none';
      }, 2000);
    } catch (error) {
      console.error('Error downloading audio:', error);
      statusText.textContent = 'Download failed';
      setTimeout(() => {
        statusText.style.display = 'none';
      }, 2000);
    }
  });

  audio.addEventListener('ended', window.handleTtsAudioEnded(playPauseButton, statusText, audioUrl, playbackState));

  audio.addEventListener('error', (event) => {
    console.error('Audio playback error:', event);
    isLoading = false;
    isPlaying = false;
    playbackState.isPlaying = false;
    playPauseButton.innerHTML = window.ttsSvgIcons.play;
    statusText.textContent = 'Error';
    statusText.style.display = 'inline';
    setTimeout(() => {
      statusText.style.display = 'none';
    }, 3000);

    window.ttsAudioResources.removeUrl(audioUrl);

    if (window.ttsConfig.autoplay) {
      console.info('Audio error, trying next message in queue');
      setTimeout(() => window.playNextMessageInQueue(), 500);
    }
  });

  controlsContainer.appendChild(playPauseButton);
  controlsContainer.appendChild(stopButton);
  controlsContainer.appendChild(downloadButton);
  controlsContainer.appendChild(statusText);

  const contentElement = messageElement.querySelector('.message-content');
  if (contentElement) {
    contentElement.appendChild(controlsContainer);
  } else {
    messageElement.appendChild(controlsContainer);
  }
};

