/**
 * About tab and configuration initialization for the chatbot application
 */

/**
 * Initialize About tab information and configuration display
 */
function initializeAboutTab() {
  // Set up About tab information
  const appVersionElement = document.getElementById("app-version");
  if (appVersionElement) {
    appVersionElement.textContent = window.APP_VERSION || "0.0.0";
    if (window.VERBOSE_LOGGING) {
      console.info("App version set:", appVersionElement.textContent);
    }
  }

  const githubLinkElement = document.getElementById("github-link");
  if (githubLinkElement && window.GITHUB_URL) {
    githubLinkElement.href = window.GITHUB_URL;
    if (window.VERBOSE_LOGGING) {
      console.info("GitHub URL set:", githubLinkElement.href);
    }
  }
}

// Make functions available globally
window.initializeAboutTab = initializeAboutTab;
