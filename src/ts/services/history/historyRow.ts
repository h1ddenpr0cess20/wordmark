/**
 * History list row markup.
 *
 * @remarks
 * Pure, DOM-free helpers that derive a saved conversation's display fields
 * (title, relative date, prompt summary) and build its table-row inner HTML for
 * {@link ./list.ts}. Kept separate from the list controller so the row content
 * logic stays free of the selection/event wiring and is independently testable.
 */

import { DEFAULT_PERSONALITY } from "../../../config/config.ts";
import { escapeHtml } from "../../utils/sanitize.ts";
import { truncate } from "../../utils/utils.ts";
import type { ConversationRecord } from "../../../types/common.ts";

/** Derives a conversation's list title from its first user message (truncated). */
export function extractConversationTitle(convo: ConversationRecord): string {
  const userMsg = (convo.messages || []).find((m) => m.role === "user");
  if (!userMsg) {
    return "(No user message)";
  }
  let text = "";
  if (typeof userMsg.content === "string") {
    text = userMsg.content;
  } else if (Array.isArray(userMsg.content)) {
    const part = userMsg.content.find(p => p.type === "input_text" || p.type === "text");
    text = part ? (part.text || (typeof part.content === "string" ? part.content : "") || "") : "";
  }
  return truncate(text, 50);
}

/**
 * Formats a conversation's `updated` timestamp relative to now: a time today,
 * `"Yesterday"`, or a short month/day date.
 */
export function formatConversationDate(updated: ConversationRecord["updated"]): string {
  const date = new Date(updated || 0);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Resolves the prompt summary text and its CSS class for a conversation. */
export function resolveConversationPrompt(convo: ConversationRecord): { info: string; cssClass: string } {
  if (convo.mode === "party") {
    const names = (convo.characters || []).map(c => c.name).filter(Boolean);
    const summary = names.length ? `Party: ${names.join(", ")}` : "Party";
    return { info: truncate(summary, 40), cssClass: "party" };
  }
  if (!convo.systemPrompt) {
    return { info: "", cssClass: "none" };
  }
  if (convo.systemPrompt.type === "personality") {
    return { info: convo.systemPrompt.content || DEFAULT_PERSONALITY || "Default", cssClass: "personality" };
  }
  if (convo.systemPrompt.type === "custom") {
    return { info: truncate(convo.systemPrompt.content || "", 30), cssClass: "custom" };
  }
  return { info: "None", cssClass: "none" };
}

/** Builds the `<td>` inner HTML for a conversation's history-list row. */
export function buildHistoryRowHtml(convo: ConversationRecord): string {
  const title = extractConversationTitle(convo);
  const formatted = formatConversationDate(convo.updated);
  const { info: promptInfo, cssClass: promptClass } = resolveConversationPrompt(convo);

  const modelInfo = convo.model || "Unknown";
  const serviceInfo = convo.service || "Unknown";
  const messageCount = (convo.messages || []).length;
  const imageCount = (convo.images || []).length;

  return `
          <td class="col-title">
            <div class="history-title">${escapeHtml(title)}</div>
          </td>
          <td class="col-prompt">
            <span class="prompt-type ${promptClass}">${escapeHtml(promptInfo)}</span>
          </td>
          <td class="col-model">
            <div class="model-info">
              <div class="model-name">${escapeHtml(modelInfo)}</div>
              <div class="service-name">${escapeHtml(serviceInfo)}</div>
            </div>
          </td>
          <td class="col-stats">
            <div class="stats-info">
              <span class="message-count">${messageCount} msg</span>
              ${imageCount > 0 ? `<span class="image-count">${imageCount} media</span>` : ""}
            </div>
          </td>
          <td class="col-date">
            <span class="date-info">${formatted}</span>
          </td>
        `;
}
