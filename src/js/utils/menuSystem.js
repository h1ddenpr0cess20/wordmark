/**
 * Handles loading external HTML content and initializing menus.
 * Panel fragments are imported at build time via Vite `?raw` imports, so there
 * are no runtime fetches — the markup is bundled directly into the JS.
 */

import panelsHtml from "../../html/panels.html?raw";
import personalityHtml from "../../html/panels/settings/personality.html?raw";
import modelHtml from "../../html/panels/settings/model.html?raw";
import toolsHtml from "../../html/panels/settings/tools.html?raw";
import dataHtml from "../../html/panels/settings/data.html?raw";
import memoryHtml from "../../html/panels/settings/memory.html?raw";
import ttsHtml from "../../html/panels/settings/tts.html?raw";
import themeHtml from "../../html/panels/settings/theme.html?raw";
import apiKeysHtml from "../../html/panels/settings/apiKeys.html?raw";
import locationHtml from "../../html/panels/settings/location.html?raw";
import aboutHtml from "../../html/panels/settings/about.html?raw";

// Map of source path -> bundled markup so callers can keep referring to files.
const PANEL_HTML = {
  "src/html/panels.html": panelsHtml,
  "src/html/panels/settings/personality.html": personalityHtml,
  "src/html/panels/settings/model.html": modelHtml,
  "src/html/panels/settings/tools.html": toolsHtml,
  "src/html/panels/settings/data.html": dataHtml,
  "src/html/panels/settings/memory.html": memoryHtml,
  "src/html/panels/settings/tts.html": ttsHtml,
  "src/html/panels/settings/theme.html": themeHtml,
  "src/html/panels/settings/apiKeys.html": apiKeysHtml,
  "src/html/panels/settings/location.html": locationHtml,
  "src/html/panels/settings/about.html": aboutHtml,
};

// HTML Content Loader Utility
window.HTMLLoader = {
  /**
   * Insert bundled HTML content into a container
   * @param {string} filePath - Source path of the HTML fragment
   * @param {string} containerId - ID of the container element
   */
  async loadHTML(filePath, containerId) {
    const htmlContent = PANEL_HTML[filePath];
    if (typeof htmlContent !== "string") {
      console.error(`No bundled HTML registered for ${filePath}`);
      return;
    }
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = htmlContent;
    } else {
      console.error(`Container with ID '${containerId}' not found`);
    }
  },

  /**
   * Load multiple HTML fragments into their respective containers
   * @param {Array} loadConfigs - Array of {filePath, containerId} objects
   */
  async loadMultiple(loadConfigs) {
    const promises = loadConfigs.map(config =>
      this.loadHTML(config.filePath, config.containerId),
    );
    await Promise.all(promises);
  },
};

const SETTINGS_TAB_PARTIALS = [
  { filePath: "src/html/panels/settings/personality.html", containerId: "content-personality" },
  { filePath: "src/html/panels/settings/model.html", containerId: "content-model" },
  { filePath: "src/html/panels/settings/tools.html", containerId: "content-tools" },
  { filePath: "src/html/panels/settings/data.html", containerId: "content-data" },
  { filePath: "src/html/panels/settings/memory.html", containerId: "content-memory" },
  { filePath: "src/html/panels/settings/tts.html", containerId: "content-tts" },
  { filePath: "src/html/panels/settings/theme.html", containerId: "content-theme" },
  { filePath: "src/html/panels/settings/apiKeys.html", containerId: "content-apikeys" },
  { filePath: "src/html/panels/settings/location.html", containerId: "content-location" },
  { filePath: "src/html/panels/settings/about.html", containerId: "content-about" },
];

// Menu Loader Initialization
(async function initializeMenus() {
  // Wait for DOM to be ready
  if (document.readyState === "loading") {
    await new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve));
  }

  // Wait for the HTML loader to be available
  if (typeof window.HTMLLoader === "undefined") {
    console.error("HTMLLoader not available");
    return;
  }

  try {
    // Load the combined panels HTML file
    await window.HTMLLoader.loadHTML("src/html/panels.html", "menu-panels-container");
    await window.HTMLLoader.loadMultiple(SETTINGS_TAB_PARTIALS);
    console.log("All menu panels loaded successfully");
    // Initialize theme selector now that panels exist
    if (typeof window.initTheme === "function") {
      try {
        await window.initTheme();
      } catch (e) {
        console.warn("initTheme failed:", e);
      }
    }

    // Now that menus are loaded, initialize the application
    const initFn = (typeof window !== "undefined") ? window.initialize : undefined;
    if (typeof initFn === "function") {
      initFn();
    } else {
      console.error("Initialize function not found");
    }
  } catch (error) {
    console.error("Error loading menu panels:", error);
  }
}());
