/**
 * Highlight.js integration and code-block formatting utilities.
 *
 * @remarks
 * `highlight.js` is bundled and imported directly, then configured once on load.
 * The theme-change rehighlight pass lives in `components/theme.ts`, which owns
 * the active implementation.
 */

import { state } from "../init/state.ts";
import { icon } from "./icons.ts";
import { copyTextToClipboard } from "./clipboard.ts";
import hljs from "highlight.js";

state.hljsLoaded = true;
hljs.configure({
  ignoreUnescapedHTML: true,
});

let hljsInitialHighlightDone = false;

/**
 * Highlights any code blocks already present in the DOM on first call, recording
 * each block's original text for copy support. Subsequent calls are no-ops.
 */
export function loadHighlightJS() {
  if (hljsInitialHighlightDone) {
    return Promise.resolve();
  }
  hljsInitialHighlightDone = true;

  try {
    const codeBlocks = document.querySelectorAll<HTMLElement>("pre code");
    if (codeBlocks.length > 0) {
      codeBlocks.forEach((block) => {
        const originalContent = block.textContent;
        block.setAttribute("data-original-code", originalContent || "");

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
 * Inserts a copy-to-clipboard button before a highlighted code block.
 *
 * @remarks
 * Uses the async Clipboard API where available and falls back to a hidden
 * `<textarea>` + `execCommand("copy")` for older browsers. The button briefly
 * swaps to a check or X icon to signal success or failure.
 *
 * @param codeBlock - The `<code>` element to attach the button to.
 */
export function addCopyButton(codeBlock: HTMLElement) {
  if (!codeBlock.parentElement?.querySelector(".copy-btn")) {
    const copyButton = document.createElement("button");
    copyButton.className = "copy-btn";
    copyButton.setAttribute("aria-label", "Copy code");
    copyButton.innerHTML = icon("copy", { width: 16, height: 16 });
    copyButton.addEventListener("click", () => {
      copyTextToClipboard(codeBlock.innerText)
        .then(success => {
          if (success) {
            const originalSvg = copyButton.innerHTML;
            copyButton.innerHTML = icon("check", { width: 16, height: 16 });
            setTimeout(() => {
              copyButton.innerHTML = originalSvg;
            }, 1500);
          } else {
            const originalSvg = copyButton.innerHTML;
            copyButton.innerHTML = icon("x", { width: 16, height: 16 });
            setTimeout(() => {
              copyButton.innerHTML = originalSvg;
            }, 1500);
          }
        });
    });
    if (codeBlock.parentNode) {
      codeBlock.parentNode.insertBefore(copyButton, codeBlock);
    } else {
      console.error("Could not find parentNode to attach copy button.");
    }
  }
}
