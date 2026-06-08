/**
 * Theme management functions for the AI Assistant
 */

import { loadHighlightJS } from "../utils/highlight.js";

// Theme CSS is imported as raw text so theme class names can be parsed in both
// the Vite dev server (where a plain fetch of a .css URL returns a JS HMR
// wrapper, not the stylesheet) and production builds.
import darkThemeCss from "../../css/themes/base/dark.css?raw";
import lightThemeCss from "../../css/themes/base/light.css?raw";
import metalThemeCss from "../../css/themes/base/metal.css?raw";
import neonThemeCss from "../../css/themes/base/neon.css?raw";
import countryThemeCss from "../../css/themes/base/country.css?raw";
import specialThemeCss from "../../css/themes/base/special.css?raw";

// Initialize theme variables
let themeSelector = null;
let currentTheme = "theme-dark-blue"; // Default theme

// Theme categories - will be populated dynamically from CSS files
let themeCategories = {};

// Cached canvas context for CSS color parsing
let colorParsingContext = null;

/**
 * Extract theme names from CSS files
 */
function extractThemesFromCSS() {
  const themeSources = {
    "Dark Themes": darkThemeCss,
    "Light Themes": lightThemeCss,
    "Metal Themes": metalThemeCss,
    "Neon Themes": neonThemeCss,
    "Country Themes": countryThemeCss,
    "Special Themes": specialThemeCss,
  };

  const categories = {
    "Dark Themes": [],
    "Light Themes": [],
    "Metal Themes": [],
    "Neon Themes": [],
    "Country Themes": [],
    "Special Themes": [],
  };

  for (const [category, cssContent] of Object.entries(themeSources)) {
    // Extract theme class names using regex
    const themeMatches = (cssContent || "").match(/^\.theme-[a-zA-Z0-9-]+(?=\s*\{)/gm);
    if (themeMatches) {
      categories[category] = themeMatches
        .map(match => match.substring(1)) // Remove the leading dot
        .filter((theme, index, arr) => arr.indexOf(theme) === index);
    }
  }

  return categories;
}

// Special cases for theme display names
const themeNameOverrides = {
  "theme-usa": "USA",
  "theme-uk": "United Kingdom",
};

/**
 * Convert theme ID to display name
 * @param {string} themeId - The theme ID (e.g., 'theme-dark-red')
 * @returns {string} - The display name (e.g., 'Dark Red')
 */
function getThemeDisplayName(themeId) {
  // Check for overrides first
  if (themeNameOverrides[themeId]) {
    return themeNameOverrides[themeId];
  }

  // Remove 'theme-' prefix and convert to title case
  return themeId
    .replace("theme-", "")
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Generate flat array of theme classes for validation
function getThemeClasses() {
  return Object.values(themeCategories).flat();
}

/**
 * Parse any CSS color string into an "r, g, b" triplet
 * @param {string} colorValue
 * @returns {string|null}
 */
function toRgbTriplet(colorValue) {
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

  const syncColor = (sourceVar, targetVar) => {
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
  const themeSelector = document.getElementById("theme-selector");
  if (!themeSelector) {
    console.error("Theme selector not found");
    return;
  }

  // Extract themes from CSS files if not already loaded
  if (Object.keys(themeCategories).length === 0) {
    themeCategories = await extractThemesFromCSS();
  }

  // Clear existing options
  themeSelector.innerHTML = "";

  // Create optgroups and options
  Object.entries(themeCategories).forEach(([categoryName, themes]) => {
    if (themes.length === 0) {
      return;
    } // Skip empty categories

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
  // Extract themes from CSS files first
  themeCategories = await extractThemesFromCSS();

  // Populate the theme selector
  await populateThemeSelector();

  // Get theme selector
  themeSelector = document.getElementById("theme-selector");

  if (!themeSelector) {
    console.error("Theme selector not found");
    return;
  }

  // Load saved theme if it exists
  const savedTheme = localStorage.getItem("selectedTheme");
  if (savedTheme) {
    currentTheme = savedTheme;
    themeSelector.value = savedTheme;
  }

  // Apply the current theme
  applyTheme(currentTheme);

  // Add event listener for theme changes
  themeSelector.addEventListener("change", (e) => {
    const newTheme = e.target.value;
    applyTheme(newTheme);
    currentTheme = newTheme;
    localStorage.setItem("selectedTheme", newTheme);
  });
}

/**
 * Apply a theme to the document
 * @param {string} themeName - The name/class of the theme to apply
 */
export function applyTheme(themeName) {
  // Remove all theme classes from body
  document.body.classList.remove(...getThemeClasses());

  // Add the selected theme class
  document.body.classList.add(themeName);

  // Keep RGB helpers aligned with the current theme palette
  updateThemeColorTriplets();

  // Save the selected theme to localStorage
  localStorage.setItem("selectedTheme", themeName);

  // Update the theme selector dropdown
  document.getElementById("theme-selector").value = themeName;

  // Update code highlighting to match the theme
  updateCodeHighlighting(themeName);

  // Update preview dots in settings if visible
  updateThemePreview();
}

/**
 * Rehighlight all code blocks to apply the current theme styling
 */
function rehighlightCodeBlocks() {
  try {
    // Check if highlight.js is loaded
    if (window.hljs || typeof hljs !== "undefined") {
      const codeBlocks = document.querySelectorAll("pre code");

      if (codeBlocks && codeBlocks.length > 0) {
        console.log(`Rehighlighting ${codeBlocks.length} code blocks with current theme`);

        // Configure highlight.js to ignore unescaped HTML for security
        hljs.configure({
          ignoreUnescapedHTML: true,
        });

        codeBlocks.forEach((codeBlock) => {
          try {
            // Store original content if not already stored
            if (!codeBlock.hasAttribute("data-original-code")) {
              codeBlock.setAttribute("data-original-code", codeBlock.textContent);
            }

            // Apply highlighting
            hljs.highlightElement(codeBlock);

            // Add code-block class to parent for styling
            if (codeBlock.parentElement && !codeBlock.parentElement.classList.contains("code-block")) {
              codeBlock.parentElement.classList.add("code-block");
            }
          } catch (error) {
            console.error("Error highlighting code block:", error);
          }
        });
      } else {
        console.log("No code blocks found to rehighlight");
      }
    } else {
      console.log("Highlight.js not loaded, attempting to load it");
      // Try to load highlight.js
      loadHighlightJS().then(() => {
        // Try again after loading
        console.log("Highlight.js loaded, retrying rehighlight");
        rehighlightCodeBlocks();
      }).catch((error) => {
        console.error("Failed to load highlight.js:", error);
      });
    }
  } catch (error) {
    console.error("Error in rehighlightCodeBlocks:", error);
  }
}

/**
 * Update the theme preview dots in the settings panel
 */
function updateThemePreview() {
  // Update color dots to reflect current theme
  const colorDots = document.querySelectorAll(".color-dot");
  if (colorDots && colorDots.length > 0) {
    colorDots[0].style.backgroundColor = "var(--bg-primary)";
    colorDots[1].style.backgroundColor = "var(--bg-secondary)";
    colorDots[2].style.backgroundColor = "var(--text-primary)";
    colorDots[3].style.backgroundColor = "var(--accent-color)";
    colorDots[4].style.backgroundColor = "var(--user-bg)";
  }
}

function updateCodeHighlighting() {
  // Simply rehighlight using hljs; do not reset classes to avoid losing token styles
  if (typeof rehighlightCodeBlocks === "function") {
    rehighlightCodeBlocks();
  } else if (window.hljs) {
    window.hljs.highlightAll();
  }
}

// Add theme initialization to window load event
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    // Wait a moment to ensure all resources are loaded
    setTimeout(() => {
      initTheme();
    }, 100);
  });
}
