/**
 * Message lifecycle helpers used during streaming and finalization.
 */

import { elements, state } from "../../init/state.ts";
import { showError } from "../../utils/notifications.ts";
import { updateBrowserHistory } from "../history/state.ts";
import { saveCurrentConversation } from "../history/persistence.ts";
import { ttsConfig, generateTtsForMessage } from "../tts.ts";
import {
  imageDebugLog,
  processImageGenerationOutputs,
} from "./imageGeneration.ts";
import {
  extractCodeInterpreterOutputs,
  renderCodeInterpreterOutputs,
  type CodeInterpreterOutputs,
} from "./codeInterpreter.ts";
import {
  processMainContentMarkdown,
  separateThinkingSegments,
} from "./thinkingUtils.ts";
import { highlightAndAddCopyButtons, generateMessageId, addMessageCopyButton } from "../../components/messages.ts";
import { setupImageInteractions } from "../../components/ui/imageInteractions.ts";
import type { StreamedMessageContent, ResponseObject } from "../../../types/api.ts";
import { isRecord } from "../../utils/utils.ts";

/**
 * Finalizes a streamed assistant message: renders content/reasoning, processes
 * any generated images and code-interpreter outputs, triggers TTS, and persists
 * the conversation.
 */
export function finalizeStreamedResponse(loadingMessage: HTMLElement | null, contentObj: string | StreamedMessageContent) {
  if (!loadingMessage) {
    return;
  }

  const responsePayload: unknown = contentObj && typeof contentObj === "object" ? contentObj.response || null : null;
  let content = contentObj && typeof contentObj === "object" ? (contentObj.content || "") : (contentObj || "");
  let reasoning = contentObj && typeof contentObj === "object" ? (contentObj.reasoning || "") : "";

  function extractOutputText(payload: unknown): string {
    if (!isRecord(payload)) {
      return "";
    }
    if (Array.isArray(payload.output)) {
      return payload.output
        .filter((item): item is Record<string, unknown> => isRecord(item) && item.type === "output_text")
        .map((item) => {
          if (typeof item.text === "string" && item.text) return item.text;
          if (typeof item.content === "string" && item.content) return item.content;
          return "";
        })
        .join("");
    }
    if (typeof payload.output_text === "string") {
      return payload.output_text;
    }
    if (Array.isArray(payload.output_text)) {
      return payload.output_text.join("");
    }
    return "";
  }

  function extractReasoningText(payload: unknown): string {
    if (!isRecord(payload)) {
      return "";
    }
    const flattenContentArray = (items: unknown[]) => {
      return items
        .map((item: unknown) => {
          if (typeof item === "string") {
            return item;
          }
          if (isRecord(item)) {
            if (typeof item.text === "string") {
              return item.text;
            }
            if (typeof item.content === "string") {
              return item.content;
            }
          }
          return "";
        })
        .join("");
    };
    const reasoning = payload.reasoning;
    if (typeof reasoning === "string") {
      return reasoning;
    }
    if (Array.isArray(reasoning)) {
      return reasoning.map((item: unknown) => (isRecord(item) && typeof item.content === "string" ? item.content : "")).join("");
    }
    if (isRecord(reasoning) && Array.isArray(reasoning.output)) {
      return reasoning.output.map((item: unknown) => (isRecord(item) && typeof item.content === "string" ? item.content : "")).join("");
    }
    if (typeof payload.reasoning_content === "string") {
      return payload.reasoning_content;
    }
    if (Array.isArray(payload.reasoning_content)) {
      return flattenContentArray(payload.reasoning_content);
    }
    if (isRecord(reasoning) && typeof reasoning.content === "string") {
      return reasoning.content;
    }
    return "";
  }

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
        ? `${reasoning}${reasoning.endsWith("\n") ? "" : "\n"}${parsedThinking.reasoning}`
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
    imageDebugLog("Detected pending generated images before rendering message.", {
      count: state.currentGeneratedImageHtml.length,
    });
  }

  let fullContent = content;
  const hasExistingImagePlaceholders = /\[\[(?:IMAGE|MEDIA): [^\]]+\]\]/.test(fullContent);
  const willHaveImages = !hasExistingImagePlaceholders &&
                         state.currentGeneratedImageHtml &&
                         state.currentGeneratedImageHtml.length > 0;

  if (willHaveImages) {
    const imageList = state.currentGeneratedImageHtml
      .map(html => {
        const match = html.match(/data-filename="([^"]+)"/);
        return match ? `[[MEDIA: ${match[1]}]]` : null;
      })
      .filter(Boolean)
      .join("\n");
    if (imageList) {
      fullContent = `${imageList}\n\n${fullContent}`;
    }
  }

  state.conversationHistory.push({
    role: "assistant",
    content: fullContent,
    reasoning,
    id: loadingMessage.id,
    timestamp: new Date().toISOString(),
    hasImages: willHaveImages,
    responseId: isRecord(responsePayload) && typeof responsePayload.id === "string" ? responsePayload.id : undefined,
    codeInterpreterOutputs,
  });

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
    imageDebugLog("Injected generated images into chat bubble.", {
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
      imageDebugLog("Marked conversation history entry as having images.", {
        messageId: loadingMessage.id,
      });
    }
  }

  if (hasThinking) {
    let finalThinkingContainer: HTMLElement | null = existingThinkingContainer;
    const persistedExpanded = (state.userThinkingState && state.userThinkingState[thinkingId] === true);
    const hasPersisted = Boolean(state.userThinkingState && Object.prototype.hasOwnProperty.call(state.userThinkingState, thinkingId));
    const priorWasCollapsed = finalThinkingContainer ? finalThinkingContainer.classList.contains("collapsed") : true;
    const shouldCollapse = hasPersisted ? !persistedExpanded : priorWasCollapsed;

    if (!finalThinkingContainer) {
      const containerHTML =
        `<div id="${thinkingId}" class="thinking-container">
           <div class="thinking-title">Reasoning</div>
           <div class="thinking-content"></div>
         </div>`;
      contentWrapper.insertAdjacentHTML("beforeend", containerHTML);
      finalThinkingContainer = document.getElementById(thinkingId);
    }

    if (finalThinkingContainer) {
      const contentDiv = finalThinkingContainer.querySelector<HTMLElement>(".thinking-content");
      if (contentDiv) {
        contentDiv.innerHTML = processMainContentMarkdown(thinkingContent);
      }
      if (shouldCollapse) {
        finalThinkingContainer.classList.add("collapsed");
      } else {
        finalThinkingContainer.classList.remove("collapsed");
      }
    }
  }

  const finalMainContentContainer: HTMLElement = existingMainContentContainer ?? document.createElement("div");
  if (!existingMainContentContainer) {
    finalMainContentContainer.className = "main-response-content";
    contentWrapper.appendChild(finalMainContentContainer);
  }
  finalMainContentContainer.innerHTML = processMainContentMarkdown(processedText);
  renderCodeInterpreterOutputs(loadingMessage, codeInterpreterOutputs);

  updateFinalMessage(loadingMessage);

  if (ttsConfig.enabled) {
    generateTtsForMessage(content, loadingMessage.id);
  }

  updateBrowserHistory();

  saveCurrentConversation();

  if (state.currentGeneratedImageHtml && state.currentGeneratedImageHtml.length > 0) {
    imageDebugLog("Resetting currentGeneratedImageHtml; pending images should now be associated.", {
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
      ? `${thinkingContent}${thinkingContent.endsWith("\n") ? "" : "\n"}${parsedThinking.reasoning}`
      : parsedThinking.reasoning;
  }
  let hasThinking = Boolean(thinkingContent);
  const thinkingId = `thinking-${loadingMessage.id}`;

  contentWrapper.innerHTML = "";

  if (state.messageImages && state.messageImages[loadingMessage.id]) {
    const imagesContainer = document.createElement("div");
    imagesContainer.className = "generated-images";
    imagesContainer.innerHTML = state.messageImages[loadingMessage.id].join("");
    contentWrapper.appendChild(imagesContainer);
    setupImageInteractions(imagesContainer);
  }

  if (hasThinking) {
    const containerHTML =
      `<div id="${thinkingId}" class="thinking-container">
         <div class="thinking-title">Reasoning</div>
         <div class="thinking-content"></div>
       </div>`;
    contentWrapper.insertAdjacentHTML("beforeend", containerHTML);
    const thinkingContainer = document.getElementById(thinkingId);
    if (thinkingContainer) {
      const persistedExpanded = (state.userThinkingState && state.userThinkingState[thinkingId] === true);
      const hasPersisted = Boolean(state.userThinkingState && Object.prototype.hasOwnProperty.call(state.userThinkingState, thinkingId));
      const shouldCollapse = hasPersisted ? !persistedExpanded : true;

      const contentDiv = thinkingContainer.querySelector<HTMLElement>(".thinking-content");
      if (contentDiv) {
        contentDiv.innerHTML = processMainContentMarkdown(thinkingContent);
        if (!shouldCollapse) {
          contentDiv.scrollTop = contentDiv.scrollHeight;
        }
      }
      if (shouldCollapse) {
        thinkingContainer.classList.add("collapsed");
      } else {
        thinkingContainer.classList.remove("collapsed");
      }
    }
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
