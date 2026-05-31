/**
 * TTS initialization for the chatbot application
 */

/**
 * Initialize TTS functionality
 */
function initializeTts() {
  if (!window.ttsConfig) return;

  // Initialize TTS provider selector
  if (window.ttsProviderSelector) {
    const provider = window.availableTtsVoices?.[window.ttsConfig.provider] ? window.ttsConfig.provider : "openai";
    window.ttsConfig.provider = provider;
    window.ttsProviderSelector.value = provider;
  }

  // Populate TTS voice selector
  populateTtsVoiceSelector();

  // Initialize TTS toggle state
  if (window.ttsToggle) {
    window.ttsToggle.checked = window.ttsConfig.enabled;
  }

  // Initialize TTS autoplay toggle state
  if (window.ttsAutoplayToggle) {
    window.ttsAutoplayToggle.checked = window.ttsConfig.autoplay;
  }

  // Initialize TTS instructions
  if (window.ttsInstructionsInput) {
    window.ttsInstructionsInput.value = window.ttsConfig.instructions || "";
    const instructionsItem = window.ttsInstructionsInput.closest(".setting-item");
    if (instructionsItem) {
      instructionsItem.style.display = "";
    }
  }

  // Share references with TTS service
  if (window.initTtsReferences) {
    window.initTtsReferences({
      ttsToggle: window.ttsToggle,
      ttsAutoplayToggle: window.ttsAutoplayToggle,
      ttsProviderSelector: window.ttsProviderSelector,
      ttsVoiceSelector: window.ttsVoiceSelector,
      ttsInstructionsInput: window.ttsInstructionsInput,
      personalityInput: window.personalityInput,
      personalityPromptRadio: window.personalityPromptRadio,
    });
  } else {
    console.warn("initTtsReferences function not found. TTS may not work properly.");
  }
}

/**
 * Populate the TTS voice selector with available voices
 */
function populateTtsVoiceSelector() {
  if (window.ttsVoiceSelector && window.availableTtsVoices && window.ttsConfig) {
    window.ttsVoiceSelector.innerHTML = "";

    const provider = window.ttsConfig.provider || "openai";
    const voices = window.availableTtsVoices[provider];
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
    if (!allVoiceIds.includes(window.ttsConfig.voice)) {
      window.ttsConfig.voice = allVoiceIds[0] || "";
    }
    window.ttsVoiceSelector.value = window.ttsConfig.voice;
  }
}

/**
 * Initialize mobile keyboard handling
 */
function initializeMobileKeyboardHandling() {
  if (typeof window.setupMobileKeyboardHandling === "function") {
    window.setupMobileKeyboardHandling();
    if (window.VERBOSE_LOGGING) {
      console.info("Mobile keyboard handling initialized.");
    }
  } else {
    console.warn("Mobile keyboard handling function not available");
  }
}

// Make functions available globally
window.initializeTts = initializeTts;
window.populateTtsVoiceSelector = populateTtsVoiceSelector;
window.initializeMobileKeyboardHandling = initializeMobileKeyboardHandling;
