import { ensureImagesHaveMessageIds } from "./streaming/imageGeneration.js";
import { processMainContentMarkdown } from "./streaming/thinkingUtils.js";
import {
  addToConversationHistory,
  finalizeStreamedResponse,
  handleInvalidResponse,
  handleNonStreamingResponse,
  hasValidAssistantMessage,
  removeLoadingIndicator,
  updateFinalMessage,
  updateLoadingIndicator,
  updateMessageContent,
} from "./streaming/messageLifecycle.js";
import { createStreamingRuntime } from "./streaming/runtime.js";
import { createStreamingEventProcessor } from "./streaming/eventProcessor.js";

window.ensureImagesHaveMessageIds = ensureImagesHaveMessageIds;

window.handleStreamedResponse = async function(response, loadingId) {
  const loadingMessage = document.getElementById(loadingId);
  if (!loadingMessage) {
    return { response: null, outputText: "", reasoningText: "" };
  }

  const contentWrapper = loadingMessage.querySelector(".message-content");
  if (!contentWrapper) {
    return { response: null, outputText: "", reasoningText: "" };
  }

  const placeholderElement = (() => {
    const childArray = Array.from(contentWrapper.children || []);
    return childArray.find(node => node.nodeType === 1 && node.classList && node.classList.contains("loading-animation")) || null;
  })();

  let mainContentContainer = contentWrapper.querySelector(".main-response-content");
  if (!mainContentContainer) {
    mainContentContainer = document.createElement("div");
    mainContentContainer.className = "main-response-content";
    if (placeholderElement) {
      mainContentContainer.style.display = "none";
    }
    contentWrapper.appendChild(mainContentContainer);
  }

  if (window.currentGeneratedImageHtml && window.currentGeneratedImageHtml.length > 0) {
    const imagesContainer = document.createElement("div");
    imagesContainer.className = "generated-images";
    imagesContainer.innerHTML = window.currentGeneratedImageHtml.join("");
    contentWrapper.appendChild(imagesContainer);
    if (typeof window.setupImageInteractions === "function") {
      window.setupImageInteractions(contentWrapper);
    }
  }

  const reader = response.body && response.body.getReader ? response.body.getReader() : null;
  if (!reader) {
    throw new Error("Streaming response missing body.");
  }

  const thinkingId = `thinking-${loadingMessage.id}`;
  const runtime = createStreamingRuntime({
    loadingMessage,
    contentWrapper,
    placeholderElement,
    mainContentContainer,
    thinkingId,
    existingThinkingContainer: document.getElementById(thinkingId) || null,
  });
  const processor = createStreamingEventProcessor(runtime);

  window.shouldAutoScroll = true;
  window.chatBox.scrollTop = window.chatBox.scrollHeight;

  const decoder = new TextDecoder();
  let buffer = "";
  let currentEventType = null;
  let currentEventData = [];

  function flushEvent() {
    if (currentEventType || currentEventData.length) {
      processor.processEvent(currentEventType, currentEventData);
      currentEventType = null;
      currentEventData = [];
    }
  }

  try {
    while (!window.shouldStopGeneration) {
      const { done, value } = await reader.read();
      if (done) {
        flushEvent();
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const rawLine = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        const line = rawLine.replace(/\r?$/, "");

        if (line.startsWith("event:")) {
          currentEventType = line.substring(6).trim();
        } else if (line.startsWith("data:")) {
          currentEventData.push(line.substring(5).trim());
        } else if (line.trim() === "") {
          flushEvent();
        }
      }
    }
  } catch (streamError) {
    if (streamError.name === "AbortError") {
      flushEvent();
    } else {
      console.error("Stream reading error:", streamError);
      throw streamError;
    }
  } finally {
    window.shouldStopGeneration = false;
  }

  processor.finalize();

  const basePayload = processor.getFinalResponsePayload() || {};
  const responsePayload = processor.attachImages(basePayload) || {};

  return {
    response: responsePayload,
    outputText: runtime.getOutputText(),
    reasoningText: runtime.getReasoningText(),
  };
};

window.processMainContentMarkdown = processMainContentMarkdown;
window.finalizeStreamedResponse = finalizeStreamedResponse;
window.updateFinalMessage = updateFinalMessage;
window.handleNonStreamingResponse = handleNonStreamingResponse;
window.hasValidAssistantMessage = hasValidAssistantMessage;
window.addToConversationHistory = addToConversationHistory;
window.updateLoadingIndicator = updateLoadingIndicator;
window.updateMessageContent = updateMessageContent;
window.removeLoadingIndicator = removeLoadingIndicator;
window.handleInvalidResponse = handleInvalidResponse;

