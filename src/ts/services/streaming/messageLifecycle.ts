/**
 * Message lifecycle helpers used during streaming and finalization.
 */

import { elements, state } from "../../init/state.ts";
import { showError } from "../../utils/notifications.ts";
import { updateBrowserHistory } from "../history/state.ts";
import { saveCurrentConversation } from "../history/persistence.ts";
import { ttsConfig, generateTtsForMessage } from "../tts.ts";
import {
  logImageDebug,
  processImageGenerationOutputs,
} from "./imageGeneration.ts";
import {
  extractCodeInterpreterOutputs,
  type CodeInterpreterOutputs,
} from "./codeInterpreter.ts";
import { renderCodeInterpreterOutputs } from "./codeInterpreterRender.ts";
import {
  processMainContentMarkdown,
  separateThinkingSegments,
} from "./thinkingUtils.ts";
import { highlightAndAddCopyButtons, generateMessageId, addMessageCopyButton } from "../../components/messages.ts";
import { decorateAssistantMessage, captureVariantImages } from "../../components/messageActions.ts";
import { recordRegeneratedVariant, applyVariant } from "../../components/messageVariants.ts";
import { setupImageInteractions } from "../../components/ui/imageInteractions.ts";
import { hideImageWaitSpinner } from "../../components/ui/imageWaitSpinner.ts";
import { createMediaPlaceholderRegex, mediaPlaceholder } from "../../utils/placeholders.ts";
import type { StreamedMessageContent, ResponseObject } from "../../../types/api.ts";
import { isRecord } from "../../utils/utils.ts";
import { extractOutputText, extractReasoningText } from "./finalizeExtract.ts";

/**
 * Renders (or updates in place) the collapsible "Reasoning" panel inside a
 * message's content wrapper.
 *
 * @remarks
 * Honors the user's persisted expand/collapse choice for this `thinkingId`
 * (from {@link state.userThinkingState}); absent a stored choice it falls back
 * to the existing container's current state, or collapsed for a new panel.
 * Shared by {@link finalizeStreamedResponse} (which reuses any existing panel)
 * and {@link updateMessageContent} (which rebuilds it each streaming tick).
 *
 * @param contentWrapper - The `.message-content` element to render into.
 * @param thinkingId - The reasoning container's element id.
 * @param thinkingContent - Raw reasoning markdown to render.
 * @param existingContainer - A pre-existing reasoning container to reuse, or `null` to create one.
 * @param scrollWhenExpanded - When `true`, scrolls the content to the bottom if the panel is expanded.
 */
function renderThinkingPanel(
  contentWrapper: HTMLElement,
  thinkingId: string,
  thinkingContent: string,
  existingContainer: HTMLElement | null,
  scrollWhenExpanded: boolean,
) {
  const persistedExpanded = (state.userThinkingState && state.userThinkingState[thinkingId] === true);
  const hasPersisted = Boolean(state.userThinkingState && Object.prototype.hasOwnProperty.call(state.userThinkingState, thinkingId));
  const priorWasCollapsed = existingContainer ? existingContainer.classList.contains("collapsed") : true;
  const shouldCollapse = hasPersisted ? !persistedExpanded : priorWasCollapsed;

  let container: HTMLElement | null = existingContainer;
  if (!container) {
    const containerHTML =
      `<div id="${thinkingId}" class="thinking-container">
         <div class="thinking-title">Reasoning</div>
         <div class="thinking-content"></div>
       </div>`;
    contentWrapper.insertAdjacentHTML("beforeend", containerHTML);
    container = document.getElementById(thinkingId);
  }

  if (!container) {
    return;
  }

  const contentDiv = container.querySelector<HTMLElement>(".thinking-content");
  if (contentDiv) {
    contentDiv.innerHTML = processMainContentMarkdown(thinkingContent);
    if (scrollWhenExpanded && !shouldCollapse) {
      contentDiv.scrollTop = contentDiv.scrollHeight;
    }
  }
  if (shouldCollapse) {
    container.classList.add("collapsed");
  } else {
    container.classList.remove("collapsed");
  }
}

