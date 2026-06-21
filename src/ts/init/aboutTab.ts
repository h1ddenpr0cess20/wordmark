/**
 * About-tab initialization.
 */

import { APP_VERSION, GITHUB_URL } from "../../config/config.ts";
import { createScopedLogger } from "../utils/logger.ts";

const logAbout = createScopedLogger("about");

/**
 * Initializes the About tab's version and configuration display.
 */
export function initializeAboutTab() {
  const appVersionElement = document.getElementById("app-version");
  if (appVersionElement) {
    appVersionElement.textContent = APP_VERSION || "0.0.0";
    logAbout("App version set:", appVersionElement.textContent);
  }

  const githubLinkElement = document.getElementById("github-link") as HTMLAnchorElement | null;
  if (githubLinkElement && GITHUB_URL) {
    githubLinkElement.href = GITHUB_URL;
    logAbout("GitHub URL set:", githubLinkElement.href);
  }
}
