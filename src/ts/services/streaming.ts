import { elements, state } from "../init/state.ts";
import { ensureImagesHaveMessageIds } from "./streaming/imageGeneration.ts";
import { createStreamingRuntime } from "./streaming/runtime.ts";
import { createStreamingEventProcessor } from "./streaming/eventProcessor.ts";
import { setupImageInteractions } from "../components/ui/imageInteractions.ts";

export { ensureImagesHaveMessageIds };

export async function handleStreamedResponse(response, loadingId) {
  const loadingMessage = document.getElementById(loadingId) as any;
  if (!loadingMessage) {
    return { response: null, outputText: "", reasoningText: "" };
  }

  const contentWrapper = loadingMessage.querySelector(".message-content") as any;
  if (!contentWrapper) {
    return { response: null, outputText: "", reasoningText: "" };
  }

  const placeholderElement = (() => {
    const childArray = Array.from(contentWrapper.children || []);
    return childArray.find((node: any) => node.nodeType === 1 && node.classList && node.classList.contains("loading-animation")) || null;
  })();

  let mainContentContainer = contentWrapper.querySelector(".main-response-content") as any;
  if (!mainContentContainer) {
    mainContentContainer = document.createElement("div");
    mainContentContainer.className = "main-response-content";
    if (placeholderElement) {
      mainContentContainer.style.display = "none";
    }
    contentWrapper.appendChild(mainContentContainer);
  }

  if (state.currentGeneratedImageHtml && state.currentGeneratedImageHtml.length > 0) {
    const imagesContainer = document.createElement("div");
    imagesContainer.className = "generated-images";
    imagesContainer.innerHTML = state.currentGeneratedImageHtml.join("");
    contentWrapper.appendChild(imagesContainer);
    setupImageInteractions(contentWrapper);
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

  state.shouldAutoScroll = true;
  elements.chatBox.scrollTop = elements.chatBox.scrollHeight;

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
    while (!state.shouldStopGeneration) {
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
    state.shouldStopGeneration = false;
  }

  processor.finalize();

  const basePayload = processor.getFinalResponsePayload() || {};
  const responsePayload = processor.attachImages(basePayload) || {};

  return {
    response: responsePayload,
    outputText: runtime.getOutputText(),
    reasoningText: runtime.getReasoningText(),
  };
}

