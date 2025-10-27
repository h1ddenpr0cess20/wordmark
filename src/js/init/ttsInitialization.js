/**
 * TTS initialization for the chatbot application
 */

/**
 * Initialize TTS functionality
 */
function initializeTts() {
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
  }

  // Share references with TTS service
  if (window.initTtsReferences) {
    window.initTtsReferences({
      ttsToggle: window.ttsToggle,
      ttsAutoplayToggle: window.ttsAutoplayToggle,
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
  if (window.ttsVoiceSelector && window.availableTtsVoices) {
    // Clear existing options
    window.ttsVoiceSelector.innerHTML = "";

    // Add categorized voices with optgroups
    const voices = window.availableTtsVoices;

    // Add Neutral voices
    if (voices.neutral && voices.neutral.length > 0) {
      const neutralGroup = document.createElement("optgroup");
      neutralGroup.label = "Neutral";
      voices.neutral.forEach(voice => {
        const option = document.createElement("option");
        option.value = voice.id;
        option.textContent = voice.name;
        neutralGroup.appendChild(option);
      });
      window.ttsVoiceSelector.appendChild(neutralGroup);
    }

    // Add Male voices
    if (voices.male && voices.male.length > 0) {
      const maleGroup = document.createElement("optgroup");
      maleGroup.label = "Male";
      voices.male.forEach(voice => {
        const option = document.createElement("option");
        option.value = voice.id;
        option.textContent = voice.name;
        maleGroup.appendChild(option);
      });
      window.ttsVoiceSelector.appendChild(maleGroup);
    }

    // Add Female voices
    if (voices.female && voices.female.length > 0) {
      const femaleGroup = document.createElement("optgroup");
      femaleGroup.label = "Female";
      voices.female.forEach(voice => {
        const option = document.createElement("option");
        option.value = voice.id;
        option.textContent = voice.name;
        femaleGroup.appendChild(option);
      });
      window.ttsVoiceSelector.appendChild(femaleGroup);
    }

    // Set default voice
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