/**
 * Finalizes a streamed assistant message: renders content/reasoning, processes
 * any generated images and code-interpreter outputs, triggers TTS, and persists
 * the conversation.
 */
export function finalizeStreamedResponse(loadingMessage: HTMLElement | null, contentObj: string | StreamedMessageContent) {
  if (!loadingMessage) {
    return;
  }

  hideImageWaitSpinner(loadingMessage);

  const responsePayload: unknown = contentObj && typeof contentObj === "object" ? contentObj.response || null : null;
  let content = contentObj && typeof contentObj === "object" ? (contentObj.content || "") : (contentObj || "");
  let reasoning = contentObj && typeof contentObj === "object" ? (contentObj.reasoning || "") : "";
  const incomplete = contentObj && typeof contentObj === "object" ? Boolean(contentObj.incomplete) : false;

  if (!content) {
    content = extractOutputText(responsePayload);
  }
  if (!reasoning) {
    reasoning = extractReasoningText(responsePayload);
  }

  if (content) {
    const parsedThinking = separateThinkingSegments(content);
    content = parsedThinking.content;
    if (parsedThinking.reasoning) {
      reasoning = reasoning
        ? `${reasoning.replace(/\n+$/, "")}\n\n${parsedThinking.reasoning}`
        : parsedThinking.reasoning;
    }
  }

  let codeInterpreterOutputs: CodeInterpreterOutputs = { attachments: [], logs: [] };
  if (responsePayload) {
    try {
      processImageGenerationOutputs(responsePayload as ResponseObject | null);
    } catch (error) {
      console.error("Failed to process image generation outputs:", error);
    }
    try {
      codeInterpreterOutputs = extractCodeInterpreterOutputs(responsePayload as ResponseObject | null);
    } catch (error) {
      console.error("Failed to extract code interpreter outputs:", error);
      codeInterpreterOutputs = { attachments: [], logs: [] };
    }
  }

  const hasPendingMedia = Array.isArray(state.currentGeneratedImageHtml)
    ? state.currentGeneratedImageHtml.length > 0
    : false;

  if (!hasPendingMedia && !content.trim() && !reasoning.trim()) {
    return;
  }

  const cleanedContent = content;
  let processedText = cleanedContent;
  let thinkingContent = reasoning;
  let hasThinking = Boolean(thinkingContent);

  const thinkingId = `thinking-${loadingMessage.id}`;
  const contentWrapper = loadingMessage.querySelector<HTMLElement>(".message-content");
  if (!contentWrapper) {
    return;
  }

  if (!loadingMessage.id) {
    loadingMessage.id = generateMessageId();
  }

  if (state.currentGeneratedImageHtml && state.currentGeneratedImageHtml.length > 0) {
    logImageDebug("Detected pending generated images before rendering message.", {
      count: state.currentGeneratedImageHtml.length,
    });
  }

  let fullContent = content;
  const generatedFilenames = (state.currentGeneratedImageHtml || [])
    .map(html => {
      const match = html.match(/data-filename="([^"]+)"/);
      return match ? match[1] : null;
    })
    .filter((filename): filename is string => Boolean(filename));

  const knownFilenames = new Set(generatedFilenames);
  if (Array.isArray(state.generatedImages)) {
    state.generatedImages.forEach(img => {
      if (img && img.filename) {
        knownFilenames.add(img.filename);
      }
    });
  }
  fullContent = fullContent.replace(createMediaPlaceholderRegex(), (match, filename) => {
    return knownFilenames.has(String(filename || "").trim()) ? match : "";
  });

  const missingPlaceholders = generatedFilenames.filter(filename => !fullContent.includes(filename));
  const willHaveImages = generatedFilenames.length > 0;

  if (missingPlaceholders.length) {
    const imageList = missingPlaceholders.map(mediaPlaceholder).join("\n");
    fullContent = fullContent.trim() ? `${imageList}\n\n${fullContent}` : imageList;
  }

  const responseId = isRecord(responsePayload) && typeof responsePayload.id === "string"
    ? responsePayload.id
    : undefined;

  const existingEntry = state.conversationHistory.find(
    (entry) => entry.id === loadingMessage.id && entry.role === "assistant",
  );

  if (existingEntry) {
    recordRegeneratedVariant(existingEntry, {
      content: fullContent,
      reasoning,
      responseId,
      codeInterpreterOutputs,
      hasImages: willHaveImages,
      incomplete,
    });
    applyVariant(existingEntry, existingEntry.variants![existingEntry.activeVariant!]);
  } else {
    state.conversationHistory.push({
      role: "assistant",
      content: fullContent,
      reasoning,
      id: loadingMessage.id,
      timestamp: new Date().toISOString(),
      hasImages: willHaveImages,
      responseId,
      codeInterpreterOutputs,
      incomplete,
      character: contentObj && typeof contentObj === "object" ? contentObj.character : undefined,
    });
  }

  const existingThinkingContainer = document.getElementById(thinkingId);
  const existingMainContentContainer = contentWrapper.querySelector<HTMLElement>(".main-response-content");
  const existingImagesContainer = contentWrapper.querySelector<HTMLElement>(".generated-images");

  if (state.currentGeneratedImageHtml && state.currentGeneratedImageHtml.length > 0) {
    let imagesContainer: HTMLElement = existingImagesContainer ?? document.createElement("div");
    if (!existingImagesContainer) {
      imagesContainer.className = "generated-images";
      contentWrapper.appendChild(imagesContainer);
    }
    imagesContainer.innerHTML = state.currentGeneratedImageHtml.join("");
    setupImageInteractions(imagesContainer);
    logImageDebug("Injected generated images into chat bubble.", {
      imageCount: state.currentGeneratedImageHtml.length,
      messageId: loadingMessage.id,
    });

    const thisMessageImages = [...state.currentGeneratedImageHtml];
    if (!state.messageImages) {
      state.messageImages = {};
    }
    state.messageImages[loadingMessage.id] = thisMessageImages;

    const filenamesForThisMessage = thisMessageImages
      .map(html => {
        const match = html.match(/data-filename="([^"]+)"/);
        return match ? match[1] : null;
      })
      .filter(Boolean);
    if (Array.isArray(state.generatedImages)) {
      state.generatedImages.forEach(img => {
        if (!img.associatedMessageId && img.filename && filenamesForThisMessage.includes(img.filename)) {
          img.associatedMessageId = loadingMessage.id;
        }
      });
    }

    const historyEntry = state.conversationHistory.find(entry => entry.id === loadingMessage.id);
    if (historyEntry) {
      historyEntry.hasImages = true;
      logImageDebug("Marked conversation history entry as having images.", {
        messageId: loadingMessage.id,
      });
    }
  }

  if (hasThinking) {
    renderThinkingPanel(contentWrapper, thinkingId, thinkingContent, existingThinkingContainer, false);
  }

  const finalMainContentContainer: HTMLElement = existingMainContentContainer ?? document.createElement("div");
  if (!existingMainContentContainer) {
    finalMainContentContainer.className = "main-response-content";
    contentWrapper.appendChild(finalMainContentContainer);
  }
  finalMainContentContainer.innerHTML = processMainContentMarkdown(processedText);
  renderCodeInterpreterOutputs(loadingMessage, codeInterpreterOutputs);

  if (existingEntry) {
    captureVariantImages(existingEntry);
  }

  updateFinalMessage(loadingMessage);

  if (ttsConfig.enabled) {
    generateTtsForMessage(content, loadingMessage.id);
  }

  updateBrowserHistory();

  saveCurrentConversation();

  if (state.currentGeneratedImageHtml && state.currentGeneratedImageHtml.length > 0) {
    logImageDebug("Resetting currentGeneratedImageHtml; pending images should now be associated.", {
      messageId: loadingMessage.id,
    });
  }
  state.currentGeneratedImageHtml = [];
}

