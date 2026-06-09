import { icon } from "../../utils/icons.ts";

// TTS configuration object and basic runtime state
export const ttsConfig = {
  enabled: false,
  provider: "openai",
  voice: "ash",
  instructions: "",
  autoplay: true,
};

// SVG Icons for TTS controls
export const ttsSvgIcons = {
  play: icon("play", { width: 14, height: 14 }).trim(),
  pause: icon("pause", { width: 14, height: 14 }).trim(),
  stop: icon("stop", { width: 14, height: 14 }).trim(),
  download: icon("download", { width: 14, height: 14 }).trim(),
};

// Mutable runtime tracking shared across the TTS modules. ESM imports can't be
// reassigned across module boundaries, so the changing values live as fields on
// this shared object.
export const ttsRuntime: {
  activeTtsAudio: HTMLAudioElement | null;
  activeTtsAudioUrl: string | null;
  autoplayActive: boolean;
  errorShown: boolean;
} = {
  activeTtsAudio: null,
  activeTtsAudioUrl: null,
  autoplayActive: false,
  errorShown: false,
};

export const ttsMessageQueue: string[] = [];

// Hint available voices to the UI (per provider)
export const availableTtsVoices = {
  openai: {
    neutral: [
      { id: "fable", name: "Fable", gender: "Neutral" },
    ],
    male: [
      { id: "ash", name: "Ash", gender: "Male" },
      { id: "ballad", name: "Ballad", gender: "Male" },
      { id: "cedar", name: "Cedar", gender: "Male" },
      { id: "echo", name: "Echo", gender: "Male" },
      { id: "onyx", name: "Onyx", gender: "Male" },
      { id: "verse", name: "Verse", gender: "Male" },
    ],
    female: [
      { id: "alloy", name: "Alloy", gender: "Female" },
      { id: "coral", name: "Coral", gender: "Female" },
      { id: "marin", name: "Marin", gender: "Female" },
      { id: "nova", name: "Nova", gender: "Female" },
      { id: "sage", name: "Sage", gender: "Female" },
      { id: "shimmer", name: "Shimmer", gender: "Female" },
    ],
  },
  xai: {
    male: [
      { id: "leo", name: "Leo", gender: "Male" },
      { id: "rex", name: "Rex", gender: "Male" },
      { id: "sal", name: "Sal", gender: "Male" },
    ],
    female: [
      { id: "ara", name: "Ara", gender: "Female" },
      { id: "eve", name: "Eve", gender: "Female" },
    ],
  },
};
