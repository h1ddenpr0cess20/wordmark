/**
 * Message handling and display functions.
 */

import hljs from "highlight.js";
import { state } from "../init/state.ts";
import { icon } from "../utils/icons.ts";
import { addCopyButton } from "../utils/highlight.ts";

/**
 * Highlights code blocks in a message element and adds copy buttons.
 *
 * @param messageElement - The message element to process.
 */
export function highlightAndAddCopyButtons(messageElement: HTMLElement | null) {
  if (!messageElement) {
    return;
  }

  const codeBlocks = messageElement.querySelectorAll<HTMLElement>("pre code");
  if (codeBlocks.length === 0) {
    return;
  }

  codeBlocks.forEach((codeBlock) => {
    const hasLanguageClass = Array.from(codeBlock.classList).some((cls) =>
      cls.startsWith("language-") && cls !== "language-plaintext" && cls !== "language-");

    if (!hasLanguageClass) {
      codeBlock.classList.add("language-plaintext");
      codeBlock.classList.add("plaintext");
    }

    if (!codeBlock.classList.contains("hljs")) {
      hljs.highlightElement(codeBlock);
    }
    addCopyButton(codeBlock);
  });
}

/**
 * Generates a unique message ID.
 *
 * @returns A unique message ID.
 */
export function generateMessageId() {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Retrieves raw message content from the conversation history, falling back to
 * the rendered DOM.
 *
 * @param messageId - The ID of the message.
 * @returns The raw text content.
 */
function getRawMessageContent(messageId: string): string {
  if (!state.conversationHistory) {
    return "";
  }
  const entry = state.conversationHistory.find(msg => msg.id === messageId);
  if (entry) {
    const content = entry.content;
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content.map(part => part?.text || "").join("");
    }
    if (content && typeof content === "object") {
      return content.text || "";
    }
    return "";
  }

  const messageElement = document.getElementById(messageId);
  if (messageElement) {
    const contentElement = messageElement.querySelector<HTMLElement>(".message-content");
    if (contentElement) {
      return contentElement.innerText || contentElement.textContent || "";
    }
  }

  return "";
}

/**
 * Adds a copy button to a message bubble.
 *
 * @param messageElement - Target message element.
 * @param messageId - ID used to look up raw content.
 */
export function addMessageCopyButton(messageElement: HTMLElement | null, messageId: string) {
  if (!messageElement) {
    return;
  }
  if (messageElement.querySelector(".message-copy-btn")) {
    return;
  }

  const btn = document.createElement("button");
  btn.className = "message-copy-btn";
  btn.setAttribute("aria-label", "Copy message");
  btn.innerHTML = icon("copy", { width: 16, height: 16 });
  btn.addEventListener("click", () => {
    const raw = getRawMessageContent(messageId);
    if (!raw) {
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(raw);
    }
  });
  messageElement.appendChild(btn);
}
