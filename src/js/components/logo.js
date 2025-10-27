// Generates the Wordmark header logo shown in the app chrome.

const SVG_NS = "http://www.w3.org/2000/svg";

function clearContainer(container) {
  if (!container) return;
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
}

function buildWordmarkLogo(svgContainer) {
  if (!svgContainer) return;

  const accent = "var(--accent-color, currentColor)";
  const accentHover = "var(--accent-hover, var(--accent-color, currentColor))";

  const outerRing = document.createElementNS(SVG_NS, "circle");
  outerRing.setAttribute("cx", "50");
  outerRing.setAttribute("cy", "50");
  outerRing.setAttribute("r", "30");
  outerRing.setAttribute("fill", accent);
  outerRing.setAttribute("fill-opacity", "0.12");
  outerRing.setAttribute("stroke", accent);
  outerRing.setAttribute("stroke-width", "5");
  svgContainer.appendChild(outerRing);

  const wPath = document.createElementNS(SVG_NS, "path");
  wPath.setAttribute("d", "M28 32 L38 70 L50 46 L62 70 L72 32");
  wPath.setAttribute("fill", "none");
  wPath.setAttribute("stroke", accentHover);
  wPath.setAttribute("stroke-width", "6");
  wPath.setAttribute("stroke-linecap", "round");
  wPath.setAttribute("stroke-linejoin", "round");
  svgContainer.appendChild(wPath);
}

function renderWordmarkLogo() {
  const svgContainer = document.querySelector("#wordmark-logo g");
  if (!svgContainer) return;

  clearContainer(svgContainer);

  buildWordmarkLogo(svgContainer);

  const logoContainer = document.getElementById("logo-container");
  if (logoContainer) {
    logoContainer.classList.add("logo-ready");
  }
}

// Initialize logo when DOM is ready
if (typeof window !== "undefined") {
  window.renderWordmarkLogo = renderWordmarkLogo;
}

document.addEventListener("DOMContentLoaded", renderWordmarkLogo);
