/**
 * Chat message rendering.
 *
 * @remarks
 * Appends user and assistant messages to the chat view, rendering markdown and
 * managing scroll behavior.
 */

import { elements, state } from "../../init/state.ts";
import { icon } from "../../utils/icons.ts";
import { marked } from "marked";
import { fastScroll } from "../../utils/dom/mobileHandling.ts";
import { renderWordmarkLogo } from "../logo.ts";
import { generateMessageId, highlightAndAddCopyButtons } from "../messages.ts";
import { setupImageInteractions } from "./imageInteractions.ts";
import { sanitizeWithMedia } from "../../utils/sanitize.ts";
function renderAssistantIcon(senderElement: HTMLElement) {
  senderElement.innerHTML = `
    <svg class="sender-icon assistant-icon" width="32" height="32" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g stroke="var(--accent-color)" stroke-width="1"></g>
    </svg>
  `;

  renderWordmarkLogo(senderElement.querySelector("g"));
}

/**
 * Appends a chat message bubble to the chat box.
 *
 * @param sender - Display label for the message author.
 * @param content - Message text/markdown.
 * @param type - CSS type class (e.g. `"user"`, `"assistant"`, `"system-message"`).
 * @param skipHistory - When `true`, renders without pushing to conversation history.
 * @returns The created message element.
 */
export function appendMessage(sender: string, content: string, type: string, skipHistory = false) {
  const messageElement = document.createElement("div");
  messageElement.classList.add("message");
  if (type) {
    messageElement.classList.add(type);
  }

  const messageId = generateMessageId();
  messageElement.id = messageId;

  const senderElement = document.createElement("div");
  senderElement.className = "message-sender";

  if (sender === "You") {
    senderElement.innerHTML = icon("user", { width: 24, height: 24, color: "var(--accent-color)", className: "sender-icon user-icon" });
  } else if (sender === "Assistant") {
    renderAssistantIcon(senderElement);
  } else {
    senderElement.textContent = sender;
  }

  const contentElement = document.createElement("div");
  contentElement.className = "message-content";

  messageElement.appendChild(senderElement);
  messageElement.appendChild(contentElement);
  const chatBox = elements.chatBox;
  chatBox?.appendChild(messageElement);

  if (state.shouldAutoScroll && chatBox) {
    fastScroll(chatBox, chatBox.scrollHeight);
  }

  setTimeout(() => {
    Promise.resolve().then(() => {
      const parsed = marked.parse(content, { async: false });
      const sanitized = sanitizeWithMedia(parsed);
      contentElement.innerHTML = sanitized;

      try {
        highlightAndAddCopyButtons(messageElement);
      } catch (error) {
        console.error("Error highlighting code:", error);
      }

      try {
        setupImageInteractions(messageElement);
      } catch (error) {
        console.error("Error setting up image interactions:", error);
      }

      if (state.shouldAutoScroll && chatBox) {
        chatBox.scrollTop = chatBox.scrollHeight;
      }

      if ((type === "user" || type === "system") && !skipHistory) {
        state.shouldAutoScroll = true;
      }
    });
  }, 0);

  return messageElement;
}

/**
 * Appends an assistant message, rendering its markdown/reasoning and (unless
 * `skipHistory`) recording it in conversation history with a generated id.
 *
 * @returns The created message element.
 */
export function appendAssistantMessage(assistantMessage: string, skipHistory = false) {
  let msgId: string | null = null;
  if (!skipHistory) {
    msgId = generateMessageId();

    state.conversationHistory.push({
      role: "assistant",
      content: assistantMessage,
      id: msgId,
      timestamp: new Date().toISOString(),
    });
  }

  const messageElement = appendMessage("Assistant", assistantMessage, "assistant", skipHistory);
  if (messageElement && msgId) {
    messageElement.id = msgId;
  }
  return messageElement;
}
