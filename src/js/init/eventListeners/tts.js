import { elements } from "../state.js";
import {
  ttsConfig,
  availableTtsVoices,
  ttsRuntime,
  ttsMessageQueue,
  generateSpeech,
  playTtsAudio,
  stopTtsAudio,
  clearTtsAudioResources,
  playNextMessageInQueue,
} from "../../services/tts.js";
import { config } from "../../../config/config.js";
import { initializeTts, populateTtsVoiceSelector } from "../ttsInitialization.js";
import { updateFeatureStatus } from "../../components/settings.js";

export function setupTtsEventListeners() {
  if (elements.ttsToggle) {
    elements.ttsToggle.addEventListener("change", (event) => {
      if (event.target.checked) {
        ttsConfig.enabled = true;
        initializeTts();
      } else {
        ttsConfig.enabled = false;
        stopTtsAudio();
      }
                  updateFeatureStatus();
    
    });
  }

  if (elements.ttsAutoplayToggle) {
    elements.ttsAutoplayToggle.addEventListener("change", (event) => {
      ttsConfig.autoplay = event.target.checked;
      if (event.target.checked && ttsMessageQueue.length > 0 && !ttsRuntime.activeTtsAudio) {
        ttsRuntime.autoplayActive = true;
        playNextMessageInQueue();
      }
    });
  }

  if (elements.ttsProviderSelector) {
    elements.ttsProviderSelector.addEventListener("change", (event) => {
      ttsConfig.provider = availableTtsVoices?.[event.target.value] ? event.target.value : "openai";
      event.target.value = ttsConfig.provider;
      populateTtsVoiceSelector();
      // xAI TTS doesn't support voice instructions
      const instructionsItem = elements.ttsInstructionsInput?.closest(".setting-item");
      if (instructionsItem) {
        instructionsItem.style.display = ttsConfig.provider === "xai" ? "none" : "";
      }
    });
  }

  if (elements.ttsVoiceSelector) {
    elements.ttsVoiceSelector.addEventListener("change", (event) => {
      ttsConfig.voice = event.target.value;
    });
  }

  if (elements.ttsInstructionsInput) {
    elements.ttsInstructionsInput.addEventListener("change", (event) => {
      ttsConfig.instructions = event.target.value;
    });
  }

  if (elements.testTtsButton) {
    elements.testTtsButton.addEventListener("click", () => {
      if (!ttsConfig.enabled) {
        console.warn("TTS is disabled. Enable it first to test.");
        return;
      }

      const provider = availableTtsVoices?.[ttsConfig.provider] ? ttsConfig.provider : "openai";
      ttsConfig.provider = provider;
      const apiKey = provider === "xai"
        ? config.services.xai?.apiKey
        : config.services.openai?.apiKey;
      if (!apiKey) {
        return;
      }

      const testMessage = "This is a test of the text-to-speech feature. How does this voice sound?";
      generateSpeech(testMessage).then((audioData) => {
        if (audioData) {
          playTtsAudio(audioData);
        } else {
          console.error("TTS test failed. Check console for details.");
        }
      });
    });
  }

  if (elements.stopTtsButton) {
    elements.stopTtsButton.addEventListener("click", () => {
      stopTtsAudio();
    });
  }

  if (elements.clearTtsCacheButton) {
    elements.clearTtsCacheButton.addEventListener("click", () => {
      clearTtsAudioResources();
    });
  }

  window.addEventListener("beforeunload", () => {
    clearTtsAudioResources();
  });
}
