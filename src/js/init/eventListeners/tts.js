export function setupTtsEventListeners() {
  if (window.ttsToggle) {
    window.ttsToggle.addEventListener('change', async(event) => {
      if (event.target.checked) {
        if (typeof window.loadTtsModule === 'function' && !window.lazyModulesLoaded?.tts) {
          await window.loadTtsModule();
        }
        window.ttsConfig = window.ttsConfig || { enabled: false, voice: 'ash', instructions: '', autoplay: true };
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
    });
  }

  if (window.ttsAutoplayToggle) {
    window.ttsAutoplayToggle.addEventListener('change', (event) => {
      window.ttsConfig = window.ttsConfig || { enabled: false, voice: 'ash', instructions: '', autoplay: true };
      window.ttsConfig.autoplay = event.target.checked;
      if (event.target.checked && window.ttsMessageQueue && window.ttsMessageQueue.length > 0 && !window.activeTtsAudio) {
        window.ttsAutoplayActive = true;
        if (typeof window.playNextMessageInQueue === 'function') {
          window.playNextMessageInQueue();
        }
      }
    });
  }

  if (window.ttsVoiceSelector) {
    window.ttsVoiceSelector.addEventListener('change', (event) => {
      window.ttsConfig = window.ttsConfig || { enabled: false, voice: 'ash', instructions: '', autoplay: true };
      window.ttsConfig.voice = event.target.value;
    });
  }

  if (window.ttsInstructionsInput) {
    window.ttsInstructionsInput.addEventListener('change', (event) => {
      window.ttsConfig = window.ttsConfig || { enabled: false, voice: 'ash', instructions: '', autoplay: true };
      window.ttsConfig.instructions = event.target.value;
    });
  }

  if (window.testTtsButton) {
    window.testTtsButton.addEventListener('click', () => {
      window.ttsConfig = window.ttsConfig || { enabled: false, voice: 'ash', instructions: '', autoplay: true };
      if (!window.ttsConfig.enabled) {
        console.warn('TTS is disabled. Enable it first to test.');
        return;
      }

      const openaiApiKey = window.config.services.openai?.apiKey;
      if (!openaiApiKey) {
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

