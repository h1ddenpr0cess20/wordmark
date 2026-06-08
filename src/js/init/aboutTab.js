import { APP_VERSION, GITHUB_URL } from "../../config/config.js";
import { state } from "./state.js";
/**
 * About tab and configuration initialization for the chatbot application
 */

/**
 * Initialize About tab information and configuration display
 */
export function initializeAboutTab() {
  // Set up About tab information
  const appVersionElement = document.getElementById("app-version");
  if (appVersionElement) {
    appVersionElement.textContent = APP_VERSION || "0.0.0";
    if (state.verboseLogging) {
      console.info("App version set:", appVersionElement.textContent);
    }
  }

  const githubLinkElement = document.getElementById("github-link");
  if (githubLinkElement && GITHUB_URL) {
    githubLinkElement.href = GITHUB_URL;
    if (state.verboseLogging) {
      console.info("GitHub URL set:", githubLinkElement.href);
    }
  }
}
