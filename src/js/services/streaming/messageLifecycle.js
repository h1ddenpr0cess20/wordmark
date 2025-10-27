/**
 * Message lifecycle helpers used during streaming and finalization.
 */

import {
  imageDebugLog,
  processImageGenerationOutputs,
} from './imageGeneration.js';
import {
  extractCodeInterpreterOutputs,
  renderCodeInterpreterOutputs,
} from './codeInterpreter.js';
import {
  processMainContentMarkdown,
} from './thinkingUtils.js';

export function finalizeStreamedResponse(loadingMessage, contentObj) {
  if (!loadingMessage) {
    return;
  }

  const responsePayload = contentObj && typeof contentObj === 'object' ? contentObj.response || null : null;
  let content = contentObj && typeof contentObj === 'object' ? (contentObj.content || '') : (contentObj || '');
  let reasoning = contentObj && typeof contentObj === 'object' ? (contentObj.reasoning || '') : '';

  function extractOutputText(payload) {
    if (!payload) {
      return '';
    }
    if (Array.isArray(payload.output)) {
      return payload.output
        .filter(item => item && item.type === 'output_text')
        .map(item => item.text || item.content || '')
        .join('');
    }
    if (typeof payload.output_text === 'string') {
      return payload.output_text;
    }
    if (Array.isArray(payload.output_text)) {
      return payload.output_text.join('');
    }
    return '';
  }

  function extractReasoningText(payload) {
    if (!payload) {
      return '';
    }
    const flattenContentArray = (items) => {
      return items
        .map(item => {
          if (typeof item === 'string') {
            return item;
          }
          if (item && typeof item === 'object') {
            if (typeof item.text === 'string') {
              return item.text;
            }
            if (typeof item.content === 'string') {
              return item.content;
            }
          }
          return '';
        })
        .join('');
    };
    if (payload.reasoning && typeof payload.reasoning === 'string') {
      return payload.reasoning;
    }
    if (payload.reasoning && Array.isArray(payload.reasoning)) {
      return payload.reasoning.map(item => item?.content || '').join('');
    }
    if (payload.reasoning && Array.isArray(payload.reasoning.output)) {
      return payload.reasoning.output.map(item => item?.content || '').join('');
    }
    if (typeof payload.reasoning_content === 'string') {
      return payload.reasoning_content;
    }
    if (Array.isArray(payload.reasoning_content)) {
      return flattenContentArray(payload.reasoning_content);
    }
    if (payload.reasoning && typeof payload.reasoning === 'object' && typeof payload.reasoning.content === 'string') {
      return payload.reasoning.content;
    }
    return '';
  }

  if (!content) {
    content = extractOutputText(responsePayload);
  }
  if (!reasoning) {
    reasoning = extractReasoningText(responsePayload);
  }

  let codeInterpreterOutputs = { attachments: [], logs: [] };
  if (responsePayload) {
    try {
      processImageGenerationOutputs(responsePayload);
    } catch (error) {
      console.error('Failed to process image generation outputs:', error);
    }
    try {
      codeInterpreterOutputs = extractCodeInterpreterOutputs(responsePayload);
    } catch (error) {
      console.error('Failed to extract code interpreter outputs:', error);
      codeInterpreterOutputs = { attachments: [], logs: [] };
    }
  }

  const hasPendingImages = Array.isArray(window.currentGeneratedImageHtml)
    ? window.currentGeneratedImageHtml.length > 0
    : false;

  if (!hasPendingImages && !content.trim() && !reasoning.trim()) {
    return;
  }

  const cleanedContent = content;
  let processedText = cleanedContent;
  let thinkingContent = reasoning;
  let hasThinking = Boolean(thinkingContent);

  const thinkingId = `thinking-${loadingMessage.id}`;
  const contentWrapper = loadingMessage.querySelector('.message-content');
  if (!contentWrapper) {
    return;
  }

  if (!loadingMessage.id) {
    loadingMessage.id = typeof window.generateMessageId === 'function'
      ? window.generateMessageId()
      : `msg-${Date.now()}`;
  }

  if (window.currentGeneratedImageHtml && window.currentGeneratedImageHtml.length > 0) {
    imageDebugLog('Detected pending generated images before rendering message.', {
      count: window.currentGeneratedImageHtml.length,
    });
  }

  let fullContent = content;
  const hasExistingImagePlaceholders = /\[\[IMAGE: [^\]]+\]\]/.test(fullContent);
  const willHaveImages = !hasExistingImagePlaceholders &&
                         window.currentGeneratedImageHtml &&
                         window.currentGeneratedImageHtml.length > 0;

  if (willHaveImages) {
    const imageList = window.currentGeneratedImageHtml
      .map(html => {
        const match = html.match(/data-filename="([^"]+)"/);
        return match ? `[[IMAGE: ${match[1]}]]` : null;
      })
      .filter(Boolean)
      .join('\n');
    if (imageList) {
      fullContent = `${imageList}\n\n${fullContent}`;
    }
  }

  window.conversationHistory.push({
    role: 'assistant',
    content: fullContent,
    reasoning,
    id: loadingMessage.id,
    timestamp: new Date().toISOString(),
    hasImages: willHaveImages,
    responseId: responsePayload && responsePayload.id ? responsePayload.id : undefined,
    codeInterpreterOutputs,
  });

  const existingThinkingContainer = document.getElementById(thinkingId);
  let existingMainContentContainer = contentWrapper.querySelector('.main-response-content');
  let existingImagesContainer = contentWrapper.querySelector('.generated-images');

  if (window.currentGeneratedImageHtml && window.currentGeneratedImageHtml.length > 0) {
    let imagesContainer = existingImagesContainer;
    if (!imagesContainer) {
      imagesContainer = document.createElement('div');
      imagesContainer.className = 'generated-images';
      contentWrapper.appendChild(imagesContainer);
    }
    imagesContainer.innerHTML = window.currentGeneratedImageHtml.join('');
    window.setupImageInteractions(imagesContainer);
    imageDebugLog('Injected generated images into chat bubble.', {
      imageCount: window.currentGeneratedImageHtml.length,
      messageId: loadingMessage.id,
    });

    const thisMessageImages = [...window.currentGeneratedImageHtml];
    if (!window.messageImages) {
      window.messageImages = {};
    }
    window.messageImages[loadingMessage.id] = thisMessageImages;

    const filenamesForThisMessage = thisMessageImages
      .map(html => {
        const match = html.match(/data-filename="([^"]+)"/);
        return match ? match[1] : null;
      })
      .filter(Boolean);
    if (Array.isArray(window.generatedImages)) {
      window.generatedImages.forEach(img => {
        if (!img.associatedMessageId && filenamesForThisMessage.includes(img.filename)) {
          img.associatedMessageId = loadingMessage.id;
        }
      });
    }

    const historyEntry = window.conversationHistory.find(entry => entry.id === loadingMessage.id);
    if (historyEntry) {
      historyEntry.hasImages = true;
      imageDebugLog('Marked conversation history entry as having images.', {
        messageId: loadingMessage.id,
      });
    }
  }

  if (hasThinking) {
    let finalThinkingContainer = existingThinkingContainer;
    const persistedExpanded = (window.userThinkingState && window.userThinkingState[thinkingId] === true);
    const hasPersisted = !!(window.userThinkingState && Object.prototype.hasOwnProperty.call(window.userThinkingState, thinkingId));
    const priorWasCollapsed = finalThinkingContainer ? finalThinkingContainer.classList.contains('collapsed') : true;
    const shouldCollapse = hasPersisted ? !persistedExpanded : priorWasCollapsed;

    if (!finalThinkingContainer) {
      const containerHTML =
        `<div id="${thinkingId}" class="thinking-container">
           <div class="thinking-title" onclick="toggleThinking('${thinkingId}', event)">Reasoning</div>
           <div class="thinking-content"></div>
         </div>`;
      contentWrapper.insertAdjacentHTML('beforeend', containerHTML);
      finalThinkingContainer = document.getElementById(thinkingId);
    }

    if (finalThinkingContainer) {
      const contentDiv = finalThinkingContainer.querySelector('.thinking-content');
      if (contentDiv) {
        contentDiv.innerHTML = processMainContentMarkdown(thinkingContent);
      }
      if (shouldCollapse) {
        finalThinkingContainer.classList.add('collapsed');
      } else {
        finalThinkingContainer.classList.remove('collapsed');
      }
    }
  }

  let finalMainContentContainer = existingMainContentContainer;
  if (!finalMainContentContainer) {
    finalMainContentContainer = document.createElement('div');
    finalMainContentContainer.className = 'main-response-content';
    contentWrapper.appendChild(finalMainContentContainer);
  }
  finalMainContentContainer.innerHTML = processMainContentMarkdown(processedText);
  renderCodeInterpreterOutputs(loadingMessage, codeInterpreterOutputs);

  updateFinalMessage(loadingMessage);

  // TTS uses content directly - responses API provides clean text without thinking tags
  if (window.ttsConfig && window.ttsConfig.enabled && typeof window.generateTtsForMessage === 'function') {
    window.generateTtsForMessage(content, loadingMessage.id);
  }

  if (typeof window.updateBrowserHistory === 'function') {
    window.updateBrowserHistory();
  }

  if (window.saveCurrentConversation) {
    window.saveCurrentConversation();
  }

  if (window.currentGeneratedImageHtml && window.currentGeneratedImageHtml.length > 0) {
    imageDebugLog('Resetting currentGeneratedImageHtml; pending images should now be associated.', {
      messageId: loadingMessage.id,
    });
  }
  window.currentGeneratedImageHtml = [];
}

