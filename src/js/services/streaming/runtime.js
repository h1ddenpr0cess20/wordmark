import {
  IMAGE_GENERATION_CALL_TYPE,
  collectImageCandidates,
  imageDebugLog,
} from './imageGeneration.js';
import { processMainContentMarkdown } from './thinkingUtils.js';

/**
 * Builds the runtime helpers responsible for tracking streaming state and
 * updating the DOM incrementally while the response arrives.
 * @param {Object} options - DOM references and identifiers for the stream
 * @param {HTMLElement} options.loadingMessage - The loading message element
 * @param {HTMLElement} options.contentWrapper - Wrapper for message content
 * @param {HTMLElement|null} options.placeholderElement - Optional loading spinner element
 * @param {HTMLElement} options.mainContentContainer - Container for main response text
 * @param {string} options.thinkingId - DOM id for the reasoning container
 * @param {HTMLElement|null} options.existingThinkingContainer - Previously rendered reasoning container
 * @returns {Object} runtime helpers used by the streaming pipeline
 */
export function createStreamingRuntime({
  loadingMessage,
  contentWrapper,
  placeholderElement,
  mainContentContainer,
  thinkingId,
  existingThinkingContainer,
}) {
  const accumulatedImageOutputs = [];
  const accumulatedImageSeen = new Set();
  let placeholderCleared = !placeholderElement;
  let accumulatedContent = '';
  let accumulatedReasoning = '';
  let thinkingContainer = existingThinkingContainer || null;

  if (existingThinkingContainer && existingThinkingContainer.dataset.accumulatedReasoning) {
    accumulatedReasoning = existingThinkingContainer.dataset.accumulatedReasoning;
  }

  function removePlaceholder() {
    if (placeholderCleared) return;
    placeholderCleared = true;
    if (placeholderElement && placeholderElement.parentNode === contentWrapper) {
      placeholderElement.remove();
    }
    if (mainContentContainer) {
      mainContentContainer.style.removeProperty('display');
    }
  }

  function ensureThinkingContainer(persistedExpanded, hasPersisted, priorWasCollapsed) {
    if (thinkingContainer) {
      return thinkingContainer;
    }
    const containerHTML =
      `<div id="${thinkingId}" class="thinking-container">
         <div class="thinking-title" onclick="toggleThinking('${thinkingId}', event)">Reasoning</div>
         <div class="thinking-content"></div>
       </div>`;
    mainContentContainer.insertAdjacentHTML('beforebegin', containerHTML);
    thinkingContainer = document.getElementById(thinkingId);
    if (thinkingContainer && accumulatedReasoning) {
      thinkingContainer.dataset.accumulatedReasoning = accumulatedReasoning;
      if (hasPersisted && !persistedExpanded) {
        thinkingContainer.classList.add('collapsed');
      } else if (!priorWasCollapsed) {
        thinkingContainer.classList.remove('collapsed');
      }
    }
    return thinkingContainer;
  }

  function render() {
    const processedText = accumulatedContent;
    const thinkingContent = accumulatedReasoning;
    const hasThinking = Boolean(thinkingContent);

    if (hasThinking) {
      if (!thinkingContainer) {
        thinkingContainer = document.getElementById(thinkingId) || null;
      }
      const persistedExpanded = (window.userThinkingState && window.userThinkingState[thinkingId] === true);
      const hasPersisted = !!(window.userThinkingState && Object.prototype.hasOwnProperty.call(window.userThinkingState, thinkingId));
      const priorWasCollapsed = thinkingContainer ? thinkingContainer.classList.contains('collapsed') : true;
      thinkingContainer = ensureThinkingContainer(persistedExpanded, hasPersisted, priorWasCollapsed);

      if (thinkingContainer) {
        const contentDiv = thinkingContainer.querySelector('.thinking-content');
        if (contentDiv) {
          contentDiv.innerHTML = processMainContentMarkdown(thinkingContent);
          const shouldCollapse = hasPersisted ? !persistedExpanded : priorWasCollapsed;
          if (shouldCollapse) {
            thinkingContainer.classList.add('collapsed');
          } else {
            thinkingContainer.classList.remove('collapsed');
            contentDiv.scrollTop = contentDiv.scrollHeight;
          }
        }
        thinkingContainer.dataset.accumulatedReasoning = accumulatedReasoning;
      }
      removePlaceholder();
    }

    if (mainContentContainer) {
      mainContentContainer.innerHTML = processMainContentMarkdown(processedText);
    }

    if (processedText && processedText.trim().length > 0) {
      removePlaceholder();
    }

    if (typeof window.highlightAndAddCopyButtons === 'function') {
      try {
        window.highlightAndAddCopyButtons(loadingMessage);
      } catch (err) {
        console.warn('Error highlighting code during streaming:', err);
      }
    }

    if (window.shouldAutoScroll) {
      if (typeof window.fastScroll === 'function') {
        window.fastScroll(window.chatBox, window.chatBox.scrollHeight);
      } else {
        requestAnimationFrame(() => {
          window.chatBox.scrollTop = window.chatBox.scrollHeight;
        });
      }
    }
  }

  function appendReasoningLine(text, indent = 0) {
    if (!text) return;
    if (accumulatedReasoning && !accumulatedReasoning.endsWith('\n')) {
      accumulatedReasoning += '\n';
    }
    const indentation = '  '.repeat(indent);
    accumulatedReasoning += indentation + text + '\n';
    render();
  }

  function updateLastReasoningLine(newText, indent = 0) {
    if (!newText) return;
    const lines = accumulatedReasoning.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    if (lines.length > 0) {
      lines[lines.length - 1] = '  '.repeat(indent) + newText;
    } else {
      lines.push('  '.repeat(indent) + newText);
    }
    accumulatedReasoning = lines.join('\n') + '\n\n';
    render();
  }

  function appendReasoningDelta(delta) {
    if (!delta) return;
    accumulatedReasoning += delta;
    render();
  }

  function ensureReasoningTrailingNewline() {
    if (!accumulatedReasoning) return;
    if (!accumulatedReasoning.endsWith('\n')) {
      accumulatedReasoning += '\n';
    }
    render();
  }

  function appendOutputText(delta) {
    if (!delta) return;
    accumulatedContent += delta;
    render();
  }

  function replaceOutputSegment(startOffset, fullText) {
    accumulatedContent = accumulatedContent.slice(0, startOffset) + fullText;
    render();
  }

  function collectImagesFromSource(source, label) {
    if (!source || typeof source !== 'object') {
      return;
    }
    const localSeen = new Set();
    const visited = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
    const buffer = [];
    collectImageCandidates(source, buffer, 'image/png', localSeen, visited);
    if (!buffer.length) {
      return;
    }
    buffer.forEach(item => {
      if (!item || typeof item.dataUrl !== 'string') {
        return;
      }
      if (accumulatedImageSeen.has(item.dataUrl)) {
        return;
      }
      accumulatedImageSeen.add(item.dataUrl);
      accumulatedImageOutputs.push({
        dataUrl: item.dataUrl,
        mimeType: item.mimeType || 'image/png',
        sourceLabel: label,
      });
      imageDebugLog('Captured image data from stream event.', {
        sourceLabel: label,
        mimeType: item.mimeType || 'image/png',
        preview: item.dataUrl.substring(0, 48),
      });
    });
  }

  function attachImagesToPayload(payload) {
    if (!accumulatedImageOutputs.length) {
      return payload;
    }
    const targetPayload = payload || {};
    if (!Array.isArray(targetPayload.output)) {
      targetPayload.output = Array.isArray(targetPayload.output) ? targetPayload.output : [];
    }
    accumulatedImageOutputs.forEach((img, index) => {
      const outputEntry = {
        id: `image-output-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        type: IMAGE_GENERATION_CALL_TYPE,
        mime_type: img.mimeType || 'image/png',
        source: img.sourceLabel || 'stream',
      };
      if (typeof img.dataUrl === 'string' && img.dataUrl.startsWith('data:')) {
        outputEntry.result = img.dataUrl.split(',')[1];
      } else if (typeof img.dataUrl === 'string' && img.dataUrl.startsWith('http')) {
        outputEntry.image_url = img.dataUrl;
      } else {
        return;
      }
      targetPayload.output.push(outputEntry);
    });
    return targetPayload;
  }

  return {
    appendOutputText,
    replaceOutputSegment,
    appendReasoningDelta,
    appendReasoningLine,
    updateLastReasoningLine,
    ensureReasoningTrailingNewline,
    collectImagesFromSource,
    attachImagesToPayload,
    getOutputText: () => accumulatedContent,
    getOutputLength: () => accumulatedContent.length,
    getReasoningText: () => accumulatedReasoning,
    outputEndsWith: suffix => accumulatedContent.endsWith(suffix),
    hasOutput: () => accumulatedContent.trim().length > 0,
    removePlaceholder,
    render,
  };
}

