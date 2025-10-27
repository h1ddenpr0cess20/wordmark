// About Tab Popup Functions

const ABOUT_FALLBACKS = {
  "privacy-content-container": `
    <div class="popup-default">
      <p><strong>Effective Date:</strong> June 14, 2025</p>
      <p>Wordmark is designed for privacy-first AI experimentation. All conversations, images, API keys, and settings stay in your browser; nothing is uploaded to a Wordmark server.</p>
      <p>When you connect to third-party AI services (such as OpenAI or Anthropic) your requests go straight from your device to that provider in accordance with their privacy policy. When you run local models (LM Studio, Ollama) the data never leaves your machine.</p>
      <p>You can clear every stored item at any time via Settings → History, Settings → Tools → Images, and Settings → Memory.</p>
    </div>
  `,
  "contact-content-container": `
    <div class="popup-default">
      <h3>Contact</h3>
      <p>Questions, ideas, or issues? Open an issue on <a href="https://github.com/h1ddenpr0cess20/Wordmark" target="_blank" rel="noopener">GitHub</a> or start a discussion in the repository.</p>
      <p>The project maintainer is Dustin Whyte. Contributions and feedback are welcome.</p>
    </div>
  `,
  "terms-content-container": `
    <div class="popup-default">
      <h3>Terms of Use</h3>
      <p>Wordmark is provided as-is under the MIT License. You are responsible for how you connect the UI to third-party AI services and for complying with their respective terms of service.</p>
      <p>Do not input data that you are not comfortable sharing with whichever provider you configure. Review their terms before supplying keys or sending sensitive content.</p>
    </div>
  `,
  "help-content-container": `
    <div class="popup-default">
      <h3>Quick Help</h3>
      <ul>
        <li>Open Settings (gear icon) to switch providers, models, and personalities.</li>
        <li>Use the Tools tab to enable tool calling or configure individual tools.</li>
        <li>Gallery (image icon) shows generated or uploaded images stored locally.</li>
        <li>History (clock icon) lets you load, rename, or delete past conversations.</li>
      </ul>
      <p>Check the project README on GitHub for detailed walkthroughs.</p>
    </div>
  `,
  "download-content-container": `
    <div class="popup-default">
      <h3>Download Options</h3>
      <p>You can package Wordmark as a mobile WebView app or install it as a PWA when serving over HTTPS.</p>
      <ul>
        <li>Android APK wrapper available in <code>src/assets/apk/wordmark.apk</code>.</li>
        <li>Serve with <code>http-server</code> or another HTTPS-capable static server for PWA installation.</li>
      </ul>
    </div>
  `,
};

function applyFallbackContent(containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    return null;
  }
  if (!container.dataset.fallbackApplied && ABOUT_FALLBACKS[containerId]) {
    container.innerHTML = ABOUT_FALLBACKS[containerId];
    container.dataset.fallbackApplied = "true";
  }
  return container;
}

