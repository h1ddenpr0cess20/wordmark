/**
 * Builds the query used for local document retrieval.
 *
 * @remarks
 * Retrieval embeds the query and matches it against indexed chunks. A follow-up
 * message on its own ("what about its pricing?", "summarize that section") is a
 * poor retrieval query because its referents live in earlier turns. This module
 * prepends a little recent user intent so follow-ups resolve to the right
 * chunks, while keeping the current message as the dominant, last-read signal.
 */

import type { Message, ContentPart } from "../../types/api.ts";
import { isDocumentInventoryQuery } from "../services/localDocRetrieval.ts";

const MAX_PRIOR_TURNS = 2;
const MAX_CHARS_PER_TURN = 300;

/** Flattens a message's content into plain text, ignoring non-text parts. */
export function extractMessageText(content: Message["content"]): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part: ContentPart) => (part && typeof part === "object" && typeof part.text === "string" ? part.text.trim() : ""))
      .filter(text => text)
      .join(" ")
      .trim();
  }
  if (content && typeof content === "object" && typeof (content as ContentPart).text === "string") {
    return ((content as ContentPart).text as string).trim();
  }
  return "";
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Produces a retrieval query from the conversation, prepending up to
 * {@link MAX_PRIOR_TURNS} recent user turns (each truncated) ahead of the
 * current message so follow-ups carry their context. The current message is
 * always placed last so it dominates the embedding. Inventory-style turns
 * ("what files are attached?") are self-contained and excluded as context.
 *
 * @param history - The conversation so far; the last user message is the current turn.
 * @param currentMessage - The message being sent this turn.
 * @returns The query string to embed for retrieval.
 */
export function buildRetrievalQuery(history: Message[], currentMessage: string): string {
  const current = currentMessage.trim();
  if (!current || !Array.isArray(history)) return currentMessage;
  if (isDocumentInventoryQuery(current)) return current;

  const priorUserTexts: string[] = [];
  for (const msg of history) {
    if (msg && msg.role === "user") {
      priorUserTexts.push(extractMessageText(msg.content));
    }
  }

  const priors = priorUserTexts
    .slice(0, -1)
    .filter(text => text && text !== current && !isDocumentInventoryQuery(text));
  if (priors.length === 0) return current;

  const recent = priors.slice(-MAX_PRIOR_TURNS).map(text => truncate(text, MAX_CHARS_PER_TURN));
  return `${recent.join("\n")}\n${current}`;
}
