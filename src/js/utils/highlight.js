/**
 * Highlight.js integration and code formatting utilities
 */

// -----------------------------------------------------
// Lazy-load highlight.js and setup
// -----------------------------------------------------
window.loadHighlightJS = function() {
  if (window.hljsLoaded) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    try {
      const url = new URL("../lib/highlight.min.js", import.meta.url).href;
      script.src = url;
    } catch {
      // Fallback to previous absolute path if import.meta.url is unavailable
      script.src = "/src/js/lib/highlight.min.js";
    }
    script.onload = () => {
      window.hljsLoaded = true;
      console.info("Highlight.js loaded successfully");

      // Configure highlight.js with security and broad language autodetect.
      // Avoid restricting the language list so common formats (bash, json, yaml, etc.) highlight correctly.
      hljs.configure({
        ignoreUnescapedHTML: true,
      });

      // Expose hljs globally
      window.hljs = hljs;

      // Highlight existing code blocks
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

      resolve();
    };
    script.onerror = (err) => {
      console.error("Failed to load highlight.js", err);
      reject(err);
    };
    document.head.appendChild(script);
  });
};

/**
 * Adds a copy button to code blocks
 * @param {HTMLElement} codeBlock - The code block element to add a button to
 */
window.addCopyButton = function(codeBlock) {
  if (!codeBlock.parentNode.querySelector(".copy-btn")) {
    const copyButton = document.createElement("button");
    copyButton.className = "copy-btn";
    copyButton.setAttribute("aria-label", "Copy code");
    copyButton.innerHTML = window.icon("copy", { width: 16, height: 16 });
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
            copyButton.innerHTML = window.icon("check", { width: 16, height: 16 });
            setTimeout(() => {
              // Revert back to copy icon
              copyButton.innerHTML = originalSvg;
            }, 1500);
          } else {
            // Store original SVG
            const originalSvg = copyButton.innerHTML;
            // Show X mark SVG for failure feedback
            copyButton.innerHTML = window.icon("x", { width: 16, height: 16 });
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
};

// Ensure highlightCodeBlocks is accessible globally
// window.highlightCodeBlocks = highlightCodeBlocks; // Already global

// Optional: Function to rehighlight all code blocks (useful if theme changes)
window.rehighlightCodeBlocks = function() {
  if (window.hljsLoaded) {
    const codeBlocks = document.querySelectorAll("pre code");
    if (codeBlocks.length > 0) {
      console.info(`Rehighlighting ${codeBlocks.length} code blocks with current theme`);
      codeBlocks.forEach((block) => {
        // Reset to original content before rehighlighting
        const originalContent = block.getAttribute("data-original-code");
        if (originalContent !== null) {
          block.textContent = originalContent; // Use textContent to avoid parsing HTML inside code
        }
        hljs.highlightElement(block);
      });
    } else {
      console.info("No code blocks found to rehighlight");
    }
  } else {
    console.info("Highlight.js not loaded, attempting to load it");
    window.loadHighlightJS().then(() => {
      console.info("Highlight.js loaded, retrying rehighlight");
      window.rehighlightCodeBlocks(); // Retry after loading
    }).catch(err => console.error("Failed to load highlight.js for rehighlight", err));
  }
};
