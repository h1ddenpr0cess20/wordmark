/**
 * Canonical marker and cleanup helpers for locally-retrieved document context.
 *
 * @remarks
 * The retrieval flow attaches document chunks to a user message via its
 * `retrievedContext` field (never `content`). Conversations saved before that
 * change have the block appended directly to the stored user content; the
 * strip helpers remove those legacy blocks when a conversation is loaded.
 */

import type { ContentPart, Message } from "../../types/api.ts";

/** Heading line the retrieval flow prefixes to injected document context. */
export const RETRIEVED_CONTEXT_MARKER = "Relevant context from attached documents:";

/** Removes a legacy retrieved-context block from a user message string. */
export function stripRetrievedContextText(content: string): string {
  const index = content.indexOf(RETRIEVED_CONTEXT_MARKER);
  if (index === -1) {
    return content;
  }
  return content.slice(0, index).trimEnd();
}

/**
 * Returns a copy of `messages` with legacy retrieved-context blocks removed
 * from user message content (string bodies and `input_text` parts alike).
 */
export function stripRetrievedContextFromMessages(messages: Message[]): Message[] {
  return messages.map((msg) => {
    if (!msg || msg.role !== "user") {
      return msg;
    }
    if (typeof msg.content === "string") {
      if (!msg.content.includes(RETRIEVED_CONTEXT_MARKER)) {
        return msg;
      }
      return { ...msg, content: stripRetrievedContextText(msg.content) };
    }
    if (Array.isArray(msg.content)) {
      const hasContextPart = msg.content.some((part: ContentPart) =>
        part && typeof part.text === "string" && part.text.startsWith(RETRIEVED_CONTEXT_MARKER));
      if (!hasContextPart) {
        return msg;
      }
      return {
        ...msg,
        content: msg.content.filter((part: ContentPart) =>
          !(part && typeof part.text === "string" && part.text.startsWith(RETRIEVED_CONTEXT_MARKER))),
      };
    }
    return msg;
  });
}
