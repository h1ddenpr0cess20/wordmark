/**
 * Text-to-speech event listeners.
 *
 * @remarks
 * Wires the TTS settings controls. Switching providers re-populates the voice
 * list and hides the instructions field for xAI, which does not support voice
 * instructions.
 */

import { elements } from "../state.ts";
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
  addTtsControlsToConversation,
  removeAllTtsControls,
} from "../../services/tts.ts";
import { config } from "../../../config/config.ts";
import { ttsSupportsInstructions } from "../../services/providers.ts";
import { initializeTts, populateTtsVoiceSelector } from "../ttsInitialization.ts";
import { updateFeatureStatus } from "../../components/settings.ts";

/** Wires the TTS enable/autoplay toggles, voice selector, and provider controls. */
export function setupTtsEventListeners() {
  if (elements.ttsToggle) {
    elements.ttsToggle.addEventListener("change", (event) => {
      if ((event.target as HTMLInputElement).checked) {
        ttsConfig.enabled = true;
        initializeTts();
        addTtsControlsToConversation();
      } else {
        ttsConfig.enabled = false;
        stopTtsAudio();
        removeAllTtsControls();
      }
      updateFeatureStatus();

    });
  }

  if (elements.ttsAutoplayToggle) {
    elements.ttsAutoplayToggle.addEventListener("change", (event) => {
      ttsConfig.autoplay = (event.target as HTMLInputElement).checked;
      if ((event.target as HTMLInputElement).checked && ttsMessageQueue.length > 0 && !ttsRuntime.activeTtsAudio) {
        ttsRuntime.autoplayActive = true;
        playNextMessageInQueue();
      }
    });
  }

  if (elements.ttsProviderSelector) {
    elements.ttsProviderSelector.addEventListener("change", (event) => {
      const providerSelect = event.target as HTMLSelectElement;
      ttsConfig.provider = (availableTtsVoices as Record<string, unknown>)?.[providerSelect.value] ? providerSelect.value : "openai";
      providerSelect.value = ttsConfig.provider;
      populateTtsVoiceSelector();
      const instructionsItem = elements.ttsInstructionsInput?.closest<HTMLElement>(".setting-item");
      if (instructionsItem) {
        instructionsItem.style.display = ttsSupportsInstructions(ttsConfig.provider) ? "" : "none";
      }
    });
  }

  if (elements.ttsVoiceSelector) {
    elements.ttsVoiceSelector.addEventListener("change", (event) => {
      ttsConfig.voice = (event.target as HTMLSelectElement).value;
    });
  }

  if (elements.ttsInstructionsInput) {
    elements.ttsInstructionsInput.addEventListener("change", (event) => {
      ttsConfig.instructions = (event.target as HTMLTextAreaElement).value;
    });
  }

  if (elements.testTtsButton) {
    elements.testTtsButton.addEventListener("click", () => {
      if (!ttsConfig.enabled) {
        console.warn("TTS is disabled. Enable it first to test.");
        return;
      }

      const provider = (availableTtsVoices as Record<string, unknown>)?.[ttsConfig.provider] ? ttsConfig.provider : "openai";
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
