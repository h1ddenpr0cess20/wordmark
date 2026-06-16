/**
 * Defaults for the Party-mode setup form. The form (cast + scenario) and the
 * enable toggle are transient — nothing is persisted; Party mode starts off on
 * every load.
 */

import type { PartyConfig, PartyScenario } from "./partyTypes.ts";

/** Default scenario used for a fresh party. */
export function defaultScenario(): PartyScenario {
  return {
    topic: "",
    setting: "",
    mood: "friendly",
    conversationType: "conversation",
  };
}

/** Default (empty) party configuration. */
export function defaultPartyConfig(): PartyConfig {
  return {
    characters: [],
    scenario: defaultScenario(),
  };
}
