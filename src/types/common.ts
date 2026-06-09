// Shared domain types for persisted records (conversations, gallery media).

import type { Message } from "./api.ts";

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