/**
 * Applies final styling to a completed message: highlights code, adds copy
 * buttons, and assigns an id if missing.
 */
export function updateFinalMessage(loadingMessage: HTMLElement | null) {
  if (!loadingMessage) {
    return;
  }

  try {
    highlightAndAddCopyButtons(loadingMessage);
  } catch (e) {
    console.warn("Error highlighting code in final message:", e);
  }

  loadingMessage.className = "message assistant";
  if (!loadingMessage.id) {
    loadingMessage.id = `msg-${Date.now()}`;
  }
  addMessageCopyButton(loadingMessage, loadingMessage.id);
  decorateAssistantMessage(loadingMessage, loadingMessage.id);
}

/**
 * Re-renders a message's content in place during streaming: separates reasoning
 * from main text, injects generated images, builds the collapsible reasoning
 * panel, and renders code-interpreter outputs.
 */
export function updateMessageContent(loadingMessage: HTMLElement | null, assistantMessageObj: string | StreamedMessageContent) {
  if (!loadingMessage) {
    return;
  }
  const contentWrapper = loadingMessage.querySelector<HTMLElement>(".message-content");
  if (!contentWrapper) {
    return;
  }
  const content = typeof assistantMessageObj === "string" ? assistantMessageObj : (assistantMessageObj.content || "");
  const reasoning = typeof assistantMessageObj === "string" ? "" : (assistantMessageObj.reasoning || "");
  const codeOutputs = typeof assistantMessageObj === "string"
    ? null
    : ((assistantMessageObj.codeInterpreterOutputs as CodeInterpreterOutputs) || null);
  const parsedThinking = separateThinkingSegments(content);
  let processedText = parsedThinking.content;
  let thinkingContent = reasoning;
  if (parsedThinking.reasoning) {
    thinkingContent = thinkingContent
      ? `${thinkingContent.replace(/\n+$/, "")}\n\n${parsedThinking.reasoning}`
      : parsedThinking.reasoning;
  }
  let hasThinking = Boolean(thinkingContent);
  const thinkingId = `thinking-${loadingMessage.id}`;

  const partyNameLabel = contentWrapper.querySelector<HTMLElement>(":scope > .party-name");

  contentWrapper.innerHTML = "";

  if (partyNameLabel) {
    contentWrapper.appendChild(partyNameLabel);
  }

  if (state.messageImages && state.messageImages[loadingMessage.id]) {
    const imagesContainer = document.createElement("div");
    imagesContainer.className = "generated-images";
    imagesContainer.innerHTML = state.messageImages[loadingMessage.id].join("");
    contentWrapper.appendChild(imagesContainer);
    setupImageInteractions(imagesContainer);
  }

  if (hasThinking) {
    renderThinkingPanel(contentWrapper, thinkingId, thinkingContent, null, true);
  }

  const mainContentContainer = document.createElement("div");
  mainContentContainer.className = "main-response-content";
  mainContentContainer.innerHTML = processMainContentMarkdown(processedText);
  contentWrapper.appendChild(mainContentContainer);

  renderCodeInterpreterOutputs(loadingMessage, codeOutputs);

  updateFinalMessage(loadingMessage);
}

/** Removes the loading-indicator message element for `loadingId`, if present. */
export function removeLoadingIndicator(loadingId: string) {
  const loadingMessage = document.getElementById(loadingId);
  if (loadingMessage && elements.chatBox) {
    elements.chatBox.removeChild(loadingMessage);
  }
}

/** Clears the loading indicator and shows an "unexpected response" error. */
export function handleInvalidResponse(loadingId: string) {
  removeLoadingIndicator(loadingId);
  if (showError) {
    showError("Unexpected API response format.");
  }
}