export function updateFinalMessage(loadingMessage) {
  if (!loadingMessage) {
    return;
  }

  if (typeof window.highlightAndAddCopyButtons === 'function') {
    try {
      window.highlightAndAddCopyButtons(loadingMessage);
    } catch (e) {
      console.warn('Error highlighting code in final message:', e);
    }
  }

  loadingMessage.className = 'message assistant';
  if (!loadingMessage.id) {
    loadingMessage.id = `msg-${Date.now()}`;
  }
  if (typeof window.addMessageCopyButton === 'function') {
    window.addMessageCopyButton(loadingMessage, loadingMessage.id);
  }
}

export function handleNonStreamingResponse(data, loadingId) {
  const loadingMessage = document.getElementById(loadingId);
  const responsePayload = data && data.response ? data.response : data;
  if (!loadingMessage || !responsePayload) {
    handleInvalidResponse(loadingId);
    return;
  }

  const outputText = Array.isArray(responsePayload.output)
    ? responsePayload.output.filter(item => item && item.type === 'output_text')
      .map(item => item.text || item.content || '')
      .join('')
    : (responsePayload.output_text || '');

  const reasoningText = responsePayload.reasoning && Array.isArray(responsePayload.reasoning.output)
    ? responsePayload.reasoning.output.map(item => item?.content || '').join('')
    : '';

  finalizeStreamedResponse(loadingMessage, {
    content: outputText,
    reasoning: reasoningText,
    response: responsePayload,
  });
  window.resetSendButton();
}

