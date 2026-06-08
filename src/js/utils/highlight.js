import { state } from "../init/state.js";
import { icon } from "./icons.js";
/**
 * Highlight.js integration and code formatting utilities
 */

import hljs from "highlight.js";

// hljs is bundled and imported directly by its consumers. Configure it once on
// load; `loadHighlightJS()` remains as the initial-DOM-highlight entry point.
state.hljsLoaded = true;
hljs.configure({
  ignoreUnescapedHTML: true,
});

let hljsInitialHighlightDone = false;

export function loadHighlightJS() {
  if (hljsInitialHighlightDone) {
    return Promise.resolve();
  }
  hljsInitialHighlightDone = true;

  // Highlight any code blocks already present in the DOM.
  try {
    const codeBlocks = document.querySelectorAll("pre code");
    if (codeBlocks.length > 0) {
      codeBlocks.forEach((block) => {
        // Store original content for copying
        const originalContent = block.textContent;
        block.setAttribute("data-original-code", originalContent);

        hljs.highlightElement(block);
      });
    } else {
      hljs.highlightAll();
    }
  } catch (error) {
    console.error("Error during initial highlighting:", error);
  }

  return Promise.resolve();
}

/**
 * Adds a copy button to code blocks
 * @param {HTMLElement} codeBlock - The code block element to add a button to
 */
export function addCopyButton(codeBlock) {
  if (!codeBlock.parentNode.querySelector(".copy-btn")) {
    const copyButton = document.createElement("button");
    copyButton.className = "copy-btn";
    copyButton.setAttribute("aria-label", "Copy code");
    copyButton.innerHTML = icon("copy", { width: 16, height: 16 });
    copyButton.addEventListener("click", () => {
      // Define the copy function with proper error handling
      const copyText = function(text) {
        // Make sure navigator and clipboard are fully initialized before using them
        if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          return navigator.clipboard.writeText(text)
            .then(() => true)
            .catch(err => {
              console.error("Clipboard API failed:", err);
              return false;
            });
        } else {
          // Fallback to execCommand for older browsers
          try {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed"; // Avoid scrolling to bottom
            textArea.style.opacity = "0";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const successful = document.execCommand("copy");
            document.body.removeChild(textArea);
            return Promise.resolve(successful);
          } catch (err) {
            console.error("execCommand fallback failed:", err);
            return Promise.resolve(false);
          }
        }
      }; copyText(codeBlock.innerText)
        .then(success => {
          if (success) {
            // Store original SVG
            const originalSvg = copyButton.innerHTML;
            // Show check mark SVG for success feedback
            copyButton.innerHTML = icon("check", { width: 16, height: 16 });
            setTimeout(() => {
              // Revert back to copy icon
              copyButton.innerHTML = originalSvg;
            }, 1500);
          } else {
            // Store original SVG
            const originalSvg = copyButton.innerHTML;
            // Show X mark SVG for failure feedback
            copyButton.innerHTML = icon("x", { width: 16, height: 16 });
            setTimeout(() => {
              // Revert back to copy icon
              copyButton.innerHTML = originalSvg;
            }, 1500);
          }
        });
    });
    // Insert the button into the code block's parent (e.g., <pre> tag), before the code element itself
    if (codeBlock.parentNode) {
      codeBlock.parentNode.insertBefore(copyButton, codeBlock);
    } else {
      // Fallback or error handling if the structure isn't as expected
      console.error("Could not find parentNode to attach copy button.");
      // As a last resort, append it to the body
      // document.body.appendChild(copyButton);
    }
  }
}

// Note: rehighlightCodeBlocks (theme-change rehighlight) is defined in
// components/theme.js, which owns the active implementation.
