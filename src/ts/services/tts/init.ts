/**
 * TTS initialization.
 *
 * @remarks
 * Wires the TTS settings controls to their runtime state on startup.
 */

import { elements } from "../../init/state.ts";
import { ttsConfig } from "./config.ts";

/**
 * Wires the voice-selector change listener so it updates {@link ttsConfig.voice}.
 * The TTS DOM elements themselves are cached in `init/dom.ts`.
 */
export function initTtsReferences() {
  if (elements.ttsVoiceSelector) {
    elements.ttsVoiceSelector.addEventListener("change", (event) => {
      ttsConfig.voice = (event.target as HTMLSelectElement).value;
    });
  } else {
    console.warn("ttsVoiceSelector not found during initialization");
  }
}