export function hasValidAssistantMessage(data) {
  if (!data) {
    return false;
  }
  const responsePayload = data && data.response ? data.response : data;
  if (!responsePayload) {
    return false;
  }
  if (Array.isArray(responsePayload.output)) {
    return responsePayload.output.some(item => item && item.type === 'output_text' && item.text);
  }
  return typeof responsePayload.output_text === 'string' && responsePayload.output_text.trim().length > 0;
}

export function addToConversationHistory(assistantMessage, reasoning) {
  const msgId = typeof window.generateMessageId === 'function'
    ? window.generateMessageId()
    : `msg-${Date.now()}`;

  window.conversationHistory.push({
    role: 'assistant',
    content: assistantMessage,
    reasoning: reasoning || '',
    id: msgId,
    timestamp: new Date().toISOString(),
  });

  return msgId;
}

export function updateLoadingIndicator(loadingMessage, assistantMessageObj) {
  if (loadingMessage) {
    if (assistantMessageObj && assistantMessageObj.id) {
      loadingMessage.id = assistantMessageObj.id;
    }
    const cursor = loadingMessage.querySelector('.streaming-cursor');
    if (cursor) {
      cursor.classList.add('fade-out');
      setTimeout(() => {
        updateMessageContent(loadingMessage, assistantMessageObj);
      }, 250);
    } else {
      updateMessageContent(loadingMessage, assistantMessageObj);
    }
  } else {
    const processedMessage = processMainContentMarkdown(assistantMessageObj.content);
    window.appendAssistantMessage(processedMessage);
  }
}

