/**
 * TTS initialization for the chatbot application
 */

import { elements, state } from "./state.ts";
import { setupMobileKeyboardHandling } from "../utils/mobileHandling.ts";
import { ttsConfig, availableTtsVoices, initTtsReferences } from "../services/tts.ts";

interface TtsVoice {
  id: string;
  name: string;
  gender?: string;
}

/**
 * Initialize TTS functionality
 */
export function initializeTts() {
  if (!ttsConfig) return;

  // Initialize TTS provider selector
  if (elements.ttsProviderSelector) {
    const provider = (availableTtsVoices as Record<string, unknown>)?.[ttsConfig.provider] ? ttsConfig.provider : "openai";
    ttsConfig.provider = provider;
    elements.ttsProviderSelector.value = provider;
  }

  // Populate TTS voice selector
  populateTtsVoiceSelector();

  // Initialize TTS toggle state
  if (elements.ttsToggle) {
    elements.ttsToggle.checked = ttsConfig.enabled;
  }

  // Initialize TTS autoplay toggle state
  if (elements.ttsAutoplayToggle) {
    elements.ttsAutoplayToggle.checked = ttsConfig.autoplay;
  }

  // Initialize TTS instructions
  if (elements.ttsInstructionsInput) {
    elements.ttsInstructionsInput.value = ttsConfig.instructions || "";
    // xAI TTS doesn't support voice instructions
    const instructionsItem = elements.ttsInstructionsInput.closest<HTMLElement>(".setting-item");
    if (instructionsItem) {
      instructionsItem.style.display = (ttsConfig.provider || "openai") === "xai" ? "none" : "";
    }
  }

  // Wire the TTS voice-change listener.
  initTtsReferences();
}

/**
 * Populate the TTS voice selector with available voices
 */
export function populateTtsVoiceSelector() {
  if (elements.ttsVoiceSelector && availableTtsVoices && ttsConfig) {
    elements.ttsVoiceSelector.innerHTML = "";

    const provider = ttsConfig.provider || "openai";
    const voices = (availableTtsVoices as Record<string, Record<string, TtsVoice[]>>)[provider];
    if (!voices) return;

    const categories = ["neutral", "male", "female"];
    const labels: Record<string, string> = { neutral: "Neutral", male: "Male", female: "Female" };

    for (const category of categories) {
      if (voices[category] && voices[category].length > 0) {
        const group = document.createElement("optgroup");
        group.label = labels[category];
        voices[category].forEach((voice: TtsVoice) => {
          const option = document.createElement("option");
          option.value = voice.id;
          option.textContent = voice.name;
          group.appendChild(option);
        });
        elements.ttsVoiceSelector.appendChild(group);
      }
    }

    // If current voice isn't in the new provider's list, select the first available
    const allVoiceIds = categories.flatMap(c => (voices[c] || []).map((v: TtsVoice) => v.id));
    if (!allVoiceIds.includes(ttsConfig.voice)) {
      ttsConfig.voice = allVoiceIds[0] || "";
    }
    elements.ttsVoiceSelector.value = ttsConfig.voice;
  }
}

/**
 * Initialize mobile keyboard handling
 */
export function initializeMobileKeyboardHandling() {
  setupMobileKeyboardHandling();
  if (state.verboseLogging) {
    console.info("Mobile keyboard handling initialized.");
  }
}
