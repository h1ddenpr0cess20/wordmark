/**
 * TTS initialization for the chatbot application
 */

import { setupMobileKeyboardHandling } from "../utils/mobileHandling.js";
import { ttsConfig, availableTtsVoices, initTtsReferences } from "../services/tts.js";

/**
 * Initialize TTS functionality
 */
export function initializeTts() {
  if (!ttsConfig) return;

  // Initialize TTS provider selector
  if (window.ttsProviderSelector) {
    const provider = availableTtsVoices?.[ttsConfig.provider] ? ttsConfig.provider : "openai";
    ttsConfig.provider = provider;
    window.ttsProviderSelector.value = provider;
  }

  // Populate TTS voice selector
  populateTtsVoiceSelector();

  // Initialize TTS toggle state
  if (window.ttsToggle) {
    window.ttsToggle.checked = ttsConfig.enabled;
  }

  // Initialize TTS autoplay toggle state
  if (window.ttsAutoplayToggle) {
    window.ttsAutoplayToggle.checked = ttsConfig.autoplay;
  }

  // Initialize TTS instructions
  if (window.ttsInstructionsInput) {
    window.ttsInstructionsInput.value = ttsConfig.instructions || "";
    // xAI TTS doesn't support voice instructions
    const instructionsItem = window.ttsInstructionsInput.closest(".setting-item");
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
  if (window.ttsVoiceSelector && availableTtsVoices && ttsConfig) {
    window.ttsVoiceSelector.innerHTML = "";

    const provider = ttsConfig.provider || "openai";
    const voices = availableTtsVoices[provider];
    if (!voices) return;

    const categories = ["neutral", "male", "female"];
    const labels = { neutral: "Neutral", male: "Male", female: "Female" };

    for (const category of categories) {
      if (voices[category] && voices[category].length > 0) {
        const group = document.createElement("optgroup");
        group.label = labels[category];
        voices[category].forEach(voice => {
          const option = document.createElement("option");
          option.value = voice.id;
          option.textContent = voice.name;
          group.appendChild(option);
        });
        window.ttsVoiceSelector.appendChild(group);
      }
    }

    // If current voice isn't in the new provider's list, select the first available
    const allVoiceIds = categories.flatMap(c => (voices[c] || []).map(v => v.id));
    if (!allVoiceIds.includes(ttsConfig.voice)) {
      ttsConfig.voice = allVoiceIds[0] || "";
    }
    window.ttsVoiceSelector.value = ttsConfig.voice;
  }
}

/**
 * Initialize mobile keyboard handling
 */
export function initializeMobileKeyboardHandling() {
  if (typeof setupMobileKeyboardHandling === "function") {
    setupMobileKeyboardHandling();
    if (window.VERBOSE_LOGGING) {
      console.info("Mobile keyboard handling initialized.");
    }
  } else {
    console.warn("Mobile keyboard handling function not available");
  }
}
