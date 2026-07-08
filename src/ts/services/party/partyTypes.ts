/**
 * Type definitions for Party mode: a multi-character agentic group chat where
 * several AI personas converse autonomously and the user can interject at any
 * time. All characters share the globally selected provider + model; only
 * persona, name, label color, optional temperature, and per-tool selection
 * differ between them.
 */

/** A single AI persona participating in a party conversation. */
export interface PartyCharacter {
  /** Stable id used for speaker bookkeeping. */
  id: string;
  /** Display name shown on the message label and used in transcript history. */
  name: string;
  /** Persona description injected as the character's system prompt. */
  persona: string;
  /** Optional per-character sampling temperature. */
  temperature?: number;
  /**
   * Catalog keys (from `getToolCatalog()`) of the tools this character may use.
   * An empty array means the character runs tool-free.
   */
  allowedTools: string[];
}

/**
 * A document the observer shared into the party. Its extracted text is injected
 * into every character's system prompt so all characters can draw on it.
 */
export interface PartyDocument {
  /** Original file name, shown to the characters as the document's heading. */
  name: string;
  /** Plain text extracted from the file client-side. */
  text: string;
}

/** The shared scenario framing the conversation. */
export interface PartyScenario {
  topic: string;
  setting: string;
  mood: string;
  /** Kind of exchange (e.g. "conversation", "debate"); interpolated verbatim into the turn prompts. */
  conversationType: string;
}

/** Party configuration: the cast, the scenario, and what the cast calls the user. */
export interface PartyConfig {
  characters: PartyCharacter[];
  scenario: PartyScenario;
  /** What the characters call the user (defaults to `DEFAULT_USER_NAME`, "Observer"). */
  userName?: string;
  /** Documents the observer has shared into the conversation's context. */
  documents?: PartyDocument[];
}
