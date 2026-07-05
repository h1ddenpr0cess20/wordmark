/**
 * Handles loading external HTML content and initializing menus.
 * Panel fragments are imported at build time via Vite `?raw` imports, so there
 * are no runtime fetches — the markup is bundled directly into the JS.
 */

import panelsHtml from "../../../html/panels.html?raw";
import personalityHtml from "../../../html/panels/settings/personality.html?raw";
import modelHtml from "../../../html/panels/settings/model.html?raw";
import toolsHtml from "../../../html/panels/settings/tools.html?raw";
import skillsHtml from "../../../html/panels/settings/skills.html?raw";
import dataHtml from "../../../html/panels/settings/data.html?raw";
import memoryHtml from "../../../html/panels/settings/memory.html?raw";
import ttsHtml from "../../../html/panels/settings/tts.html?raw";
import themeHtml from "../../../html/panels/settings/theme.html?raw";
import apiKeysHtml from "../../../html/panels/settings/apiKeys.html?raw";
import locationHtml from "../../../html/panels/settings/location.html?raw";
import { initTheme } from "../../components/theme.ts";
import aboutHtml from "../../../html/panels/settings/about.html?raw";
import { logVerbose } from "../logger.ts";

/** Maps each panel's source path to its build-time bundled markup. */
const PANEL_HTML = {
  "src/html/panels.html": panelsHtml,
  "src/html/panels/settings/personality.html": personalityHtml,
  "src/html/panels/settings/model.html": modelHtml,
  "src/html/panels/settings/tools.html": toolsHtml,
  "src/html/panels/settings/skills.html": skillsHtml,
  "src/html/panels/settings/data.html": dataHtml,
  "src/html/panels/settings/memory.html": memoryHtml,
  "src/html/panels/settings/tts.html": ttsHtml,
  "src/html/panels/settings/theme.html": themeHtml,
  "src/html/panels/settings/apiKeys.html": apiKeysHtml,
  "src/html/panels/settings/location.html": locationHtml,
  "src/html/panels/settings/about.html": aboutHtml,
};

/** Inserts bundled panel markup into DOM containers. */
export const HTMLLoader = {
  /**
   * Inserts a bundled HTML fragment into a container element.
   *
   * @param filePath - Source path of the fragment (a {@link PANEL_HTML} key).
   * @param containerId - Id of the container to populate.
   */
  async loadHTML(filePath: string, containerId: string) {
    const htmlContent = (PANEL_HTML as Record<string, string>)[filePath];
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
   * Loads several fragments into their containers in parallel.
   *
   * @param loadConfigs - `{ filePath, containerId }` pairs to load.
   */
  async loadMultiple(loadConfigs: { filePath: string; containerId: string }[]) {
    const promises = loadConfigs.map((config) =>
      this.loadHTML(config.filePath, config.containerId),
    );
    await Promise.all(promises);
  },
};

const SETTINGS_TAB_PARTIALS = [
  { filePath: "src/html/panels/settings/personality.html", containerId: "content-personality" },
  { filePath: "src/html/panels/settings/model.html", containerId: "content-model" },
  { filePath: "src/html/panels/settings/tools.html", containerId: "content-tools" },
  { filePath: "src/html/panels/settings/skills.html", containerId: "content-skills" },
  { filePath: "src/html/panels/settings/data.html", containerId: "content-data" },
  { filePath: "src/html/panels/settings/memory.html", containerId: "content-memory" },
  { filePath: "src/html/panels/settings/tts.html", containerId: "content-tts" },
  { filePath: "src/html/panels/settings/theme.html", containerId: "content-theme" },
  { filePath: "src/html/panels/settings/apiKeys.html", containerId: "content-apikeys" },
  { filePath: "src/html/panels/settings/location.html", containerId: "content-location" },
  { filePath: "src/html/panels/settings/about.html", containerId: "content-about" },
];

/**
 * Loads all menu/settings panels into the DOM and initializes the theme selector.
 *
 * @remarks
 * The caller runs the app's `initialize()` once this resolves `true`.
 *
 * @returns `true` when the panels loaded successfully, `false` on error.
 */
export async function initializeMenus() {
  if (document.readyState === "loading") {
    await new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve));
  }

  try {
    await HTMLLoader.loadHTML("src/html/panels.html", "menu-panels-container");
    await HTMLLoader.loadMultiple(SETTINGS_TAB_PARTIALS);
    logVerbose("All menu panels loaded successfully");
    try {
      initTheme();
    } catch (e) {
      console.warn("initTheme failed:", e);
    }
    return true;
  } catch (error) {
    console.error("Error loading menu panels:", error);
    return false;
  }
}
