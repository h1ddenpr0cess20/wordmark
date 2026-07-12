/**
 * Streaming runtime.
 *
 * @remarks
 * Holds the mutable per-response accumulation state (text, reasoning, images,
 * code-interpreter outputs) and the DOM update helpers that the event processor
 * drives as a stream arrives.
 */

import { elements, state } from "../../init/state.ts";
import {
  IMAGE_GENERATION_CALL_TYPE,
  collectImageCandidates,
  logImageDebug,
  type ImageCandidate,
} from "./imageGeneration.ts";
import { processMainContentMarkdown, separateThinkingSegments } from "./thinkingUtils.ts";
import { highlightAndAddCopyButtons } from "../../components/messages.ts";
import { fastScroll } from "../../utils/dom/mobileHandling.ts";

interface StreamingRuntimeOptions {
  loadingMessage: HTMLElement;
  contentWrapper: HTMLElement;
  placeholderElement: HTMLElement | null;
  mainContentContainer: HTMLElement;
  thinkingId: string;
  existingThinkingContainer: HTMLElement | null;
}

interface AccumulatedImage {
  dataUrl: string;
  mimeType: string;
  sourceLabel: string;
}

/**
 * Builds the runtime helpers responsible for tracking streaming state and
 * updating the DOM incrementally while the response arrives.
 *
 * @param options - DOM references and identifiers for the stream.
 * @param options.loadingMessage - The loading message element.
 * @param options.contentWrapper - Wrapper for message content.
 * @param options.placeholderElement - Optional loading spinner element.
 * @param options.mainContentContainer - Container for main response text.
 * @param options.thinkingId - DOM id for the reasoning container.
 * @param options.existingThinkingContainer - Previously rendered reasoning container, if any.
 * @returns The runtime helpers used by the streaming pipeline.
 */
