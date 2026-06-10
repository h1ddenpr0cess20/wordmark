import { elements } from "../init/state.ts";
/**
 * Utility functions to handle mobile keyboard behavior and scrolling optimization
 */

/**
 * Check if the device is a mobile device
 * @returns {boolean} True if the current device is mobile
 */
export function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         window.innerWidth <= 768;
}

/**
 * Handles mobile keyboard appearance and ensures the input remains visible
 */
export function setupMobileKeyboardHandling() {
  // Check if Visual Viewport API is available
  if (window.visualViewport) {
    // Use visualViewport API to detect keyboard appearance
    window.visualViewport.addEventListener("resize", () => {
      if (document.activeElement === elements.userInput) {
        scrollInputIntoView();
      }
    });
  }

  // Add focus event to scroll input into view when focused
  if (elements.userInput) {
    elements.userInput.addEventListener("focus", scrollInputIntoView);
  }
}

/**
 * Scrolls the input field into view
 * Uses smooth scrolling for better UX
 */
export function scrollInputIntoView() {
  // Use a minimal timeout to ensure DOM is ready and keyboard has appeared
  setTimeout(() => {
    // Find the input container for better positioning
    const inputContainer = document.querySelector(".input-container");

    if (inputContainer) {
      // Scroll the input container into view with auto behavior for faster response
      inputContainer.scrollIntoView({ behavior: "auto", block: "end" });

      // For iOS which can be particularly problematic
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        // Add extra padding to the bottom in iOS to prevent input from being right at screen edge
        document.body.style.paddingBottom = "20px";
      }
    }
  }, 100); // Reduced delay for faster response
}

/**
 * Safely focuses the user input field, handling mobile differences
 */
export function focusUserInputSafely() {
  if (!elements.userInput) {
    return;
  }

  const isMobile = isMobileDevice();

  if (!isMobile) {
    // On desktop, focus immediately
    elements.userInput.focus();
  } else {
    // On mobile we intentionally avoid forcing focus to prevent unwanted keyboard popups.
  }
}

/**
 * Initializes mobile keyboard handling for the app
 * Combined from scrollOptimizer.js
 */
export function initializeMobileKeyboardHandling() {
  // Setup mobile keyboard handling
  setupMobileKeyboardHandling();

  // Add a class to the body to identify mobile devices for CSS targeting
  const isMobile = isMobileDevice();

  if (isMobile) {
    document.body.classList.add("mobile-device");
  }

  // Optimize scrolling behavior for better performance on mobile
  optimizeScrolling();

  // Setup tap-to-expand for system prompt area
  setupPromptTapExpand();
}

/**
 * Optimizes scrolling behavior throughout the app
 * Makes scrolling more responsive on mobile devices
 * Combined from scrollOptimizer.js
 */
export function optimizeScrolling() {
  // Use passive event listeners for touch events to prevent scrolling jank
  document.addEventListener("touchstart", () => {}, { passive: true });
  document.addEventListener("touchmove", () => {}, { passive: true });
}

/**
 * Scroll an element to a position, instantly on mobile and on the next frame
 * on desktop. Makes scrolling feel more immediate on touch devices.
 */
export function fastScroll(element: HTMLElement | null, to: number) {
  if (!element) {
    return;
  }

  // Check if we're on a mobile device where animations can be jerky
  const isMobile = document.body.classList.contains("mobile-device");

  if (isMobile) {
    // On mobile, scroll instantly for better performance
    element.scrollTop = to;
  } else {
    // On desktop, we can use smooth scrolling with a small timeout
    requestAnimationFrame(() => {
      element.scrollTop = to;
    });
  }
}

/**
 * Sets up tap-to-expand functionality for the system prompt area on mobile
 */
export function setupPromptTapExpand() {
  // Wait for DOM to be ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupPromptTapExpand);
    return;
  }

  const promptContainer = document.getElementById("model-info");
  if (!promptContainer) {
    setTimeout(setupPromptTapExpand, 1000);
    return;
  }

  // Only add this functionality on mobile devices
  const isMobile = isMobileDevice();
  if (!isMobile) {
    return;
  }

  // Capture the non-null element so the handler closes over a narrowed reference.
  const container = promptContainer;

  // Remove any existing event listeners first
  container.removeEventListener("click", handlePromptTap);

  function handlePromptTap(e: Event) {
    e.preventDefault();
    e.stopPropagation();

    // Toggle expanded state
    if (container.classList.contains("expanded")) {
      container.classList.remove("expanded");
    } else {
      container.classList.add("expanded");
    }
  }

  // Add click event listener
  container.addEventListener("click", handlePromptTap);

  // Close expanded state when tapping elsewhere
  document.addEventListener("click", (e) => {
    if (!promptContainer.contains(e.target as Node) && promptContainer.classList.contains("expanded")) {
      promptContainer.classList.remove("expanded");
    }
  });
}

// Also force setup on window load
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("load", () => {
    setTimeout(setupPromptTapExpand, 100);
  });
}
