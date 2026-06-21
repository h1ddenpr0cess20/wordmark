/**
 * Theme management.
 *
 * @remarks
 * Theme CSS is imported as raw text so theme class names can be parsed in both
 * the Vite dev server (where a plain fetch of a `.css` URL returns a JS HMR
 * wrapper, not the stylesheet) and production builds.
 */

import hljs from "highlight.js";
import { STORAGE_KEYS } from "../utils/storage/storage.ts";
import { logVerbose } from "../utils/logger.ts";
import { parseThemeClassNames, getThemeDisplayName } from "./themeNames.ts";
import darkThemeCss from "../../css/themes/base/dark.css?raw";
import lightThemeCss from "../../css/themes/base/light.css?raw";
import metalThemeCss from "../../css/themes/base/metal.css?raw";
import neonThemeCss from "../../css/themes/base/neon.css?raw";
import countryThemeCss from "../../css/themes/base/country.css?raw";
import specialThemeCss from "../../css/themes/base/special.css?raw";
import metalCodeCss from "../../css/themes/code/metal.css?raw";
import neonCodeCss from "../../css/themes/code/neon.css?raw";
import countryCodeCss from "../../css/themes/code/country.css?raw";

const DEFAULT_THEME = "theme-aurora";

let themeSelector: HTMLSelectElement | null = null;
let currentTheme = DEFAULT_THEME;

let themeCategories: Record<string, string[]> = {};

let colorParsingContext: CanvasRenderingContext2D | null = null;

/**
 * An optional theme collection that is not bundled in the CSS by default. Its
 * base + code CSS is injected into the document only once the user installs it.
 */
interface ThemePack {
  key: string;
  category: string;
  baseCss: string;
  codeCss: string;
}

/** The installable theme packs, in the order they appear in the selector. */
const THEME_PACKS: ThemePack[] = [
  { key: "metal", category: "Metal Themes", baseCss: metalThemeCss, codeCss: metalCodeCss },
  { key: "neon", category: "Neon Themes", baseCss: neonThemeCss, codeCss: neonCodeCss },
  { key: "country", category: "Country Themes", baseCss: countryThemeCss, codeCss: countryCodeCss },
];

/** Reads the set of installed theme-pack keys from localStorage (empty by default). */
function getInstalledPacks(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.installedThemePacks);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/** Persists the installed theme-pack keys. */
function setInstalledPacks(keys: Set<string>) {
  localStorage.setItem(STORAGE_KEYS.installedThemePacks, JSON.stringify([...keys]));
}

/** Injects a pack's base + code CSS as a `<style>` element (idempotent). */
function injectPackStyles(pack: ThemePack) {
  const id = `theme-pack-style-${pack.key}`;
  if (document.getElementById(id)) {
    return;
  }
  const style = document.createElement("style");
  style.id = id;
  style.setAttribute("data-theme-pack", pack.key);
  style.textContent = `${pack.baseCss}\n${pack.codeCss}`;
  document.head.appendChild(style);
}

/** Removes a pack's injected `<style>` element, if present. */
function removePackStyles(pack: ThemePack) {
  document.getElementById(`theme-pack-style-${pack.key}`)?.remove();
}

/**
 * Extract theme names from CSS files
 */
function extractThemesFromCSS() {
  const installed = getInstalledPacks();

  // Always-bundled categories, in selector order (Special sits above the
  // optional packs).
  const categories: Record<string, string[]> = {
    "Dark Themes": parseThemeClassNames(darkThemeCss),
    "Light Themes": parseThemeClassNames(lightThemeCss),
    "Special Themes": parseThemeClassNames(specialThemeCss),
  };

  // Optional packs appear only once installed.
  for (const pack of THEME_PACKS) {
    if (installed.has(pack.key)) {
      categories[pack.category] = parseThemeClassNames(pack.baseCss);
    }
  }

  return categories;
}

/** Returns the theme class names belonging to a pack (parsed from its base CSS). */
function packThemeClasses(pack: ThemePack): string[] {
  return parseThemeClassNames(pack.baseCss);
}

/** Installs a pack: injects its CSS, persists the choice, and refreshes the selector. */
function installThemePack(pack: ThemePack) {
  const installed = getInstalledPacks();
  installed.add(pack.key);
  setInstalledPacks(installed);
  injectPackStyles(pack);
  themeCategories = extractThemesFromCSS();
  populateThemeSelector();
  if (themeSelector) {
    themeSelector.value = currentTheme;
  }
}

