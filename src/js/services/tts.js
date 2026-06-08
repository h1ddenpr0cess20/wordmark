// Aggregated TTS module API. Importing this (eagerly) pulls in the full TTS
// cluster; consumers import the named exports they need from here.
export { ttsConfig, ttsSvgIcons, ttsRuntime, ttsMessageQueue, availableTtsVoices } from "./tts/config.js";
export { ttsAudioResources, clearTtsAudioResources } from "./tts/resources.js";
export { initTtsReferences } from "./tts/init.js";
export { generateSpeech } from "./tts/api.js";
export {
  stopTtsAudio,
  playTtsAudio,
  handleTtsAudioEnded,
  handleAudioEnded,
  handleAudioError,
} from "./tts/playback.js";
export { shouldSkipTts } from "./tts/filters.js";
export {
  playNextMessageInQueue,
  addMessageToTtsQueue,
  startTtsAutoplay,
  stopTtsAutoplay,
  playQueuedTtsMessage,
} from "./tts/queue.js";
export {
  generateTtsForMessage,
  addPlaceholderTtsControls,
  addTtsControlsToMessage,
} from "./tts/controls.js";
