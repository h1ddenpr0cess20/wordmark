// Aggregated TTS module API. Importing this (eagerly) pulls in the full TTS
// cluster; consumers import the named exports they need from here.
export { ttsConfig, ttsSvgIcons, ttsRuntime, ttsMessageQueue, availableTtsVoices } from "./tts/config.ts";
export { ttsAudioResources, clearTtsAudioResources } from "./tts/resources.ts";
export { initTtsReferences } from "./tts/init.ts";
export { generateSpeech } from "./tts/api.ts";
export {
  stopTtsAudio,
  playTtsAudio,
  handleTtsAudioEnded,
  handleAudioEnded,
  handleAudioError,
} from "./tts/playback.ts";
export { shouldSkipTts } from "./tts/filters.ts";
export {
  playNextMessageInQueue,
  addMessageToTtsQueue,
  startTtsAutoplay,
  stopTtsAutoplay,
  playQueuedTtsMessage,
} from "./tts/queue.ts";
export {
  generateTtsForMessage,
  addPlaceholderTtsControls,
  addTtsControlsToMessage,
} from "./tts/controls.ts";
