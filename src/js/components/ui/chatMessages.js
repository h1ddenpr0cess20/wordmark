import { icon } from "../../utils/icons.js";
import { loadMarkedLibrary } from "../../utils/lazyLoader.js";
import { renderWordmarkLogo } from "../logo.js";
import { generateMessageId, highlightAndAddCopyButtons } from "../messages.js";
import { setupImageInteractions } from "./imageInteractions.js";
import { sanitizeWithMedia } from "../../utils/sanitize.js";
function renderAssistantIcon(senderElement) {
  senderElement.innerHTML = `
    <svg class="sender-icon assistant-icon" width="32" height="32" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g stroke="var(--accent-color)" stroke-width="1"></g>
    </svg>
  `;

  const originalSelector = document.querySelector;
  document.querySelector = function(selector) {
    if (selector === '#wordmark-logo g') {
      return senderElement.querySelector('g');
    }
    return originalSelector.call(document, selector);
  };

  try {
    renderWordmarkLogo();
  } finally {
    document.querySelector = originalSelector;
  }
}

export function appendMessage(sender, content, type, skipHistory = false) {
  const messageElement = document.createElement('div');
  messageElement.classList.add('message');
  if (type) {
    messageElement.classList.add(type);
  }

  const messageId = `msg-${Date.now()}`;
  messageElement.id = messageId;

  const senderElement = document.createElement('div');
  senderElement.className = 'message-sender';

  if (sender === 'You') {
    senderElement.innerHTML = icon('user', { width: 24, height: 24, color: 'var(--accent-color)', className: 'sender-icon user-icon' });
  } else if (sender === 'Assistant') {
    renderAssistantIcon(senderElement);
  } else {
    senderElement.textContent = sender;
  }

  const contentElement = document.createElement('div');
  contentElement.className = 'message-content';

  messageElement.appendChild(senderElement);
  messageElement.appendChild(contentElement);
  window.chatBox.appendChild(messageElement);

  // Mobile/optimized fast-scroll once the message element is in the DOM.
  if (window.shouldAutoScroll && window.chatBox && typeof window.fastScroll === "function") {
    window.fastScroll(window.chatBox, window.chatBox.scrollHeight);
  }

  setTimeout(() => {
    const ensureMarked = typeof marked === 'undefined' && typeof loadMarkedLibrary === 'function'
      ? loadMarkedLibrary()
      : Promise.resolve();

    Promise.resolve(ensureMarked).then(() => {
      const parsed = typeof marked !== 'undefined' ? marked.parse(content) : content;
      const sanitized = sanitizeWithMedia(parsed);
      contentElement.innerHTML = sanitized;

      try {
        highlightAndAddCopyButtons(messageElement);
      } catch (error) {
        console.error('Error highlighting code:', error);
      }

      try {
        setupImageInteractions(messageElement);
      } catch (error) {
        console.error('Error setting up image interactions:', error);
      }

      if (window.shouldAutoScroll) {
        window.chatBox.scrollTop = window.chatBox.scrollHeight;
      }

      if ((type === 'user' || type === 'system') && !skipHistory) {
        window.shouldAutoScroll = true;
      }
    });
  }, 0);

  return messageElement;
}

export function appendAssistantMessage(assistantMessage, skipHistory = false) {
  let msgId = null;
  if (!skipHistory) {
    msgId = generateMessageId();

    window.conversationHistory.push({
      role: 'assistant',
      content: assistantMessage,
      id: msgId,
      timestamp: new Date().toISOString(),
    });
  }

  const messageElement = appendMessage('Assistant', assistantMessage, 'assistant', skipHistory);
  if (messageElement && msgId) {
    messageElement.id = msgId;
  }
  return messageElement;
}
