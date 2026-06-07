import { icon } from "../../utils/icons.js";
// TTS configuration object and basic runtime state
window.ttsConfig = {
  enabled: false,
  provider: 'openai',
  voice: 'ash',
  instructions: '',
  autoplay: true,
};

// SVG Icons for TTS controls
window.ttsSvgIcons = {
  play: icon('play', { width: 14, height: 14 }).trim(),
  pause: icon('pause', { width: 14, height: 14 }).trim(),
  stop: icon('stop', { width: 14, height: 14 }).trim(),
  download: icon('download', { width: 14, height: 14 }).trim(),
};

// Runtime tracking
window.activeTtsAudio = null;
window.activeTtsAudioUrl = null;
window.ttsMessageQueue = [];
window.ttsAutoplayActive = false;
window.ttsErrorShown = false;

// Hint available voices to the UI (per provider)
window.availableTtsVoices = {
  openai: {
    neutral: [
      { id: 'fable', name: 'Fable', gender: 'Neutral' },
    ],
    male: [
      { id: 'ash', name: 'Ash', gender: 'Male' },
      { id: 'ballad', name: 'Ballad', gender: 'Male' },
      { id: 'cedar', name: 'Cedar', gender: 'Male' },
      { id: 'echo', name: 'Echo', gender: 'Male' },
      { id: 'onyx', name: 'Onyx', gender: 'Male' },
      { id: 'verse', name: 'Verse', gender: 'Male' },
    ],
    female: [
      { id: 'alloy', name: 'Alloy', gender: 'Female' },
      { id: 'coral', name: 'Coral', gender: 'Female' },
      { id: 'marin', name: 'Marin', gender: 'Female' },
      { id: 'nova', name: 'Nova', gender: 'Female' },
      { id: 'sage', name: 'Sage', gender: 'Female' },
      { id: 'shimmer', name: 'Shimmer', gender: 'Female' },
    ],
  },
  xai: {
    male: [
      { id: 'leo', name: 'Leo', gender: 'Male' },
      { id: 'rex', name: 'Rex', gender: 'Male' },
      { id: 'sal', name: 'Sal', gender: 'Male' },
    ],
    female: [
      { id: 'ara', name: 'Ara', gender: 'Female' },
      { id: 'eve', name: 'Eve', gender: 'Female' },
    ],
  },
};

// Audio storage (audioStorage.js) is imported by the TTS modules that use it.
document.addEventListener('DOMContentLoaded', () => {
  const clearMemoryButton = document.getElementById('clear-memory');
  if (clearMemoryButton) {
    clearMemoryButton.addEventListener('click', () => {
      if (typeof window.clearTtsAudioResources === 'function') {
        window.clearTtsAudioResources();
      }
    });
  }
});