export function createStreamingRuntime({
  loadingMessage,
  contentWrapper,
  placeholderElement,
  mainContentContainer,
  thinkingId,
  existingThinkingContainer,
}: StreamingRuntimeOptions) {
  const accumulatedImageOutputs: AccumulatedImage[] = [];
  const accumulatedImageSeen = new Set<string>();
  let placeholderCleared = !placeholderElement;
  let accumulatedContent = "";
  let accumulatedReasoning = "";
  let thinkingContainer: HTMLElement | null = existingThinkingContainer || null;

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
      mainContentContainer.style.removeProperty("display");
    }
  }

  function ensureThinkingContainer(persistedExpanded: boolean, hasPersisted: boolean, priorWasCollapsed: boolean) {
    if (thinkingContainer) {
      return thinkingContainer;
    }
    const containerHTML =
      `<div id="${thinkingId}" class="thinking-container">
         <div class="thinking-title">Reasoning</div>
         <div class="thinking-content"></div>
       </div>`;
    mainContentContainer.insertAdjacentHTML("beforebegin", containerHTML);
    thinkingContainer = document.getElementById(thinkingId);
    if (thinkingContainer && accumulatedReasoning) {
      thinkingContainer.dataset.accumulatedReasoning = accumulatedReasoning;
      if (hasPersisted && !persistedExpanded) {
        thinkingContainer.classList.add("collapsed");
      } else if (!priorWasCollapsed) {
        thinkingContainer.classList.remove("collapsed");
      }
    }
    return thinkingContainer;
  }

  let renderScheduled = false;

  /**
   * Coalesces render requests to one DOM update per animation frame. Deltas
   * often arrive many times per frame, and each render re-parses the full
   * accumulated markdown and re-highlights code blocks, so rendering per event
   * makes streaming cost quadratic in response length.
   */
  function render() {
    if (renderScheduled) {
      return;
    }
    renderScheduled = true;
    const schedule = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (cb: () => void) => setTimeout(cb, 16);
    schedule(() => {
      renderScheduled = false;
      performRender();
    });
  }

  function performRender() {
    const parsedThinking = separateThinkingSegments(accumulatedContent);
    const processedText = parsedThinking.content;
    let thinkingContent = accumulatedReasoning;

    if (parsedThinking.reasoning) {
      thinkingContent = thinkingContent
        ? `${thinkingContent.replace(/\n+$/, "")}\n\n${parsedThinking.reasoning}`
        : parsedThinking.reasoning;
    }
    const hasThinking = Boolean(thinkingContent);

    if (hasThinking) {
      if (!thinkingContainer) {
        thinkingContainer = document.getElementById(thinkingId) || null;
      }
      const persistedExpanded = (state.userThinkingState && state.userThinkingState[thinkingId] === true);
      const hasPersisted = Boolean(state.userThinkingState && Object.prototype.hasOwnProperty.call(state.userThinkingState, thinkingId));
      const priorWasCollapsed = thinkingContainer ? thinkingContainer.classList.contains("collapsed") : true;
      thinkingContainer = ensureThinkingContainer(persistedExpanded, hasPersisted, priorWasCollapsed);

      if (thinkingContainer) {
        const contentDiv = thinkingContainer.querySelector<HTMLElement>(".thinking-content");
        if (contentDiv) {
          const prevScrollTop = contentDiv.scrollTop;
          const wasNearBottom = contentDiv.scrollHeight - prevScrollTop - contentDiv.clientHeight < 24;
          contentDiv.innerHTML = processMainContentMarkdown(thinkingContent);
          const shouldCollapse = hasPersisted ? !persistedExpanded : priorWasCollapsed;
          if (shouldCollapse) {
            thinkingContainer.classList.add("collapsed");
          } else {
            thinkingContainer.classList.remove("collapsed");
            contentDiv.scrollTop = wasNearBottom ? contentDiv.scrollHeight : prevScrollTop;
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

    try {
      highlightAndAddCopyButtons(loadingMessage);
    } catch (err) {
      console.warn("Error highlighting code during streaming:", err);
    }

    if (state.shouldAutoScroll && elements.chatBox) {
      fastScroll(elements.chatBox, elements.chatBox.scrollHeight);
    }
  }

  function appendReasoningLine(text: string, indent = 0) {
    if (text === "") {
      if (!accumulatedReasoning || accumulatedReasoning.endsWith("\n\n")) {
        render();
        return;
      }
      accumulatedReasoning += accumulatedReasoning.endsWith("\n") ? "\n" : "\n\n";
      render();
      return;
    }
    if (!text) return;
    if (accumulatedReasoning && !accumulatedReasoning.endsWith("\n")) {
      accumulatedReasoning += "\n";
    }
    const indentation = "  ".repeat(indent);
    accumulatedReasoning += indentation + text + "\n";
    render();
  }

  function updateLastReasoningLine(newText: string, indent = 0) {
    if (!newText) return;
    const lines = accumulatedReasoning.split("\n");
    if (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }
    if (lines.length > 0) {
      lines[lines.length - 1] = "  ".repeat(indent) + newText;
    } else {
      lines.push("  ".repeat(indent) + newText);
    }
    accumulatedReasoning = lines.join("\n") + "\n";
    render();
  }

  function appendReasoningDelta(delta: string) {
    if (!delta) return;
    accumulatedReasoning += delta;
    render();
  }

  function ensureReasoningTrailingNewline() {
    if (!accumulatedReasoning) return;
    if (!accumulatedReasoning.endsWith("\n")) {
      accumulatedReasoning += "\n";
    }
    render();
  }

  function appendOutputText(delta: string) {
    if (!delta) return;
    accumulatedContent += delta;
    render();
  }

  function replaceOutputSegment(startOffset: number, fullText: string) {
    accumulatedContent = accumulatedContent.slice(0, startOffset) + fullText;
    render();
  }

  function collectImagesFromSource(source: unknown, label: string) {
    if (!source || typeof source !== "object") {
      return;
    }
    const localSeen = new Set<string>();
    const visited = typeof WeakSet !== "undefined" ? new WeakSet() : null;
    const buffer: ImageCandidate[] = [];
    collectImageCandidates(source, buffer, "image/png", localSeen, visited);
    if (!buffer.length) {
      return;
    }
    buffer.forEach((item: ImageCandidate) => {
      if (!item || typeof item.dataUrl !== "string") {
        return;
      }
      if (accumulatedImageSeen.has(item.dataUrl)) {
        return;
      }
      accumulatedImageSeen.add(item.dataUrl);
      accumulatedImageOutputs.push({
        dataUrl: item.dataUrl,
        mimeType: item.mimeType || "image/png",
        sourceLabel: label,
      });
      logImageDebug("Captured image data from stream event.", {
        sourceLabel: label,
        mimeType: item.mimeType || "image/png",
        preview: item.dataUrl.substring(0, 48),
      });
    });
  }

  function attachImagesToPayload(payload: Record<string, any> | null) {
    if (!accumulatedImageOutputs.length) {
      return payload;
    }
    const targetPayload: Record<string, any> = payload || {};
    if (!Array.isArray(targetPayload.output)) {
      targetPayload.output = [];
    }
    accumulatedImageOutputs.forEach((img, index) => {
      const outputEntry: Record<string, unknown> = {
        id: `image-output-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        type: IMAGE_GENERATION_CALL_TYPE,
        mime_type: img.mimeType || "image/png",
        source: img.sourceLabel || "stream",
      };
      if (typeof img.dataUrl === "string" && img.dataUrl.startsWith("data:")) {
        outputEntry.result = img.dataUrl.split(",")[1];
      } else if (typeof img.dataUrl === "string" && img.dataUrl.startsWith("http")) {
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
    outputEndsWith: (suffix: string) => accumulatedContent.endsWith(suffix),
    hasOutput: () => accumulatedContent.trim().length > 0,
    removePlaceholder,
    render: performRender,
  };
}
