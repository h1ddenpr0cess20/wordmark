import { ttsConfig } from "./config.js";

// DOM references (ttsVoiceSelector, ttsToggle, ...) are owned by init/dom.js and
// read off window where needed; this only wires the voice-change listener.
export function initTtsReferences() {
  if (window.ttsVoiceSelector) {
    window.ttsVoiceSelector.addEventListener("change", (event) => {
      ttsConfig.voice = event.target.value;
    });
  } else {
    console.warn("ttsVoiceSelector not found during initialization");
  }
}
