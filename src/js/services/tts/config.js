// TTS configuration object and basic runtime state
window.ttsConfig = {
  enabled: false,
  voice: 'ash',
  instructions: '',
  autoplay: true,
};

// SVG Icons for TTS controls
window.ttsSvgIcons = {
  play: window.icon('play', { width: 14, height: 14 }).trim(),
  pause: window.icon('pause', { width: 14, height: 14 }).trim(),
  stop: window.icon('stop', { width: 14, height: 14 }).trim(),
  download: window.icon('download', { width: 14, height: 14 }).trim(),
};

// Runtime tracking
window.activeTtsAudio = null;
window.activeTtsAudioUrl = null;
window.ttsMessageQueue = [];
window.ttsAutoplayActive = false;
window.ttsErrorShown = false;

// Hint available voices to the UI
window.availableTtsVoices = {
  neutral: [
    { id: 'fable', name: 'Fable', gender: 'Neutral' },
  ],
  male: [
    { id: 'ash', name: 'Ash', gender: 'Male' },
    { id: 'ballad', name: 'Ballad', gender: 'Male' },
    { id: 'echo', name: 'Echo', gender: 'Male' },
    { id: 'onyx', name: 'Onyx', gender: 'Male' },
    { id: 'verse', name: 'Verse', gender: 'Male' },
  ],
  female: [
    { id: 'alloy', name: 'Alloy', gender: 'Female' },
    { id: 'coral', name: 'Coral', gender: 'Female' },
    { id: 'nova', name: 'Nova', gender: 'Female' },
    { id: 'sage', name: 'Sage', gender: 'Female' },
    { id: 'shimmer', name: 'Shimmer', gender: 'Female' },
  ],
};

// Lazy-load audio storage helpers if needed
document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.initAudioDb === 'undefined') {
    const script = document.createElement('script');
    try {
      script.src = new URL('../utils/audioStorage.js', import.meta.url).href;
    } catch {
      script.src = '/src/js/utils/audioStorage.js';
    }
    script.onload = () => {
      console.info('Audio storage module loaded');
    };
    script.onerror = (err) => {
      console.error('Failed to load audio storage module:', err);
    };
    document.head.appendChild(script);
  }

  const clearMemoryButton = document.getElementById('clear-memory');
  if (clearMemoryButton) {
    clearMemoryButton.addEventListener('click', () => {
      if (typeof window.clearTtsAudioResources === 'function') {
        window.clearTtsAudioResources();
      }
    });
  }
});
