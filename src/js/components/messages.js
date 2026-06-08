import { state } from "../init/state.js";
import { icon } from "../utils/icons.js";
import { addCopyButton, loadHighlightJS } from "../utils/highlight.js";
/**
 * Message handling and display functions
 */

// -----------------------------------------------------
// Message display functions
// -----------------------------------------------------

/**
 * Highlights code blocks in a message element and adds copy buttons
 * @param {HTMLElement} messageElement - The message element to process
 */
export function highlightAndAddCopyButtons(messageElement) {
  if (!messageElement) {
    return;
  }

  const codeBlocks = messageElement.querySelectorAll("pre code");
  if (codeBlocks.length === 0) {
    return;
  }

  if (typeof hljs !== "undefined") {
    codeBlocks.forEach((codeBlock) => {
      // Check if code block has no language class or only has the default hljs class
      const hasLanguageClass = Array.from(codeBlock.classList).some(cls =>
        cls.startsWith("language-") && cls !== "language-plaintext" && cls !== "language-");

      // If no language specified, explicitly set it as plaintext to prevent auto-detection
      if (!hasLanguageClass) {
        codeBlock.classList.add("language-plaintext");
        codeBlock.classList.add("plaintext");
      }

      if (!codeBlock.classList.contains("hljs")) {
        hljs.highlightElement(codeBlock);
      }
      addCopyButton(codeBlock);
    });
  } else if (state.hljsLoaded) {
    if (typeof hljs !== "undefined") {
      codeBlocks.forEach((codeBlock) => {
        // Check if code block has no language class or only has the default hljs class
        const hasLanguageClass = Array.from(codeBlock.classList).some(cls =>
          cls.startsWith("language-") && cls !== "language-plaintext" && cls !== "language-");

        // If no language specified, explicitly set it as plaintext to prevent auto-detection
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
  } else {
    loadHighlightJS().then(() => {
      if (typeof hljs !== "undefined") {
        codeBlocks.forEach((codeBlock) => {
          // Check if code block has no language class or only has the default hljs class
          const hasLanguageClass = Array.from(codeBlock.classList).some(cls =>
            cls.startsWith("language-") && cls !== "language-plaintext" && cls !== "language-");

          // If no language specified, explicitly set it as plaintext to prevent auto-detection
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
    });
  }
}

/**
 * Generate a unique message ID
 * @returns {string} A unique message ID
 */
export function generateMessageId() {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Retrieve raw message content from conversation history
 * @param {string} messageId - The ID of the message
 * @returns {string} Raw text content
 */
function getRawMessageContent(messageId) {
  if (!state.conversationHistory) {
    return "";
  }
  const entry = state.conversationHistory.find(msg => msg.id === messageId);
  if (entry) {
    return entry.content || "";
  }

  // If not found in conversation history, check if we can get it from the DOM
  const messageElement = document.getElementById(messageId);
  if (messageElement) {
    const contentElement = messageElement.querySelector(".message-content");
    if (contentElement) {
      // Get text content, stripping HTML but preserving basic structure
      return contentElement.innerText || contentElement.textContent || "";
    }
  }

  return "";
}

/**
 * Add a copy button to a message bubble
 * @param {HTMLElement} messageElement - Target message element
 * @param {string} messageId - ID used to look up raw content
 */
export function addMessageCopyButton(messageElement, messageId) {
  if (!messageElement) {
    return;
  }
  // Check if copy button already exists on this message
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
  // Append to the message element itself so it can be positioned outside the bubble
  messageElement.appendChild(btn);
}