/**
 * Uninstalls a pack: removes its CSS, persists the choice, and refreshes the
 * selector. If the active theme came from this pack, falls back to the default.
 */
function uninstallThemePack(pack: ThemePack) {
  const installed = getInstalledPacks();
  installed.delete(pack.key);
  setInstalledPacks(installed);

  if (packThemeClasses(pack).includes(currentTheme)) {
    applyTheme(DEFAULT_THEME);
    currentTheme = DEFAULT_THEME;
  }

  removePackStyles(pack);
  themeCategories = extractThemesFromCSS();
  populateThemeSelector();
  if (themeSelector) {
    themeSelector.value = currentTheme;
  }
}

/** Injects the CSS for every currently-installed pack (called once at startup). */
function injectInstalledPacks() {
  const installed = getInstalledPacks();
  for (const pack of THEME_PACKS) {
    if (installed.has(pack.key)) {
      injectPackStyles(pack);
    }
  }
}

/** Wires the install/uninstall checkboxes in the theme settings panel. */
function setupThemePackToggles() {
  const installed = getInstalledPacks();
  for (const pack of THEME_PACKS) {
    const checkbox = document.getElementById(`theme-pack-toggle-${pack.key}`) as HTMLInputElement | null;
    if (!checkbox) {
      continue;
    }
    checkbox.checked = installed.has(pack.key);
    checkbox.addEventListener("change", () => {
      try {
        if (checkbox.checked) {
          installThemePack(pack);
        } else {
          uninstallThemePack(pack);
        }
      } catch (error) {
        console.error(`Failed to ${checkbox.checked ? "install" : "uninstall"} theme pack '${pack.key}':`, error);
        checkbox.checked = getInstalledPacks().has(pack.key);
      }
    });
  }
}

function getThemeClasses() {
  return Object.values(themeCategories).flat();
}

/**
 * Parses any CSS color string into an `"r, g, b"` triplet.
 *
 * @param colorValue - The CSS color string to parse.
 * @returns The `"r, g, b"` triplet, or `null` if it cannot be parsed.
 */
function toRgbTriplet(colorValue: string) {
  if (!colorValue) {
    return null;
  }

  if (!colorParsingContext) {
    const canvas = document.createElement("canvas");
    colorParsingContext = canvas.getContext("2d");
    if (!colorParsingContext) {
      return null;
    }
  }

  try {
    colorParsingContext.fillStyle = colorValue;
    const computed = colorParsingContext.fillStyle;
    const match = computed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (match) {
      return `${match[1]}, ${match[2]}, ${match[3]}`;
    }
  } catch (error) {
    console.warn("Failed to parse theme color", colorValue, error);
  }

  return null;
}

/**
 * Ensure RGB helper variables stay in sync with the active theme colors
 */
function updateThemeColorTriplets() {
  if (typeof document === "undefined" || !document.body) {
    return;
  }

  const computedStyles = getComputedStyle(document.body);

  const syncColor = (sourceVar: string, targetVar: string) => {
    const colorValue = computedStyles.getPropertyValue(sourceVar).trim();
    if (!colorValue) {
      document.body.style.removeProperty(targetVar);
      return;
    }

    const rgbTriplet = toRgbTriplet(colorValue);
    if (!rgbTriplet) {
      document.body.style.removeProperty(targetVar);
      return;
    }

    document.body.style.setProperty(targetVar, rgbTriplet);
  };

  syncColor("--accent-color", "--accent-color-rgb");
  syncColor("--accent-hover", "--accent-hover-rgb");
  syncColor("--border-color", "--border-color-rgb");
  syncColor("--text-primary", "--text-primary-rgb");
  syncColor("--text-secondary", "--text-secondary-rgb");
  syncColor("--bg-primary", "--bg-primary-rgb");
  syncColor("--bg-secondary", "--bg-secondary-rgb");
}

/**
 * Populate the theme selector with organized optgroups
 */
