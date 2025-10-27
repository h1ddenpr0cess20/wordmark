/**
 * About tab and configuration initialization for the chatbot application
 */

/**
 * Initialize About tab information and configuration display
 */
function initializeAboutTab() {
  // Set up About tab information
  const appVersionElement = document.getElementById("app-version");
  if (appVersionElement) {
    appVersionElement.textContent = window.APP_VERSION || "0.0.0";
    if (window.VERBOSE_LOGGING) {
      console.info("App version set:", appVersionElement.textContent);
    }
  }

  const githubLinkElement = document.getElementById("github-link");
  if (githubLinkElement && window.GITHUB_URL) {
    githubLinkElement.href = window.GITHUB_URL;
    if (window.VERBOSE_LOGGING) {
      console.info("GitHub URL set:", githubLinkElement.href);
    }
  }

  // Populate cryptocurrency addresses from config
  initializeCryptoDonations();
}

/**
 * Initialize cryptocurrency donation addresses
 */
function initializeCryptoDonations() {
  const cryptoAddressesContainer = document.getElementById("crypto-addresses-container");
  if (cryptoAddressesContainer && window.CRYPTO_DONATIONS && Array.isArray(window.CRYPTO_DONATIONS)) {
    // Clear existing content
    cryptoAddressesContainer.innerHTML = "";

    // Create elements for each cryptocurrency
    window.CRYPTO_DONATIONS.forEach(crypto => {
      const addressId = `${crypto.symbol.toLowerCase()}-address`;

      // Create the crypto item container
      const cryptoItem = document.createElement("div");
      cryptoItem.className = "crypto-item";

      // Create the label
      const label = document.createElement("span");
      label.className = "crypto-label";
      label.textContent = `${crypto.name}:`;

      // Create a wrapper for the input and copy button
      const inputWrapper = document.createElement("div");
      inputWrapper.className = "input-copy-wrapper";

      // Create the address input field
      const input = document.createElement("input");
      input.type = "text";
      input.className = "crypto-address";
      input.id = addressId;
      input.value = crypto.address;
      input.readOnly = true;

      // Create the copy button
      const copyButton = document.createElement("button");
      copyButton.className = "copy-address";
      copyButton.setAttribute("data-address", addressId);
      copyButton.setAttribute("aria-label", `Copy ${crypto.name} Address`);
      copyButton.innerHTML = window.icon("copy", { width: 16, height: 16 }); // Add event listener directly to the button
      copyButton.addEventListener("click", (event) => {
        // Debug logging
        if (window.VERBOSE_LOGGING) {
          console.info(`Copy button clicked for ${crypto.symbol}:`, {
            target: event.target,
            currentTarget: event.currentTarget,
            defaultPrevented: event.defaultPrevented,
            cancelBubble: event.cancelBubble,
            timeStamp: event.timeStamp,
          });
        }

        // Prevent event propagation to avoid closing the settings panel
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        // Additional safety check - mark the event as handled
        event.handled = true;

        const addressInput = document.getElementById(addressId);
        if (addressInput) {
          copyToClipboard(addressInput.value, copyButton);
        }

        if (window.VERBOSE_LOGGING) {
          console.info("After prevention calls:", {
            defaultPrevented: event.defaultPrevented,
            cancelBubble: event.cancelBubble,
            handled: event.handled,
          });
        }
      });

      // Add input and button to the wrapper
      inputWrapper.appendChild(input);
      inputWrapper.appendChild(copyButton);

      // Add all elements to the container
      cryptoItem.appendChild(label);
      cryptoItem.appendChild(inputWrapper);

      // Add the crypto item to the main container
      cryptoAddressesContainer.appendChild(cryptoItem);
    });

    if (window.VERBOSE_LOGGING) {
      console.info("Crypto donation addresses populated:", window.CRYPTO_DONATIONS.length);
    }
  }
}

/**
 * Copy text to clipboard with proper fallbacks and visual feedback
 */
function copyToClipboard(text, button) {
  // Store original SVG for restoration
  const originalSvg = button.innerHTML;

  // Define the copy function with proper error handling
  const performCopy = function(text) {
    // Try modern clipboard API first
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
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        textArea.setSelectionRange(0, 99999); // For mobile devices
        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);
        return Promise.resolve(successful);
      } catch (err) {
        console.error("execCommand fallback failed:", err);
        return Promise.resolve(false);
      }
    }
  };

  // Perform the copy operation
  performCopy(text)
    .then(success => {
      if (success) {
        // Show success feedback
        button.innerHTML = window.icon("check", { width: 16, height: 16 });

        // Revert back to original icon after 1.5 seconds
        setTimeout(() => {
          button.innerHTML = originalSvg;
        }, 1500);
      } else {
        // Show failure feedback
        button.innerHTML = window.icon("x", { width: 16, height: 16 });

        setTimeout(() => {
          button.innerHTML = originalSvg;
        }, 1500);
      }
    })
    .catch(err => {
      console.error("Failed to copy address: ", err);
      // Show failure feedback
      button.innerHTML = window.icon("x", { width: 16, height: 16 });

      setTimeout(() => {
        button.innerHTML = originalSvg;
      }, 1500);
    });
}

/**
 * Set up copy functionality for cryptocurrency addresses (legacy function, kept for compatibility)
 */
function setupCryptoCopyButtons() {
  // This function is now legacy since we attach event listeners directly during creation
  // Keeping it for any potential edge cases or manual calls
  const copyButtons = document.querySelectorAll(".copy-address");
  copyButtons.forEach(button => {
    // Remove any existing listeners to prevent duplicates
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);

    newButton.addEventListener("click", function() {
      const addressId = this.getAttribute("data-address");
      const addressInput = document.getElementById(addressId);

      if (addressInput) {
        copyToClipboard(addressInput.value, this);
      }
    });
  });
}

// Make functions available globally
window.initializeAboutTab = initializeAboutTab;
window.initializeCryptoDonations = initializeCryptoDonations;
window.setupCryptoCopyButtons = setupCryptoCopyButtons;
window.copyToClipboard = copyToClipboard;
