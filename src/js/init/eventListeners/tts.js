export function setupTtsEventListeners() {
  if (window.ttsToggle) {
    window.ttsToggle.addEventListener('change', async(event) => {
      if (event.target.checked) {
        if (typeof window.loadTtsModule === 'function' && !window.lazyModulesLoaded?.tts) {
          await window.loadTtsModule();
        }
        window.ttsConfig = window.ttsConfig || { enabled: false, voice: 'leo', instructions: '', autoplay: true };
        window.ttsConfig.enabled = true;
        if (typeof window.initializeTts === 'function') {
          window.initializeTts();
        }
      } else {
        if (window.ttsConfig) {
          window.ttsConfig.enabled = false;
        }
        if (typeof window.stopTtsAudio === 'function') {
          window.stopTtsAudio();
        }
      }
      if (typeof window.updateFeatureStatus === 'function') {
        window.updateFeatureStatus();
      }
    });
  }

  if (window.ttsAutoplayToggle) {
    window.ttsAutoplayToggle.addEventListener('change', (event) => {
      window.ttsConfig = window.ttsConfig || { enabled: false, voice: 'leo', instructions: '', autoplay: true };
      window.ttsConfig.autoplay = event.target.checked;
      if (event.target.checked && window.ttsMessageQueue && window.ttsMessageQueue.length > 0 && !window.activeTtsAudio) {
        window.ttsAutoplayActive = true;
        if (typeof window.playNextMessageInQueue === 'function') {
          window.playNextMessageInQueue();
        }
      }
    });
  }

  if (window.ttsProviderSelector) {
    window.ttsProviderSelector.addEventListener('change', (event) => {
      window.ttsConfig = window.ttsConfig || { enabled: false, provider: 'xai', voice: 'leo', instructions: '', autoplay: true };
      window.ttsConfig.provider = event.target.value;
      if (typeof window.populateTtsVoiceSelector === 'function') {
        window.populateTtsVoiceSelector();
      }
      // xAI TTS doesn't support voice instructions
      const instructionsItem = window.ttsInstructionsInput?.closest('.setting-item');
      if (instructionsItem) {
        instructionsItem.style.display = event.target.value === 'xai' ? 'none' : '';
      }
    });
  }

  if (window.ttsVoiceSelector) {
    window.ttsVoiceSelector.addEventListener('change', (event) => {
      window.ttsConfig = window.ttsConfig || { enabled: false, provider: 'xai', voice: 'leo', instructions: '', autoplay: true };
      window.ttsConfig.voice = event.target.value;
    });
  }

  if (window.ttsInstructionsInput) {
    window.ttsInstructionsInput.addEventListener('change', (event) => {
      window.ttsConfig = window.ttsConfig || { enabled: false, voice: 'leo', instructions: '', autoplay: true };
      window.ttsConfig.instructions = event.target.value;
    });
  }

  if (window.testTtsButton) {
    window.testTtsButton.addEventListener('click', () => {
      window.ttsConfig = window.ttsConfig || { enabled: false, voice: 'leo', instructions: '', autoplay: true };
      if (!window.ttsConfig.enabled) {
        console.warn('TTS is disabled. Enable it first to test.');
        return;
      }

      const apiKey = window.config.services.xai?.apiKey;
      if (!apiKey) {
        return;
      }

      const testMessage = 'This is a test of the text-to-speech feature. How does this voice sound?';
      window.generateSpeech(testMessage).then((audioData) => {
        if (audioData && typeof window.playTtsAudio === 'function') {
          window.playTtsAudio(audioData);
        } else {
          console.error('TTS test failed. Check console for details.');
        }
      });
    });
  }

  if (window.stopTtsButton) {
    window.stopTtsButton.addEventListener('click', () => {
      if (typeof window.stopTtsAudio === 'function') {
        window.stopTtsAudio();
      }
    });
  }

  if (window.clearTtsCacheButton) {
    window.clearTtsCacheButton.addEventListener('click', () => {
      if (typeof window.clearTtsAudioResources === 'function') {
        window.clearTtsAudioResources();
      }
    });
  }

  window.addEventListener('beforeunload', () => {
    if (typeof window.clearTtsAudioResources === 'function') {
      window.clearTtsAudioResources();
    }
  });
}

