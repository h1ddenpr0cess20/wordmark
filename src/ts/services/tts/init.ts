import { elements } from "../../init/state.ts";
import { ttsConfig } from "./config.ts";

// DOM references (ttsVoiceSelector, ttsToggle, ...) are owned by init/dom.js and
// read off window where needed; this only wires the voice-change listener.
export function initTtsReferences() {
  if (elements.ttsVoiceSelector) {
    elements.ttsVoiceSelector.addEventListener("change", (event) => {
      ttsConfig.voice = (event.target as HTMLSelectElement).value;
    });
  } else {
    console.warn("ttsVoiceSelector not found during initialization");
  }
}
