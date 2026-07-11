declare global {
  interface Window {
    wordmarkDesktop?: {
      platform: string;
      setTitleBarColors: (colors: { color: string; symbolColor: string }) => Promise<void>;
    };
  }
}

let colorParsingContext: CanvasRenderingContext2D | null = null;

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

export function initDesktopTitlebar() {
  const bridge = window.wordmarkDesktop;
  if (!bridge) {
    return;
  }

  document.body.classList.add("desktop-app", `platform-${bridge.platform}`);
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
