/**
 * Utility functions for the chatbot application
 */

import { state } from "../init/state.js";
/**
 * Debounces a function call
 * @param {Function} func - The function to debounce
 * @param {number} wait - Time to wait in milliseconds
 * @returns {Function} - The debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

/**
 * Sanitizes user input to prevent XSS attacks
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text
 */
export function sanitizeInput(text) {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Toggle the visibility of the thinking/reasoning container
 * @param {string} id - The ID of the thinking container to toggle
 */
export function toggleThinking(id, event) {
  // Prevent event bubbling that might affect other elements
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }

  const thinkingContainer = document.getElementById(id);
  if (!thinkingContainer) {
    console.warn("Thinking container not found:", id);
    return;
  }

  // Get the current state before toggling
  const wasCollapsed = thinkingContainer.classList.contains("collapsed");

  // Toggle this specific container's state
  thinkingContainer.classList.toggle("collapsed");

  // Persist user preference for this specific thinking container ID
  if (!state.userThinkingState || typeof state.userThinkingState !== "object") {
    state.userThinkingState = {};
  }
  // Store as 'expanded' boolean
  state.userThinkingState[id] = wasCollapsed === true;

  // Debug logging
  if (state.verboseLogging) {
    console.log(`Toggled thinking container ${id}: ${wasCollapsed ? "expanded" : "collapsed"}`);
  }

  // If we're expanding this container, scroll to show its content
  if (wasCollapsed) {
    const contentDiv = thinkingContainer.querySelector(".thinking-content");
    if (contentDiv) {
      setTimeout(() => {
        contentDiv.scrollTop = 0;
      }, 100);
    }
  }
}

/**
 * Replace base64 image data URLs in a user message with filename placeholders.
 * This prevents large base64 strings from being stored in conversation history.
 * @param {string} messageId - ID of the user message
 * @param {Array} placeholders - Array of placeholder strings like '[[IMAGE: file.jpg]]'
 */
export function stripBase64FromHistory(messageId, placeholders = []) {
  if (!Array.isArray(state.conversationHistory)) {
    return;
  }
  const entry = state.conversationHistory.find(msg => msg.id === messageId);
  if (!entry || entry.role !== "user") {
    return;
  }

  function sanitizeAttachments() {
    if (!Array.isArray(entry.attachments)) {
      return;
    }
    entry.attachments = entry.attachments
      .map(att => {
        if (!att || typeof att !== "object") {
          return null;
        }
        const normalized = { ...att };
        if (normalized.filename && normalized.dataUrl) {
          try {
            if (state.imageDataCache && typeof state.imageDataCache.set === "function") {
              state.imageDataCache.set(normalized.filename, normalized.dataUrl);
            }
          } catch (cacheErr) {
            console.warn("Failed to cache attachment data for", normalized.filename, cacheErr);
          }
          normalized.inlineDataRemoved = true;
          normalized.dataUrl = null;
        }
        return normalized;
      })
      .filter(Boolean);
  }

  let textPart = entry.content || "";

  // Check if placeholders already exist in the content
  const existingPlaceholders = placeholders.filter(placeholder =>
    textPart.includes(placeholder),
  );

  // If all placeholders already exist, just remove base64 data
  if (existingPlaceholders.length === placeholders.length) {
    entry.content = textPart.replace(/data:image\/[^;]+;base64,[^\s]+/g, "").trim();
    sanitizeAttachments();
    return;
  }

  // Remove any base64 image data
  textPart = textPart.replace(/data:image\/[^;]+;base64,[^\s]+/g, "").trim();
  const placeholderText = placeholders.join("\n");
  entry.content = placeholderText + (textPart ? `\n\n${textPart}` : "");
  sanitizeAttachments();
}

// Inline HTML handler (onclick="toggleThinking(...)") invokes this by global
// name, so it remains on window.
window.toggleThinking = toggleThinking;