async function populateThemeSelector() {
  const themeSelector = document.getElementById("theme-selector") as HTMLSelectElement | null;
  if (!themeSelector) {
    console.error("Theme selector not found");
    return;
  }

  if (Object.keys(themeCategories).length === 0) {
    themeCategories = await extractThemesFromCSS();
  }

  themeSelector.innerHTML = "";

  Object.entries(themeCategories).forEach(([categoryName, themes]) => {
    if (themes.length === 0) {
      return;
    }

    const optgroup = document.createElement("optgroup");
    optgroup.label = categoryName;

    themes.forEach(themeId => {
      const option = document.createElement("option");
      option.value = themeId;
      option.textContent = getThemeDisplayName(themeId);
      optgroup.appendChild(option);
    });

    themeSelector.appendChild(optgroup);
  });
}

/**
 * Initialize theme functionality
 */
export async function initTheme() {
  // Optional packs must be injected before applying a saved theme that belongs
  // to one, so its styling is present.
  injectInstalledPacks();

  themeCategories = await extractThemesFromCSS();

  await populateThemeSelector();

  themeSelector = document.getElementById("theme-selector") as HTMLSelectElement | null;

  if (!themeSelector) {
    console.error("Theme selector not found");
    return;
  }

  const savedTheme = localStorage.getItem(STORAGE_KEYS.selectedTheme);
  if (savedTheme && getThemeClasses().includes(savedTheme)) {
    currentTheme = savedTheme;
  } else {
    // No saved theme, or it belongs to a pack that is no longer installed.
    currentTheme = DEFAULT_THEME;
  }
  themeSelector.value = currentTheme;

  applyTheme(currentTheme);

  themeSelector.addEventListener("change", (e: Event) => {
    const newTheme = (e.target as HTMLSelectElement).value;
    applyTheme(newTheme);
    currentTheme = newTheme;
    localStorage.setItem(STORAGE_KEYS.selectedTheme, newTheme);
  });

  setupThemePackToggles();
}

/**
 * Applies a theme to the document.
 *
 * @param themeName - The name/class of the theme to apply.
 */
export function applyTheme(themeName: string) {
  // Remove every theme-* class (not just currently-registered ones) so a theme
  // from a just-uninstalled pack is fully cleared.
  const existing = Array.from(document.body.classList).filter(c => c.startsWith("theme-"));
  if (existing.length > 0) {
    document.body.classList.remove(...existing);
  }

  document.body.classList.add(themeName);

  updateThemeColorTriplets();

  localStorage.setItem(STORAGE_KEYS.selectedTheme, themeName);

  const selector = document.getElementById("theme-selector") as HTMLSelectElement | null;
  if (selector) {
    selector.value = themeName;
  }

  updateCodeHighlighting();

  updateThemePreview();
}

/**
 * Rehighlight all code blocks to apply the current theme styling
 */
function rehighlightCodeBlocks() {
  try {
    const codeBlocks = document.querySelectorAll<HTMLElement>("pre code");

    if (codeBlocks && codeBlocks.length > 0) {
      logVerbose(`Rehighlighting ${codeBlocks.length} code blocks with current theme`);

      hljs.configure({
        ignoreUnescapedHTML: true,
      });

      codeBlocks.forEach((codeBlock) => {
        try {
          if (!codeBlock.hasAttribute("data-original-code")) {
            codeBlock.setAttribute("data-original-code", codeBlock.textContent || "");
          }

          hljs.highlightElement(codeBlock);

          if (codeBlock.parentElement && !codeBlock.parentElement.classList.contains("code-block")) {
            codeBlock.parentElement.classList.add("code-block");
          }
        } catch (error) {
          console.error("Error highlighting code block:", error);
        }
      });
    } else {
      logVerbose("No code blocks found to rehighlight");
    }
  } catch (error) {
    console.error("Error in rehighlightCodeBlocks:", error);
  }
}

/**
 * Update the theme preview dots in the settings panel
 */
function updateThemePreview() {
  const colorDots = document.querySelectorAll<HTMLElement>(".color-dot");
  if (colorDots && colorDots.length > 0) {
    colorDots[0].style.backgroundColor = "var(--bg-primary)";
    colorDots[1].style.backgroundColor = "var(--bg-secondary)";
    colorDots[2].style.backgroundColor = "var(--text-primary)";
    colorDots[3].style.backgroundColor = "var(--accent-color)";
    colorDots[4].style.backgroundColor = "var(--user-bg)";
  }
}

function updateCodeHighlighting() {
  rehighlightCodeBlocks();
}

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      initTheme();
    }, 100);
  });
}
