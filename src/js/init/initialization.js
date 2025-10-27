/**
 * Main initialization coordinator for the chatbot application
 * This file loads all initialization modules and coordinates the startup process
 */

// Configure DOMPurify to allow YouTube iframes
function configureDOMPurify() {
  // Add a small delay to ensure DOMPurify has loaded
  function attemptConfiguration(retries = 0) {
    if (typeof DOMPurify !== "undefined") {
      // Create a custom configuration that allows YouTube iframes
      window.DOMPurifyConfig = {
        ALLOWED_TAGS: [
        // Standard HTML tags
          "a", "abbr", "acronym", "address", "area", "article", "aside", "audio", "b", "bdi", "bdo", "big", "blockquote", "body", "br", "button", "canvas", "caption", "center", "cite", "code", "col", "colgroup", "data", "datalist", "dd", "del", "details", "dfn", "dialog", "dir", "div", "dl", "dt", "em", "fieldset", "figcaption", "figure", "font", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hgroup", "hr", "html", "i", "img", "input", "ins", "kbd", "label", "legend", "li", "main", "map", "mark", "menu", "menuitem", "meter", "nav", "ol", "optgroup", "option", "output", "p", "pre", "progress", "q", "rp", "rt", "ruby", "s", "samp", "section", "select", "small", "source", "span", "strike", "strong", "sub", "summary", "sup", "table", "tbody", "td", "textarea", "tfoot", "th", "thead", "time", "title", "tr", "track", "tt", "u", "ul", "var", "video", "wbr",
          // Allow iframe for YouTube embeds
          "iframe",
        ],
        ALLOWED_ATTR: [
        // Standard attributes
          "accept", "align", "alt", "autocomplete", "background", "bgcolor", "border", "cellpadding", "cellspacing", "charset", "cite", "class", "clear", "color", "cols", "colspan", "content", "contenteditable", "controls", "coords", "data", "datetime", "default", "dir", "disabled", "download", "draggable", "enctype", "for", "form", "frameborder", "headers", "height", "hidden", "high", "href", "hreflang", "id", "inputmode", "is", "ismap", "itemid", "itemprop", "itemref", "itemscope", "itemtype", "kind", "label", "lang", "list", "loop", "low", "max", "maxlength", "media", "method", "min", "minlength", "multiple", "name", "noshade", "novalidate", "nowrap", "open", "optimum", "pattern", "placeholder", "poster", "preload", "pubdate", "radiogroup", "readonly", "rel", "required", "rev", "role", "rows", "rowspan", "spellcheck", "scope", "selected", "shape", "size", "span", "srclang", "start", "step", "style", "summary", "tabindex", "target", "title", "type", "usemap", "valign", "value", "width", "wrap",
          // Allow iframe attributes for YouTube embeds
          "src", "allowfullscreen", "frameborder", "allow",
        ],
        // Allow specific iframe sources (YouTube only)
        ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|https:\/\/www\.youtube\.com\/embed\/|https:\/\/www\.youtube-nocookie\.com\/embed\/):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
        // Additional iframe security
        ADD_TAGS: [],
        ADD_ATTR: [],
        FORBID_TAGS: ["script", "object", "embed", "link"],
        FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
        ALLOW_DATA_ATTR: false,
      }; // Create a helper function for sanitizing with YouTube iframe and external image support
      window.sanitizeWithMedia = function(html) {
        const config = {
          ...window.DOMPurifyConfig,
          // Allow external content protocols
          ALLOW_UNKNOWN_PROTOCOLS: false,
          ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
        };

        // First sanitize with extended config
        const sanitized = DOMPurify.sanitize(html, config);

        // Then post-process to validate and secure content
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = sanitized;

        // Validate and secure iframes (YouTube only)
        const iframes = tempDiv.querySelectorAll("iframe");
        iframes.forEach(iframe => {
          const src = iframe.getAttribute("src");
          if (src && !(/^https:\/\/(www\.)?(youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/)/.test(src))) {
          // Remove iframe if it's not from YouTube
            iframe.remove();
          } else if (src) {
          // Ensure YouTube iframes have proper security attributes
            iframe.setAttribute("allowfullscreen", "");
            iframe.setAttribute("frameborder", "0");
            iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture");
          }
        });
        // Validate and secure images
        const images = tempDiv.querySelectorAll("img");
        images.forEach(img => {
          const src = img.getAttribute("src");
          if (src) {
          // Allow HTTPS images, data URLs, and relative paths
            if (/^https:\/\//.test(src) || /^data:image\//.test(src) || /^\//.test(src) || /^\./.test(src)) {
            // Add security attributes to external images
              img.setAttribute("referrerpolicy", "no-referrer");
              img.setAttribute("crossorigin", "anonymous");
              // Add loading attribute for better performance
              img.setAttribute("loading", "lazy");
              // Add CSS class for styling and interaction (makes them expandable)
              img.classList.add("expandable-image");
              // Add cursor pointer style to indicate clickability
              img.style.cursor = "pointer";
            } else if (/^http:\/\//.test(src)) {
            // Convert HTTP to HTTPS for security (best effort)
              img.setAttribute("src", src.replace(/^http:\/\//, "https://"));
              img.setAttribute("referrerpolicy", "no-referrer");
              img.setAttribute("crossorigin", "anonymous");
              img.setAttribute("loading", "lazy");
              // Add CSS class for styling and interaction (makes them expandable)
              img.classList.add("expandable-image");
              // Add cursor pointer style to indicate clickability
              img.style.cursor = "pointer";
            } else {
            // Remove images with invalid protocols
              img.remove();
            }
          }
        });

        return tempDiv.innerHTML;
      };

      // Keep the old function name for backward compatibility
      window.sanitizeWithYouTube = window.sanitizeWithMedia;
      if (window.VERBOSE_LOGGING) {
        console.info("DOMPurify configured to allow YouTube iframes and external images");
      }
    } else if (retries < 3) {
      // Retry after a short delay
      if (window.VERBOSE_LOGGING) {
        console.warn(`DOMPurify not ready, retrying in 100ms (attempt ${retries + 1}/3)`);
      }
      setTimeout(() => attemptConfiguration(retries + 1), 100);
    } else {
      console.warn("DOMPurify not available for configuration after 3 attempts. Check if purify.min.js is loading correctly.");
    }
  }

  // Start the configuration attempt
  attemptConfiguration();
}

// Main initialization function
async function initialize() {
  try {
    if (window.VERBOSE_LOGGING) {
      console.info("Initializing chatbot application...");
    }

    // Initialize DOM references first
    initializeDOMReferences();
    if (window.VERBOSE_LOGGING) {
      console.info("DOM references initialized.");
    }

    if (typeof window.initImageUploads === "function") {
      window.initImageUploads();
    }

    // Initialize textarea height to prevent shrinking when typing
    initializeTextareaHeight();

    // Check if essential elements are available
    if (!window.modelSelector || !window.userInput) {
      console.error("Essential DOM elements not found. Check your HTML structure.");
      return;
    }

    // Initialize default values from config
    initializeDefaultValues();

    // Initialize Markdown parser (Marked) and shim markdown-it API for rendering
    if (typeof window.initializeMarked === "function") {
      window.initializeMarked();
      if (window.VERBOSE_LOGGING) {
        console.info("Marked (markdown) initialized.");
      }
    } else {
      console.warn("initializeMarked() not found; markdown may not render correctly.");
    }

    // Configure DOMPurify to allow YouTube iframes
    configureDOMPurify();

    // Initialize About tab and crypto donations
    initializeAboutTab();

    // Initialize model parameter controls with values from config
    initializeModelSettings();

    // Set initial conversation name based on personality/prompt type
    initializeConversationName();

    // Setup event listeners
    setupEventListeners();
    if (window.VERBOSE_LOGGING) {
      console.info("Event listeners set up.");
    }

    // Initialize tabs in settings panel
    if (typeof window.initTabs === "function") {
      window.initTabs();
      if (window.VERBOSE_LOGGING) {
        console.info("Settings panel tabs initialized.");
      }
    } else {
      console.warn("Tab initialization function not found");
    }

    // Initialize tools settings
    if (typeof window.initToolsSettings === "function") {
      window.initToolsSettings();
      if (window.VERBOSE_LOGGING) {
        console.info("Tools settings initialized.");
      }
    } else {
      console.warn("Tools settings initialization function not found");
    }

    // Initialize memory settings (separate from tools UI)
    if (typeof window.initMemorySettings === "function") {
      try {
        window.initMemorySettings();
        if (window.VERBOSE_LOGGING) {
          console.info("Memory settings initialized.");
        }
        // Sync feature badges after memory init
        if (typeof window.updateFeatureStatus === "function") {
          window.updateFeatureStatus();
        }
      } catch (e) {
        console.error("Memory settings initialization failed:", e);
      }
    }

    // Initialize MCP servers management
    if (typeof window.initMCPServers === "function") {
      try {
        window.initMCPServers();
        if (window.VERBOSE_LOGGING) {
          console.info("MCP servers initialized.");
        }
      } catch (e) {
        console.error("MCP servers initialization failed:", e);
      }
    }

    // Try to load from URL if available
    try {
      if (typeof window.loadFromUrl === "function") {
        window.loadFromUrl();
      } else if (typeof window.loadHistoryModule === "function") {
        await window.loadHistoryModule();
        if (typeof window.loadFromUrl === "function") {
          window.loadFromUrl();
        }
      }
      if (window.VERBOSE_LOGGING) {
        console.info("Loaded chat state from URL (if present).");
      }
    } catch (e) {
      console.warn("Error loading from URL:", e);
    }

    // Initialize services and models
    initializeServicesAndModels();

    // Initialize mobile keyboard handling
    window.initializeMobileKeyboardHandling();
    if (window.VERBOSE_LOGGING) {
      console.info("Mobile keyboard handling initialized.");
    }
    // Call these functions to initialize the UI
    window.updateParameterControls();

    // Ensure API keys are loaded before updating model selector
    if (typeof window.ensureApiKeysLoaded === "function") {
      window.ensureApiKeysLoaded();
      if (window.VERBOSE_LOGGING) {
        console.info("API keys loaded from localStorage.");
      }
    }

    // Explicitly initialize personality input
    if (typeof window.initializePersonalityInput === "function") {
      window.initializePersonalityInput();
    }

    window.updateModelSelector();
    window.updateHeaderInfo();
    if (window.VERBOSE_LOGGING) {
      console.info("UI controls and selectors initialized.");
    }

    // Share references with the API module
    initializeApiReferences();
    // Add scroll event listener to chatBox to track when user manually scrolls
    setupScrollTracking();

    // Focus the user input safely (checks for mobile device)
    focusInputField();

    // Initialize tool calling toggle state
    initializeToolCalling();
    if (typeof window.updateFeatureStatus === "function") {
      window.updateFeatureStatus();
    }
    // Apply data settings enabled/disabled state to the Data tab UI
    if (typeof window.applyDataSettingsState === "function") {
      try { window.applyDataSettingsState(); } catch (e) { /* noop */ }
    }

    if (typeof window.initGallery === "function") {
      try { window.initGallery(); } catch (e) { console.warn("initGallery failed:", e); }
    }

    if (typeof window.renderChatHistoryList === "function") {
      try { window.renderChatHistoryList(); } catch (e) { console.warn("renderChatHistoryList failed:", e); }
    }

    // Initialize Verbose Mode toggle state
    if (typeof window.initializeVerboseMode === "function") {
      window.initializeVerboseMode();
    }

    // Load location services if previously enabled
    if (localStorage.getItem("locationEnabled") === "true" && typeof window.loadLocationModule === "function") {
      window.loadLocationModule().then(() => {
        if (typeof window.initializeLocationService === "function") {
          window.initializeLocationService();
        }
        if (typeof window.updateFeatureStatus === "function") {
          window.updateFeatureStatus();
        }
      }).catch(err => console.error("Failed to load location module", err));
    } else {
      // Ensure badges render at least once even if location is disabled
      if (typeof window.updateFeatureStatus === "function") {
        window.updateFeatureStatus();
      }
    }

    // Check if API keys are missing and auto-open the API keys tab if needed
    if (typeof window.openApiKeysTabIfNeeded === "function") {
      // Add a delay so users can see the chat interface before the API key menu appears
      setTimeout(() => {
        window.openApiKeysTabIfNeeded();
      }, 2000);
    }

    if (window.VERBOSE_LOGGING) {
      console.info("Chatbot application initialization complete.");
    }

    // Mark body as loaded to show the interface
    document.body.classList.add("loaded");

    // Initialize vector store system after main app is loaded
    if (typeof window.loadVectorStoreModule === "function") {
      window.loadVectorStoreModule().catch(e => console.error("Vector store loading failed:", e));
    }

  } catch (error) {
    console.error("Initialization error:", error);
    // Still show the interface even if there's an error
    document.body.classList.add("loaded");
  }
}

/**
 * Initialize API references sharing
 */
function initializeApiReferences() {
  if (window.initApiReferences) {
    window.initApiReferences({
      personalityPromptRadio: window.personalityPromptRadio,
      personalityInput: window.personalityInput,
      customPromptRadio: window.customPromptRadio,
      systemPromptCustom: window.systemPromptCustom,
      noPromptRadio: window.noPromptRadio,
      modelSelector: window.modelSelector,
      conversationHistory: window.conversationHistory,
    });
    if (window.VERBOSE_LOGGING) {
      console.info("API references shared.");
    }
  } else {
    console.warn("initApiReferences function not found. API integration may not work properly.");
  }
}

/**
 * Setup scroll tracking for auto-scroll functionality
 */
function setupScrollTracking() {
  window.chatBox.addEventListener("scroll", () => {
    const wasAtBottom = window.chatBox.scrollHeight - window.chatBox.clientHeight - window.chatBox.scrollTop < 20;
    window.shouldAutoScroll = wasAtBottom;
  });
}

/**
 * Focus user input safely (checks for mobile devices)
 * Uses the implementation from mobileHandling.js when available
 */
function focusInputField() {
  // Check if the implementation from mobileHandling.js is available
  const externalImplementation = window.focusUserInputSafely;

  if (typeof externalImplementation === "function") {
    // Call the implementation from mobileHandling.js
    externalImplementation();
  } else if (window.userInput) {
    // Fallback to simple focus
    window.userInput.focus();
    if (window.VERBOSE_LOGGING) {
      console.info("User input focused.");
    }
  }
}

/**
 * Initialize textarea height to prevent changing height when typing starts
 */
function initializeTextareaHeight() {
  if (window.userInput) {
    // Set initial height to the default value from CSS
    window.userInput.style.height = "56px";
  }
}

// Make main function available globally for debugging and for menuLoader to call
window.initialize = initialize;
