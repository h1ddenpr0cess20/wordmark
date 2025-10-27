/**
 * Utility functions to handle mobile keyboard behavior and scrolling optimization
 */

/**
 * Check if the device is a mobile device
 * @returns {boolean} True if the current device is mobile
 */
window.isMobileDevice = function() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         window.innerWidth <= 768;
};

/**
 * Handles mobile keyboard appearance and ensures the input remains visible
 */
window.setupMobileKeyboardHandling = function() {
  // Check if Visual Viewport API is available
  if (window.visualViewport) {
    // Use visualViewport API to detect keyboard appearance
    window.visualViewport.addEventListener("resize", () => {
      if (document.activeElement === window.userInput) {
        window.scrollInputIntoView();
      }
    });
  }

  // Add focus event to scroll input into view when focused
  if (window.userInput) {
    window.userInput.addEventListener("focus", window.scrollInputIntoView);
  }
};

/**
 * Scrolls the input field into view
 * Uses smooth scrolling for better UX
 */
window.scrollInputIntoView = function() {
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
};

/**
 * Safely focuses the user input field, handling mobile differences
 */
window.focusUserInputSafely = function() {
  if (!window.userInput) {
    return;
  }

  const isMobile = window.isMobileDevice();

  if (!isMobile) {
    // On desktop, focus immediately
    window.userInput.focus();
  } else {
    // On mobile we intentionally avoid forcing focus to prevent unwanted keyboard popups.
  }
};

/**
 * Initializes mobile keyboard handling for the app
 * Combined from scrollOptimizer.js
 */
window.initializeMobileKeyboardHandling = function() {
  // Setup mobile keyboard handling
  window.setupMobileKeyboardHandling();

  // Add a class to the body to identify mobile devices for CSS targeting
  const isMobile = window.isMobileDevice();

  if (isMobile) {
    document.body.classList.add("mobile-device");
  }

  // Optimize scrolling behavior for better performance on mobile
  window.optimizeScrolling();

  // Setup tap-to-expand for system prompt area
  window.setupPromptTapExpand();
};

/**
 * Optimizes scrolling behavior throughout the app
 * Makes scrolling more responsive on mobile devices
 * Combined from scrollOptimizer.js
 */
window.optimizeScrolling = function() {
  // Use passive event listeners for touch events to prevent scrolling jank
  document.addEventListener("touchstart", () => {}, { passive: true });
  document.addEventListener("touchmove", () => {}, { passive: true });

  // Override default scroll behavior for mobile
  if (window.chatBox) {
    // Use this technique to make scrolling more immediate on mobile
    window.fastScroll = function(element, to) {
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
    };

    // Replace any direct scrollTop references with our optimized version
    const originalAppendMessage = window.appendMessage;
    if (originalAppendMessage) {
      window.appendMessage = function(sender, content, type, skipHistory = false) {
        const messageElement = originalAppendMessage(sender, content, type, skipHistory);

        // Optimize scroll behavior when adding new messages
        if (window.shouldAutoScroll && window.chatBox) {
          window.fastScroll(window.chatBox, window.chatBox.scrollHeight);
        }

        return messageElement;
      };
    }
  }
};

/**
 * Sets up tap-to-expand functionality for the system prompt area on mobile
 */
window.setupPromptTapExpand = function() {
  // Wait for DOM to be ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", window.setupPromptTapExpand);
    return;
  }

  const promptContainer = document.getElementById("model-info");
  if (!promptContainer) {
    setTimeout(window.setupPromptTapExpand, 1000);
    return;
  }

  // Only add this functionality on mobile devices
  const isMobile = window.isMobileDevice();
  if (!isMobile) {
    return;
  }

  // Remove any existing event listeners first
  promptContainer.removeEventListener("click", handlePromptTap);

  function handlePromptTap(e) {
    e.preventDefault();
    e.stopPropagation();

    // Toggle expanded state
    if (promptContainer.classList.contains("expanded")) {
      promptContainer.classList.remove("expanded");
    } else {
      promptContainer.classList.add("expanded");
    }
  }

  // Add click event listener
  promptContainer.addEventListener("click", handlePromptTap);

  // Close expanded state when tapping elsewhere
  document.addEventListener("click", (e) => {
    if (!promptContainer.contains(e.target) && promptContainer.classList.contains("expanded")) {
      promptContainer.classList.remove("expanded");
    }
  });
};

// Also force setup on window load
window.addEventListener("load", () => {
  setTimeout(window.setupPromptTapExpand, 100);
});