async function loadContentIntoContainer(url, containerId) {
  const container = applyFallbackContent(containerId);
  if (!container) {
    return;
  }

  if (!url) {
    return;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load content (${response.status})`);
    }
    const html = await response.text();

    // Create a temporary DOM to extract just the main content
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    const mainContent = tempDiv.querySelector(".privacy-content")
      || tempDiv.querySelector(".terms-content")
      || tempDiv.querySelector(".help-content")
      || tempDiv.querySelector(".contact-content")
      || tempDiv.querySelector(".download-content")
      || tempDiv.body;

    if (mainContent) {
      container.innerHTML = mainContent.innerHTML;
      container.dataset.loaded = "true";
    } else {
      if (window.VERBOSE_LOGGING) {
        console.warn("No main content found in", url);
      }
    }
  } catch (error) {
    if (window.VERBOSE_LOGGING) {
      console.warn("About popup content fetch failed:", error);
    }
    // Keep fallback content visible
  }
}

async function showPrivacyPopup() {
  const aboutContent = document.querySelector("#content-about .about-content");
  const privacyPopup = document.getElementById("privacy-popup");

  if (aboutContent && privacyPopup) {
    aboutContent.style.display = "none";
    privacyPopup.style.display = "flex";

    // Load privacy policy content
    await loadContentIntoContainer("src/html/privacy-policy.html", "privacy-content-container");

    // Trigger reflow and add active class for animation
    privacyPopup.offsetHeight;
    privacyPopup.classList.add("active");
  }
}

function hidePrivacyPopup() {
  const aboutContent = document.querySelector("#content-about .about-content");
  const privacyPopup = document.getElementById("privacy-popup");

  if (aboutContent && privacyPopup) {
    privacyPopup.classList.remove("active");
    setTimeout(() => {
      privacyPopup.style.display = "none";
      aboutContent.style.display = "";
    }, 250); // Match CSS transition duration
  }
}

async function showContactPopup() {
  const aboutContent = document.querySelector("#content-about .about-content");
  const contactPopup = document.getElementById("contact-popup");

  if (aboutContent && contactPopup) {
    aboutContent.style.display = "none";
    contactPopup.style.display = "flex";

    // Load contact content
    await loadContentIntoContainer("src/html/contact.html", "contact-content-container");

    // Trigger reflow and add active class for animation
    contactPopup.offsetHeight;
    contactPopup.classList.add("active");
  }
}

function hideContactPopup() {
  const aboutContent = document.querySelector("#content-about .about-content");
  const contactPopup = document.getElementById("contact-popup");

  if (aboutContent && contactPopup) {
    contactPopup.classList.remove("active");
    setTimeout(() => {
      contactPopup.style.display = "none";
      aboutContent.style.display = "";
    }, 250); // Match CSS transition duration
  }
}

async function showTermsPopup() {
  const aboutContent = document.querySelector("#content-about .about-content");
  const termsPopup = document.getElementById("terms-popup");

  if (aboutContent && termsPopup) {
    aboutContent.style.display = "none";
    termsPopup.style.display = "flex";

    // Load terms of service content
    await loadContentIntoContainer("src/html/terms-of-service.html", "terms-content-container");

    // Trigger reflow and add active class for animation
    termsPopup.offsetHeight;
    termsPopup.classList.add("active");
  }
}

function hideTermsPopup() {
  const aboutContent = document.querySelector("#content-about .about-content");
  const termsPopup = document.getElementById("terms-popup");

  if (aboutContent && termsPopup) {
    termsPopup.classList.remove("active");
    setTimeout(() => {
      termsPopup.style.display = "none";
      aboutContent.style.display = "";
    }, 250); // Match CSS transition duration
  }
}

async function showHelpPopup() {
  const aboutContent = document.querySelector("#content-about .about-content");
  const helpPopup = document.getElementById("help-popup");

  if (aboutContent && helpPopup) {
    aboutContent.style.display = "none";
    helpPopup.style.display = "flex";

    // Load help guide content
    await loadContentIntoContainer("src/html/help-guide.html", "help-content-container");

    // Trigger reflow and add active class for animation
    helpPopup.offsetHeight;
    helpPopup.classList.add("active");
  }
}

function hideHelpPopup() {
  const aboutContent = document.querySelector("#content-about .about-content");
  const helpPopup = document.getElementById("help-popup");

  if (aboutContent && helpPopup) {
    helpPopup.classList.remove("active");
    setTimeout(() => {
      helpPopup.style.display = "none";
      aboutContent.style.display = "";
    }, 250); // Match CSS transition duration
  }
}

async function showDownloadPopup() {
  const aboutContent = document.querySelector("#content-about .about-content");
  const downloadPopup = document.getElementById("download-popup");

  if (aboutContent && downloadPopup) {
    aboutContent.style.display = "none";
    downloadPopup.style.display = "flex";

    // Load download content
    await loadContentIntoContainer("src/html/download.html", "download-content-container");

    // Trigger reflow and add active class for animation
    downloadPopup.offsetHeight;
    downloadPopup.classList.add("active");
  }
}

function hideDownloadPopup() {
  const aboutContent = document.querySelector("#content-about .about-content");
  const downloadPopup = document.getElementById("download-popup");

  if (aboutContent && downloadPopup) {
    downloadPopup.classList.remove("active");
    setTimeout(() => {
      downloadPopup.style.display = "none";
      aboutContent.style.display = "";
    }, 250); // Match CSS transition duration
  }
}

// Expose popup functions to global window scope
window.showPrivacyPopup = showPrivacyPopup;
window.hidePrivacyPopup = hidePrivacyPopup;
window.showContactPopup = showContactPopup;
window.hideContactPopup = hideContactPopup;
window.showTermsPopup = showTermsPopup;
window.hideTermsPopup = hideTermsPopup;
window.showHelpPopup = showHelpPopup;
window.hideHelpPopup = hideHelpPopup;
window.showDownloadPopup = showDownloadPopup;
window.hideDownloadPopup = hideDownloadPopup;