export function updateMessageContent(loadingMessage, assistantMessageObj) {
  if (!loadingMessage) {
    return;
  }
  const contentWrapper = loadingMessage.querySelector('.message-content');
  if (!contentWrapper) {
    return;
  }
  const content = typeof assistantMessageObj === 'string' ? assistantMessageObj : (assistantMessageObj.content || '');
  const reasoning = typeof assistantMessageObj === 'string' ? '' : (assistantMessageObj.reasoning || '');
  const codeOutputs = typeof assistantMessageObj === 'string'
    ? null
    : (assistantMessageObj.codeInterpreterOutputs || null);
  let processedText = content;
  let thinkingContent = reasoning;
  let hasThinking = Boolean(thinkingContent);
  const thinkingId = `thinking-${loadingMessage.id}`;

  contentWrapper.innerHTML = '';

  if (window.messageImages && window.messageImages[loadingMessage.id]) {
    const imagesContainer = document.createElement('div');
    imagesContainer.className = 'generated-images';
    imagesContainer.innerHTML = window.messageImages[loadingMessage.id].join('');
    contentWrapper.appendChild(imagesContainer);
    window.setupImageInteractions(imagesContainer);
  }

  if (hasThinking) {
    const containerHTML =
      `<div id="${thinkingId}" class="thinking-container">
         <div class="thinking-title" onclick="toggleThinking('${thinkingId}', event)">Reasoning</div>
         <div class="thinking-content"></div>
       </div>`;
    contentWrapper.insertAdjacentHTML('beforeend', containerHTML);
    const thinkingContainer = document.getElementById(thinkingId);
    if (thinkingContainer) {
      const persistedExpanded = (window.userThinkingState && window.userThinkingState[thinkingId] === true);
      const hasPersisted = !!(window.userThinkingState && Object.prototype.hasOwnProperty.call(window.userThinkingState, thinkingId));
      const shouldCollapse = hasPersisted ? !persistedExpanded : true;

      const contentDiv = thinkingContainer.querySelector('.thinking-content');
      if (contentDiv) {
        contentDiv.innerHTML = processMainContentMarkdown(thinkingContent);
        if (!shouldCollapse) {
          contentDiv.scrollTop = contentDiv.scrollHeight;
        }
      }
      if (shouldCollapse) {
        thinkingContainer.classList.add('collapsed');
      } else {
        thinkingContainer.classList.remove('collapsed');
      }
    }
  }

  const mainContentContainer = document.createElement('div');
  mainContentContainer.className = 'main-response-content';
  mainContentContainer.innerHTML = processMainContentMarkdown(processedText);
  contentWrapper.appendChild(mainContentContainer);

  renderCodeInterpreterOutputs(loadingMessage, codeOutputs);

  updateFinalMessage(loadingMessage);
}

export function removeLoadingIndicator(loadingId) {
  const loadingMessage = document.getElementById(loadingId);
  if (loadingMessage) {
    window.chatBox.removeChild(loadingMessage);
  }
}

export function handleInvalidResponse(loadingId) {
  removeLoadingIndicator(loadingId);
  if (window.showError) {
    window.showError('Unexpected API response format.');
  }
}
