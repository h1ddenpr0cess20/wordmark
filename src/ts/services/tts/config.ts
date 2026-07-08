/**
 * Text-to-speech configuration, shared runtime state, and voice catalog.
 */

import { icon } from "../../utils/icons.ts";

/** User-facing TTS settings (provider, voice, autoplay). */
export const ttsConfig = {
  enabled: false,
  provider: "openai",
  voice: "ash",
  instructions: "",
  autoplay: true,
};

/** Pre-rendered SVG markup for the TTS playback controls. */
export const ttsSvgIcons = {
  play: icon("play", { width: 14, height: 14 }).trim(),
  pause: icon("pause", { width: 14, height: 14 }).trim(),
  stop: icon("stop", { width: 14, height: 14 }).trim(),
  download: icon("download", { width: 14, height: 14 }).trim(),
};

/**
 * Mutable runtime state shared across the TTS modules.
 *
 * @remarks
 * ESM bindings can't be reassigned across module boundaries, so the changing
 * values live as fields on this shared object.
 */
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

/** Pending message texts queued for sequential TTS playback. */
export const ttsMessageQueue: string[] = [];

/** Selectable voices per provider, grouped by gender, for the settings UI. */
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
    neutral: [
      { id: "helix", name: "Helix", gender: "Neutral" },
      { id: "lumen", name: "Lumen", gender: "Neutral" },
      { id: "lux", name: "Lux", gender: "Neutral" },
      { id: "zenith", name: "Zenith", gender: "Neutral" },
    ],
    male: [
      { id: "leo", name: "Leo", gender: "Male" },
      { id: "rex", name: "Rex", gender: "Male" },
      { id: "sal", name: "Sal", gender: "Male" },
      { id: "altair", name: "Altair", gender: "Male" },
      { id: "atlas", name: "Atlas", gender: "Male" },
      { id: "castor", name: "Castor", gender: "Male" },
      { id: "cosmo", name: "Cosmo", gender: "Male" },
      { id: "helios", name: "Helios", gender: "Male" },
      { id: "kepler", name: "Kepler", gender: "Male" },
      { id: "naksh", name: "Naksh", gender: "Male" },
      { id: "orion", name: "Orion", gender: "Male" },
      { id: "perseus", name: "Perseus", gender: "Male" },
      { id: "rigel", name: "Rigel", gender: "Male" },
      { id: "sirius", name: "Sirius", gender: "Male" },
      { id: "zagan", name: "Zagan", gender: "Male" },
    ],
    female: [
      { id: "ara", name: "Ara", gender: "Female" },
      { id: "eve", name: "Eve", gender: "Female" },
      { id: "carina", name: "Carina", gender: "Female" },
      { id: "celeste", name: "Celeste", gender: "Female" },
      { id: "iris", name: "Iris", gender: "Female" },
      { id: "luna", name: "Luna", gender: "Female" },
      { id: "ursa", name: "Ursa", gender: "Female" },
    ],
  },
};
