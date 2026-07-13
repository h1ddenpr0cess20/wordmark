/**
 * Custom title bar for the Electron desktop shell.
 *
 * @remarks
 * The desktop window is frameless (`titleBarStyle: "hidden"` in
 * `electron/main.cjs`), so the web app renders its own drag strip
 * (`#desktop-titlebar`) themed with the app's CSS variables, and pushes the
 * active theme's colors to the native window-control overlay on Windows and
 * Linux. In a regular browser the preload bridge is absent and this module
 * does nothing.
 */

declare global {
  interface Window {
    /** Bridge exposed by `electron/preload.cjs` when running in the desktop app. */
    wordmarkDesktop?: {
      platform: string;
      setTitleBarColors: (colors: { color: string; symbolColor: string }) => Promise<void>;
      writeText: (text: string) => Promise<void>;
    };
  }
}

let colorParsingContext: CanvasRenderingContext2D | null = null;

/**
 * Normalizes any CSS color string to `#rrggbb`, which is the only format the
 * native title bar overlay accepts.
 *
 * @param colorValue - The CSS color string to convert.
 * @returns The hex color, or `null` if it cannot be parsed.
 */
function toHexColor(colorValue: string) {
  if (!colorValue) {
    return null;
  }

  if (!colorParsingContext) {
    colorParsingContext = document.createElement("canvas").getContext("2d");
    if (!colorParsingContext) {
      return null;
    }
  }

  try {
    colorParsingContext.fillStyle = colorValue;
    const computed = colorParsingContext.fillStyle;

    if (/^#[0-9a-f]{6}$/i.test(computed)) {
      return computed;
    }

    const match = computed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (match) {
      const toHex = (channel: string) => Number(channel).toString(16).padStart(2, "0");
      return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
    }
  } catch (error) {
    console.warn("Failed to parse title bar color", colorValue, error);
  }

  return null;
}

/**
 * Pushes the active theme's colors to the native window-control overlay so
 * the minimize/maximize/close buttons match the custom title bar. No-op
 * outside the desktop app.
 */
export function syncDesktopTitlebarColors() {
  const bridge = window.wordmarkDesktop;
  if (!bridge || !document.body) {
    return;
  }

  const computedStyles = getComputedStyle(document.body);
  const color = toHexColor(computedStyles.getPropertyValue("--bg-primary").trim());
  const symbolColor = toHexColor(computedStyles.getPropertyValue("--text-primary").trim());
  if (!color || !symbolColor) {
    return;
  }

  bridge.setTitleBarColors({ color, symbolColor }).catch((error) => {
    console.warn("Failed to update window control colors", error);
  });
}

/**
 * Shows the custom title bar and tags `body` with `desktop-app` (plus a
 * `platform-*` class) when running inside the Electron shell, so the CSS in
 * `components/layout/desktop.css` activates.
 */
export function initDesktopTitlebar() {
  const bridge = window.wordmarkDesktop;
  if (!bridge && !navigator.userAgent.includes("Electron")) {
    return;
  }

  document.body.classList.add("desktop-app");
  if (bridge) {
    document.body.classList.add(`platform-${bridge.platform}`);
  }
  document.getElementById("desktop-titlebar")?.removeAttribute("hidden");

  syncDesktopTitlebarColors();
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", () => initDesktopTitlebar());
  } else {
    initDesktopTitlebar();
  }
}
