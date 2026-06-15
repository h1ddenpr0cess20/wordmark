/**
 * TTS audio resource registry.
 *
 * @remarks
 * Tracks generated object URLs and their backing audio data per message,
 * persisting playable audio to IndexedDB and revoking URLs on cleanup.
 */

import { saveAudioToDb } from "../../utils/storage/audioStorage.ts";
import { ttsConfig, ttsRuntime } from "./config.ts";
import { stopTtsAudio } from "./playback.ts";
import { state } from "../../init/state.ts";

interface TtsAudioResource {
  url: string;
  timestamp: number;
  audioData: ArrayBuffer;
}

/** Per-message store of generated TTS audio URLs and their backing data. */
export const ttsAudioResources = {
  activeUrls: new Map<string, TtsAudioResource>(),

  addUrl(url: string, messageId: string, audioData: ArrayBuffer) {
    this.activeUrls.set(messageId, {
      url,
      timestamp: Date.now(),
      audioData,
    });

    if (audioData) {
      const messageElement = document.getElementById(messageId);
      let text = "";
      let voice = ttsConfig.voice;

      if (messageElement) {
        const controlsContainer = messageElement.querySelector(".tts-controls");
        if (controlsContainer) {
          text = controlsContainer.getAttribute("data-original-text") || "";
          voice = controlsContainer.getAttribute("data-voice") || voice;
        }
      }

      saveAudioToDb(audioData, messageId, text, voice).catch((err) => {
        console.error("Failed to save audio to IndexedDB:", err);
      });
    }
  },

  removeUrl(url: string) {
    for (const [messageId, data] of this.activeUrls.entries()) {
      if (data.url === url) {
        this.activeUrls.delete(messageId);
        break;
      }
    }
  },

  getUrl(messageId: string) {
    const data = this.activeUrls.get(messageId);
    return data ? data.url : null;
  },

  getAudioData(messageId: string) {
    const data = this.activeUrls.get(messageId);
    return data ? data.audioData : null;
  },

  clearAll() {
    const currentlyPlaying = ttsRuntime.activeTtsAudioUrl;
    const urlsToRevoke: string[] = [];

    for (const [messageId, data] of this.activeUrls.entries()) {
      if (data.url !== currentlyPlaying) {
        urlsToRevoke.push(data.url);
        this.activeUrls.delete(messageId);
      }
    }

    urlsToRevoke.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error("Error revoking URL:", error);
      }
    });

    if (state.verboseLogging) {
      console.info("Cleared all stored audio resources");
    }
  },
};

/** Stops playback and releases all cached TTS audio URLs/blobs. */
export function clearTtsAudioResources() {
  stopTtsAudio();
  ttsAudioResources.clearAll();

  if (state.verboseLogging) {
    console.info("All audio resources cleared");
  }
}
