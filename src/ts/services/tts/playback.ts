import { ttsConfig, ttsRuntime, ttsSvgIcons } from "./config.ts";
import { ttsAudioResources } from "./resources.ts";
import { playNextMessageInQueue, playQueuedTtsMessage } from "./queue.ts";
import { state } from "../../init/state.ts";

export function stopTtsAudio() {
  if (!ttsRuntime.activeTtsAudio) {
    return;
  }

  try {
    ttsRuntime.activeTtsAudio.pause();
    ttsRuntime.activeTtsAudio.currentTime = 0;

    if (ttsRuntime.activeTtsAudioUrl) {
      ttsAudioResources.removeUrl(ttsRuntime.activeTtsAudioUrl);
      URL.revokeObjectURL(ttsRuntime.activeTtsAudioUrl);
      ttsRuntime.activeTtsAudioUrl = null;
    }

    ttsRuntime.activeTtsAudio = null;

    document.querySelectorAll(".tts-play-pause").forEach((btn: any) => {
      const svgContent = btn.innerHTML;
      if (svgContent.includes("pause") || !svgContent.includes("polygon")) {
        btn.innerHTML = ttsSvgIcons.play;
        btn.title = "Play voice";
        btn.setAttribute("aria-label", "Play voice");

        const statusText = btn.parentElement?.querySelector(".tts-status") as any;
        if (statusText && statusText.style.display === "inline") {
          statusText.textContent = "Stopped";
          setTimeout(() => {
            statusText.style.display = "none";
          }, 2000);
        }
      }
    });
  } catch (error) {
    console.error("Error stopping TTS audio:", error);
  }
}

export function playTtsAudio(audioData) {
  if (!audioData) {
    return;
  }

  try {
    stopTtsAudio();

    const audioBlob = new Blob([audioData], { type: "audio/wav" });
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    ttsRuntime.activeTtsAudio = audio;
    ttsRuntime.activeTtsAudioUrl = audioUrl;
    ttsAudioResources.addUrl(audioUrl, `test_audio_${Date.now()}`, audioData);

    audio.onended = () => {
      ttsAudioResources.removeUrl(audioUrl);
      URL.revokeObjectURL(audioUrl);
      ttsRuntime.activeTtsAudioUrl = null;
      ttsRuntime.activeTtsAudio = null;
    };

    audio.play().catch((error) => {
      console.error("Failed to play TTS audio:", error);
      ttsRuntime.activeTtsAudio = null;
      ttsRuntime.activeTtsAudioUrl = null;
      ttsAudioResources.removeUrl(audioUrl);
      URL.revokeObjectURL(audioUrl);
    });
  } catch (error) {
    console.error("Error playing TTS audio:", error);
  }
}

export function handleTtsAudioEnded(playPauseButton, statusText, audioUrl, isPlayingRef) {
  return function() {
    if (isPlayingRef) {
      isPlayingRef.isPlaying = false;
    }

    playPauseButton.innerHTML = ttsSvgIcons.play;
    playPauseButton.title = "Play voice";
    playPauseButton.setAttribute("aria-label", "Play voice");
    statusText.textContent = "Finished";
    statusText.style.display = "inline";
    setTimeout(() => {
      statusText.style.display = "none";
    }, 2000);

    ttsRuntime.activeTtsAudio = null;

    if (ttsRuntime.activeTtsAudioUrl === audioUrl) {
      ttsRuntime.activeTtsAudioUrl = null;
    }

    if (ttsConfig.autoplay) {
      setTimeout(() => playNextMessageInQueue(), 500);
    }
  };
}

export function handleAudioEnded() {
  if (state.verboseLogging) {
    console.info("Audio finished, checking for next message in queue");
  }
  ttsRuntime.activeTtsAudio = null;
  ttsRuntime.activeTtsAudioUrl = null;

  if (ttsConfig.autoplay && ttsRuntime.autoplayActive) {
    playQueuedTtsMessage();
  }
}

export function handleAudioError(event) {
  console.error("Audio playback error:", event);
  ttsRuntime.activeTtsAudio = null;
  ttsRuntime.activeTtsAudioUrl = null;

  if (ttsConfig.autoplay && ttsRuntime.autoplayActive) {
    console.error("Audio error, trying next message in queue");
    playQueuedTtsMessage();
  }
}
