/**
 * Handles loading external HTML content and initializing menus
 */

// HTML Content Loader Utility
window.HTMLLoader = {
  /**
   * Load HTML content from a file and insert it into a container
   * @param {string} filePath - Path to the HTML file
   * @param {string} containerId - ID of the container element
   */
  async loadHTML(filePath, containerId) {
    try {
      const response = await fetch(filePath);
      if (!response.ok) {
        throw new Error(`Failed to load ${filePath}: ${response.status}`);
      }
      const htmlContent = await response.text();
      const container = document.getElementById(containerId);
      if (container) {
        container.innerHTML = htmlContent;
      } else {
        console.error(`Container with ID '${containerId}' not found`);
      }
    } catch (error) {
      console.error(`Error loading HTML content from ${filePath}:`, error);
    }
  },

  /**
   * Load multiple HTML files into their respective containers
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
