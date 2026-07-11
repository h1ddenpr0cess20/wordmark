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
import { syncDesktopTitlebarColors } from "./desktopTitlebar.ts";
import darkThemeCss from "../../css/themes/base/dark.css?raw";
import lightThemeCss from "../../css/themes/base/light.css?raw";
import specialThemeCss from "../../css/themes/base/special.css?raw";

const DEFAULT_THEME = "theme-aurora";

let themeSelector: HTMLSelectElement | null = null;
let currentTheme = DEFAULT_THEME;

let themeCategories: Record<string, string[]> = {};

let colorParsingContext: CanvasRenderingContext2D | null = null;

/**
 * Extract theme names from CSS files
 */
function extractThemesFromCSS() {
  return {
    "Dark Themes": parseThemeClassNames(darkThemeCss),
    "Light Themes": parseThemeClassNames(lightThemeCss),
    "Special Themes": parseThemeClassNames(specialThemeCss),
  };
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
function populateThemeSelector() {
  const themeSelector = document.getElementById("theme-selector") as HTMLSelectElement | null;
  if (!themeSelector) {
    console.error("Theme selector not found");
    return;
  }

  if (Object.keys(themeCategories).length === 0) {
    themeCategories = extractThemesFromCSS();
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
export function initTheme() {
  themeCategories = extractThemesFromCSS();

  populateThemeSelector();

  themeSelector = document.getElementById("theme-selector") as HTMLSelectElement | null;

  if (!themeSelector) {
    console.error("Theme selector not found");
    return;
  }

  const savedTheme = localStorage.getItem(STORAGE_KEYS.selectedTheme);
  if (savedTheme && getThemeClasses().includes(savedTheme)) {
    currentTheme = savedTheme;
  } else {
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
}

/**
 * Applies a theme to the document.
 *
 * @param themeName - The name/class of the theme to apply.
 */
export function applyTheme(themeName: string) {
  const existing = Array.from(document.body.classList).filter(c => c.startsWith("theme-"));
  if (existing.length > 0) {
    document.body.classList.remove(...existing);
  }

  document.body.classList.add(themeName);

  updateThemeColorTriplets();

  syncDesktopTitlebarColors();

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
