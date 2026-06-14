/**
 * About-tab popups.
 *
 * @remarks
 * Loads bundled standalone page markup (privacy, contact, terms, help) into
 * modal popups, bound through a single delegated click listener on the document.
 */

import privacyPolicyHtml from "../../html/privacy-policy.html?raw";
import contactHtml from "../../html/contact.html?raw";
import termsOfServiceHtml from "../../html/terms-of-service.html?raw";
import helpGuideHtml from "../../html/help-guide.html?raw";
import { state } from "../init/state.ts";

const ABOUT_PAGE_HTML = {
  "src/html/privacy-policy.html": privacyPolicyHtml,
  "src/html/contact.html": contactHtml,
  "src/html/terms-of-service.html": termsOfServiceHtml,
  "src/html/help-guide.html": helpGuideHtml,
};

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
};

/**
 * Seeds a popup container with its built-in fallback markup once (idempotent via
 * a `data-fallbackApplied` flag), so it shows content even before bundled HTML loads.
 *
 * @returns The container element, or `null` if it is not in the DOM.
 */
function applyFallbackContent(containerId: string) {
  const container = document.getElementById(containerId);
  if (!container) {
    return null;
  }
  const fallbacks = ABOUT_FALLBACKS as Record<string, string>;
  if (!container.dataset.fallbackApplied && fallbacks[containerId]) {
    container.innerHTML = fallbacks[containerId];
    container.dataset.fallbackApplied = "true";
  }
  return container;
}

/**
 * Loads the bundled page markup registered for `url` into the given container,
 * extracting just the main content section. Falls back to the seeded content
 * (and logs when verbose) if the markup is missing or unparseable.
 */
async function loadContentIntoContainer(url: string, containerId: string) {
  const container = applyFallbackContent(containerId);
  if (!container) {
    return;
  }

  const html = (ABOUT_PAGE_HTML as Record<string, string>)[url];
  if (typeof html !== "string") {
    if (state.verboseLogging) {
      console.warn("No bundled content registered for", url);
    }
    return;
  }

  try {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    const mainContent = tempDiv.querySelector(".privacy-content")
      || tempDiv.querySelector(".terms-content")
      || tempDiv.querySelector(".help-content")
      || tempDiv.querySelector(".contact-content");

    if (mainContent) {
      container.innerHTML = mainContent.innerHTML;
      container.dataset.loaded = "true";
    } else if (state.verboseLogging) {
      console.warn("No main content found in", url);
    }
  } catch (error) {
    if (state.verboseLogging) {
      console.warn("About popup content parse failed:", error);
    }
  }
}

/** Opens the privacy popup, hiding the about pane and loading its content. */
async function showPrivacyPopup() {
  const aboutContent = document.querySelector<HTMLElement>("#content-about .about-content");
  const privacyPopup = document.getElementById("privacy-popup");

  if (aboutContent && privacyPopup) {
    aboutContent.style.display = "none";
    privacyPopup.style.display = "flex";

    await loadContentIntoContainer("src/html/privacy-policy.html", "privacy-content-container");

    privacyPopup.offsetHeight;
    privacyPopup.classList.add("active");
  }
}

/** Closes the privacy popup and restores the about pane after the transition. */
function hidePrivacyPopup() {
  const aboutContent = document.querySelector<HTMLElement>("#content-about .about-content");
  const privacyPopup = document.getElementById("privacy-popup");

  if (aboutContent && privacyPopup) {
    privacyPopup.classList.remove("active");
    setTimeout(() => {
      privacyPopup.style.display = "none";
      aboutContent.style.display = "";
    }, 250);
  }
}

/** Opens the contact popup, hiding the about pane and loading its content. */
async function showContactPopup() {
  const aboutContent = document.querySelector<HTMLElement>("#content-about .about-content");
  const contactPopup = document.getElementById("contact-popup");

  if (aboutContent && contactPopup) {
    aboutContent.style.display = "none";
    contactPopup.style.display = "flex";

    await loadContentIntoContainer("src/html/contact.html", "contact-content-container");

    contactPopup.offsetHeight;
    contactPopup.classList.add("active");
  }
}

/** Closes the contact popup and restores the about pane after the transition. */
function hideContactPopup() {
  const aboutContent = document.querySelector<HTMLElement>("#content-about .about-content");
  const contactPopup = document.getElementById("contact-popup");

  if (aboutContent && contactPopup) {
    contactPopup.classList.remove("active");
    setTimeout(() => {
      contactPopup.style.display = "none";
      aboutContent.style.display = "";
    }, 250);
  }
}

/** Opens the terms popup, hiding the about pane and loading its content. */
async function showTermsPopup() {
  const aboutContent = document.querySelector<HTMLElement>("#content-about .about-content");
  const termsPopup = document.getElementById("terms-popup");

  if (aboutContent && termsPopup) {
    aboutContent.style.display = "none";
    termsPopup.style.display = "flex";

    await loadContentIntoContainer("src/html/terms-of-service.html", "terms-content-container");

    termsPopup.offsetHeight;
    termsPopup.classList.add("active");
  }
}

/** Closes the terms popup and restores the about pane after the transition. */
function hideTermsPopup() {
  const aboutContent = document.querySelector<HTMLElement>("#content-about .about-content");
  const termsPopup = document.getElementById("terms-popup");

  if (aboutContent && termsPopup) {
    termsPopup.classList.remove("active");
    setTimeout(() => {
      termsPopup.style.display = "none";
      aboutContent.style.display = "";
    }, 250);
  }
}

/** Opens the help popup, hiding the about pane and loading its content. */
async function showHelpPopup() {
  const aboutContent = document.querySelector<HTMLElement>("#content-about .about-content");
  const helpPopup = document.getElementById("help-popup");

  if (aboutContent && helpPopup) {
    aboutContent.style.display = "none";
    helpPopup.style.display = "flex";

    await loadContentIntoContainer("src/html/help-guide.html", "help-content-container");

    helpPopup.offsetHeight;
    helpPopup.classList.add("active");
  }
}

/** Closes the help popup and restores the about pane after the transition. */
function hideHelpPopup() {
  const aboutContent = document.querySelector<HTMLElement>("#content-about .about-content");
  const helpPopup = document.getElementById("help-popup");

  if (aboutContent && helpPopup) {
    helpPopup.classList.remove("active");
    setTimeout(() => {
      helpPopup.style.display = "none";
      aboutContent.style.display = "";
    }, 250);
  }
}

const POPUP_ACTIONS = {
  "show-privacy": showPrivacyPopup,
  "hide-privacy": hidePrivacyPopup,
  "show-contact": showContactPopup,
  "hide-contact": hideContactPopup,
  "show-terms": showTermsPopup,
  "hide-terms": hideTermsPopup,
  "show-help": showHelpPopup,
  "hide-help": hideHelpPopup,
};

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const trigger = target?.closest("[data-popup-action]");
    if (!trigger) {
      return;
    }
    const handler = (POPUP_ACTIONS as Record<string, () => void>)[trigger.getAttribute("data-popup-action") || ""];
    if (handler) {
      event.preventDefault();
      handler();
    }
  });
}
