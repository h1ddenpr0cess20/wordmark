/**
 * About-tab initialization.
 */

import { APP_VERSION, GITHUB_URL } from "../../config/config.ts";
import { state } from "./state.ts";

/**
 * Initializes the About tab's version and configuration display.
 */
export function initializeAboutTab() {
  const appVersionElement = document.getElementById("app-version");
  if (appVersionElement) {
    appVersionElement.textContent = APP_VERSION || "0.0.0";
    if (state.verboseLogging) {
      console.info("App version set:", appVersionElement.textContent);
    }
  }

  const githubLinkElement = document.getElementById("github-link") as HTMLAnchorElement | null;
  if (githubLinkElement && GITHUB_URL) {
    githubLinkElement.href = GITHUB_URL;
    if (state.verboseLogging) {
      console.info("GitHub URL set:", githubLinkElement.href);
    }
  }
}
