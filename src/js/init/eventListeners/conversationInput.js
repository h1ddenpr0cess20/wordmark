import { elements, state } from "../state.js";
import { loadGalleryModule } from "../../utils/lazyLoader.js";
import { sendMessage } from "../../components/interaction.js";
export function initializeConversationInput() {
  if (!elements.userInput || !elements.sendButton) {
    return;
  }

  elements.userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!state.activeAbortController && !state.isResponsePending) {
        sendMessage();
      } else {
        console.info("Message sending prevented - generation in progress");
      }
    }
  });

  elements.sendButton.addEventListener("click", sendMessage);

  const svgSelectors = "#settings-button svg, #history-button svg, #gallery-button svg, .close-settings svg, .close-history svg, .close-gallery svg";
  document.querySelectorAll(svgSelectors).forEach((svg) => {
    svg.addEventListener("click", (event) => {
      event.stopPropagation();
      const parentButton = event.currentTarget.closest("button");
      if (parentButton) {
        parentButton.click();
      }
    });
  });

  elements.userInput.addEventListener("input", () => {
    elements.userInput.style.height = "56px";
    elements.userInput.style.height = `${Math.max(56, elements.userInput.scrollHeight)}px`;
  });

  if (elements.galleryButton) {
    const firstGalleryClick = async(event) => {
      event.preventDefault();
      const mod = await loadGalleryModule();
      if (mod && typeof mod.initGallery === "function") {
        mod.initGallery();
      }
      elements.galleryButton.removeEventListener("click", firstGalleryClick);
      elements.galleryButton.click();
    };
    elements.galleryButton.addEventListener("click", firstGalleryClick, { once: true });
  }
}

