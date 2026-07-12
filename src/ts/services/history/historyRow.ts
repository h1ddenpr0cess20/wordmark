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

const DISPLAY_MAX = 160;

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
 * Derives a conversation's list title. A user-assigned name wins; the
 * auto-generated `Conversation <timestamp>` and `Personality: <persona>` names
 * from {@link ./persistence.ts} don't count as user-assigned. Party
 * conversations are titled by their scenario topic (falling back to the
 * opening line, then the cast), since they often open on an AI turn rather
 * than a user message; other conversations use their first user message.
 */
export function extractConversationTitle(convo: ConversationRecord): string {
  const name = convo.name?.trim();
  if (name && !/^(Conversation \d|Personality: )/.test(name)) {
    return truncate(name, DISPLAY_MAX);
  }
  if (convo.mode === "party") {
    const topic = convo.scenario?.topic?.trim();
    if (topic) {
      return truncate(topic, DISPLAY_MAX);
    }
    const opening = (convo.messages || []).map(messageText).find(text => text.trim());
    if (opening) {
      return truncate(opening, DISPLAY_MAX);
    }
    const names = (convo.characters || []).map(c => c.name).filter(Boolean);
    return names.length ? names.join(", ") : "Party";
  }
  const userMsg = (convo.messages || []).find((m) => m.role === "user");
  if (!userMsg) {
    return "(No user message)";
  }
  return truncate(messageText(userMsg), DISPLAY_MAX);
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

/** Buckets a conversation's `updated` timestamp into a history-list section label. */
export function conversationDateGroup(updated: ConversationRecord["updated"]): string {
  const date = new Date(updated || 0);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const dayMs = 24 * 60 * 60 * 1000;
  if (date >= startOfToday) {
    return "Today";
  }
  if (date.getTime() >= startOfToday.getTime() - dayMs) {
    return "Yesterday";
  }
  if (date.getTime() >= startOfToday.getTime() - 7 * dayMs) {
    return "Previous 7 days";
  }
  if (date.getTime() >= startOfToday.getTime() - 30 * dayMs) {
    return "Previous 30 days";
  }
  return "Older";
}

/** Resolves the prompt summary text and its CSS class for a conversation. */
export function resolveConversationPrompt(convo: ConversationRecord): { info: string; cssClass: string } {
  if (convo.mode === "party") {
    const names = (convo.characters || []).map(c => c.name).filter(Boolean);
    const summary = names.length ? `Party: ${names.join(", ")}` : "Party";
    return { info: truncate(summary, DISPLAY_MAX), cssClass: "party" };
  }
  if (!convo.systemPrompt) {
    return { info: "", cssClass: "none" };
  }
  if (convo.systemPrompt.type === "personality") {
    return { info: convo.systemPrompt.content || DEFAULT_PERSONALITY || "Default", cssClass: "personality" };
  }
  if (convo.systemPrompt.type === "custom") {
    return { info: truncate(convo.systemPrompt.content || "", DISPLAY_MAX), cssClass: "custom" };
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
            <div class="history-row-actions">
              <button type="button" class="row-action row-rename" title="Rename" aria-label="Rename conversation">
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#pencil"></use></svg>
              </button>
              <button type="button" class="row-action row-delete" title="Delete" aria-label="Delete conversation">
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#trash"></use></svg>
              </button>
            </div>
          </div>
          ${promptInfo ? `<div class="history-prompt prompt-type ${promptClass}">${escapeHtml(promptInfo)}</div>` : ""}
          <div class="history-card-meta">
            <span class="model-info">
              <span class="model-name">${escapeHtml(modelInfo)}</span>
              <span class="service-name">${escapeHtml(serviceInfo)}</span>
            </span>
            <span class="stats-info">
              <span class="message-count">${messageCount} msg</span>
              ${imageCount > 0 ? `<span class="image-count">${imageCount} media</span>` : ""}
            </span>
            <span class="date-info">${formatted}</span>
          </div>
        `;
}
