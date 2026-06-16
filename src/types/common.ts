/**
 * Shared domain types for persisted records (conversations, gallery media).
 */

import type { Message } from "./api.ts";
import type { PartyCharacter, PartyScenario } from "../ts/services/party/partyTypes.ts";

/** A conversation as persisted in IndexedDB. */
export interface ConversationRecord {
  id?: string;
  name?: string;
  created?: string;
  updated?: string;
  messages?: Message[];
  images?: GeneratedImage[];
  systemPrompt?: { type: string; content: string };
  model?: string;
  service?: string;
  /** Chat mode; `"party"` marks a multi-character party conversation. */
  mode?: "party";
  /** Party mode: the cast that produced this transcript. */
  characters?: PartyCharacter[];
  /** Party mode: the scenario the conversation ran under. */
  scenario?: PartyScenario;
  /** Party mode: what the characters called the user. */
  userName?: string;
  [key: string]: unknown;
}

/** A generated or uploaded image/media record tracked in app state and the gallery. */
export interface GeneratedImage {
  filename?: string;
  url?: string;
  dataUrl?: string | null;
  data?: string;
  prompt?: string;
  timestamp?: string | number;
  mimeType?: string;
  type?: string;
  [key: string]: unknown;
}
