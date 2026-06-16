/**
 * Token estimation and history-window trimming.
 *
 * @remarks
 * A lightweight, provider-agnostic token estimator (using a ~4-chars-per-token
 * heuristic) plus the budget-based windowing used to cap per-request history
 * cost. Kept separate from message serialization in {@link ./messageUtils.ts}
 * so the math stays pure and independently testable.
 */

import type { Message } from "../../../types/api.ts";

/**
 * Estimates the token count of a string using a ~4-chars-per-token heuristic.
 *
 * @param text - The text to measure.
 * @returns The estimated token count.
 */
export function estimateTokens(text: unknown): number {
  if (!text) {
    return 0;
  }
  return Math.ceil(`${text}`.length / 4);
}

/**
 * Estimate the token cost of a single conversation message, including a small
 * fixed overhead for the role/structure envelope.
 *
 * @param message - The conversation message to measure.
 * @returns The estimated token count.
 */
export function estimateMessageTokens(message: Message): number {
  if (!message || typeof message !== "object") {
    return 0;
  }
  let text = "";
  if (typeof message.content === "string") {
    text = message.content;
  } else if (Array.isArray(message.content)) {
    text = message.content
      .map(part => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object") {
          return part.text || part.output || "";
        }
        return "";
      })
      .join(" ");
  } else if (message.content && typeof message.content === "object") {
    text = message.content.text || "";
  }
  return estimateTokens(text) + 4;
}

/**
 * Trim a conversation message list to fit within a token budget, keeping the most
 * recent messages and dropping the oldest first. The latest message is always
 * retained even if it alone exceeds the budget. A budget of 0 or less disables
 * trimming (the full list is returned).
 *
 * @param messages - The conversation messages, oldest first.
 * @param budget - The token budget; 0 or negative means "no limit".
 * @returns A trimmed copy in original order.
 */
export function windowMessagesByTokenBudget(messages: Message[], budget: number): Message[] {
  if (!Array.isArray(messages)) {
    return [];
  }
  if (!budget || budget <= 0) {
    return messages.slice();
  }
  const kept: Message[] = [];
  let total = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const cost = estimateMessageTokens(messages[i]);
    if (kept.length > 0 && total + cost > budget) {
      break;
    }
    kept.unshift(messages[i]);
    total += cost;
  }
  return kept;
}
