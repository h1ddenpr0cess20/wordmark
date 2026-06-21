/**
 * Conversation input event listeners.
 *
 * @remarks
 * Wires the message composer: send button, Enter-to-send, auto-grow sizing,
 * header SVG click forwarding, and lazy gallery initialization on first open.
 */

import { elements, state } from "../state.ts";
import { logVerbose } from "../../utils/logger.ts";
import { loadGalleryModule } from "../../utils/lazyLoader.ts";
import { sendMessage } from "../../components/interaction.ts";

/** Wires the message input box: send button, Enter-to-send, and related keys. */
export function initializeConversationInput() {
  const userInput = elements.userInput;
  if (!userInput || !elements.sendButton) {
    return;
  }

  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!state.activeAbortController && !state.isResponsePending) {
        sendMessage();
      } else {
        logVerbose("Message sending prevented - generation in progress");
      }
    }
  });

  elements.sendButton.addEventListener("click", sendMessage);

  const svgSelectors = "#settings-button svg, #history-button svg, #gallery-button svg, .close-settings svg, .close-history svg, .close-gallery svg";
  document.querySelectorAll(svgSelectors).forEach((svg) => {
    svg.addEventListener("click", (event: Event) => {
      event.stopPropagation();
      const parentButton = (event.currentTarget as Element).closest("button");
      if (parentButton) {
        parentButton.click();
      }
    });
  });

  userInput.addEventListener("input", () => {
    userInput.style.height = "56px";
    userInput.style.height = `${Math.max(56, userInput.scrollHeight)}px`;
  });

  const galleryButton = elements.galleryButton;
  if (galleryButton) {
    const firstGalleryClick = async(event: Event) => {
      event.preventDefault();
      const mod = await loadGalleryModule();
      if (mod && typeof mod.initGallery === "function") {
        mod.initGallery();
      }
      galleryButton.removeEventListener("click", firstGalleryClick);
      galleryButton.click();
    };
    galleryButton.addEventListener("click", firstGalleryClick, { once: true });
  }
}

