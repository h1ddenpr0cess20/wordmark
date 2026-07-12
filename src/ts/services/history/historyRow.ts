/**
 * History list row markup.
 *
 * @remarks
 * Pure, DOM-free helpers that derive a saved conversation's display fields
 * (title, relative date, prompt summary) and build its card inner HTML for
 * {@link ./list.ts}. Kept separate from the list controller so the row content
 * logic stays free of the selection/event wiring and is independently testable.
 */

import { DEFAULT_PERSONALITY } from "../../../config/config.ts";
import { escapeHtml } from "../../utils/sanitize.ts";
import { truncate } from "../../utils/utils.ts";
import type { ConversationRecord } from "../../../types/common.ts";

type ConversationMessage = NonNullable<ConversationRecord["messages"]>[number];

/** Extracts displayable text from a message's content (plain string or structured parts). */
function messageText(message: ConversationMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    const part = message.content.find((p: { type?: string; text?: string; content?: unknown }) => p.type === "input_text" || p.type === "text");
    return part ? (part.text || (typeof part.content === "string" ? part.content : "") || "") : "";
  }
  return "";
}

/**
 * Derives a conversation's list title. Party conversations are titled by their
 * scenario topic (falling back to the opening line, then the cast), since they
 * often open on an AI turn rather than a user message; other conversations use
 * their first user message.
 */
export function extractConversationTitle(convo: ConversationRecord): string {
  if (convo.mode === "party") {
    const topic = convo.scenario?.topic?.trim();
    if (topic) {
      return truncate(topic, 50);
    }
    const opening = (convo.messages || []).map(messageText).find(text => text.trim());
    if (opening) {
      return truncate(opening, 50);
    }
    const names = (convo.characters || []).map(c => c.name).filter(Boolean);
    return names.length ? names.join(", ") : "Party";
  }
  const userMsg = (convo.messages || []).find((m) => m.role === "user");
  if (!userMsg) {
    return "(No user message)";
  }
  return truncate(messageText(userMsg), 50);
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

/** Builds the inner HTML for a conversation's history-list card. */
export function buildHistoryRowHtml(convo: ConversationRecord): string {
  const title = extractConversationTitle(convo);
  const formatted = formatConversationDate(convo.updated);
  const { info: promptInfo, cssClass: promptClass } = resolveConversationPrompt(convo);

  const modelInfo = convo.model || "Unknown";
  const serviceInfo = convo.service || "Unknown";
  const messageCount = (convo.messages || []).length;
  const imageCount = (convo.images || []).length;

  return `
          <div class="history-card-top">
            <div class="history-title">${escapeHtml(title)}</div>
            <span class="date-info">${formatted}</span>
          </div>
          <div class="history-card-meta">
            ${promptInfo ? `<span class="prompt-type ${promptClass}">${escapeHtml(promptInfo)}</span>` : ""}
            <span class="model-info">
              <span class="model-name">${escapeHtml(modelInfo)}</span>
              <span class="service-name">${escapeHtml(serviceInfo)}</span>
            </span>
            <span class="stats-info">
              <span class="message-count">${messageCount} msg</span>
              ${imageCount > 0 ? `<span class="image-count">${imageCount} media</span>` : ""}
            </span>
          </div>
        `;
}
