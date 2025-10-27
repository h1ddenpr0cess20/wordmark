window.ttsAudioResources = {
  activeUrls: new Map(),

  addUrl(url, messageId, audioData) {
    this.activeUrls.set(messageId, {
      url,
      timestamp: Date.now(),
      audioData,
    });

    if (typeof window.saveAudioToDb === 'function' && audioData) {
      const messageElement = document.getElementById(messageId);
      let text = '';
      let voice = window.ttsConfig.voice;

      if (messageElement) {
        const controlsContainer = messageElement.querySelector('.tts-controls');
        if (controlsContainer) {
          text = controlsContainer.getAttribute('data-original-text') || '';
          voice = controlsContainer.getAttribute('data-voice') || voice;
        }
      }

      window.saveAudioToDb(audioData, messageId, text, voice).catch((err) => {
        console.error('Failed to save audio to IndexedDB:', err);
      });
    }
  },

  removeUrl(url) {
    for (const [messageId, data] of this.activeUrls.entries()) {
      if (data.url === url) {
        this.activeUrls.delete(messageId);
        break;
      }
    }
  },

  getUrl(messageId) {
    const data = this.activeUrls.get(messageId);
    return data ? data.url : null;
  },

  getAudioData(messageId) {
    const data = this.activeUrls.get(messageId);
    return data ? data.audioData : null;
  },

  clearAll() {
    const currentlyPlaying = window.activeTtsAudioUrl;
    const urlsToRevoke = [];

    for (const [messageId, data] of this.activeUrls.entries()) {
      if (data.url !== currentlyPlaying) {
        urlsToRevoke.push(data.url);
        this.activeUrls.delete(messageId);
      }
    }

    urlsToRevoke.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Error revoking URL:', error);
      }
    });

    if (window.VERBOSE_LOGGING) {
      console.info('Cleared all stored audio resources');
    }
  },
};

window.clearTtsAudioResources = function() {
  window.stopTtsAudio();
  window.ttsAudioResources.clearAll();

  if (window.VERBOSE_LOGGING) {
    console.info('All audio resources cleared');
  }
};

