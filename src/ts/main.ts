/**
 * Application entry point.
 *
 * @remarks
 * Imports the app's modules for their side effects in dependency order, then
 * loads the HTML panels and runs initialization once they are in the DOM.
 *
 * Ordering matters in two places: `config.ts` is imported first so its
 * console-logging setup runs before any other module evaluates, and the shared
 * state/DOM references load before the components and services that read them.
 * Vendor libraries (dompurify, marked, highlight.js) are imported directly by
 * the modules that use them rather than attached to `window`.
 */

import "../config/config.ts";

import "./init/state.ts";

import "./utils/utils.ts";
import "./utils/highlight.ts";
import "./utils/imageStorage.ts";
import "./utils/conversationStorage.ts";
import "./utils/mobileHandling.ts";
import "./utils/notifications.ts";
import { initializeMenus } from "./utils/menuSystem.ts";

import "./components/messages.ts";
import "./components/settings.ts";
import "./components/ui.ts";
import "./components/theme.ts";
import "./components/interaction.ts";
import "./components/attachments.ts";
import "./components/tools.ts";
import "./components/memory.ts";
import "./components/logo.ts";
import "./components/aboutPopups.ts";

import "./services/memory.ts";
import "./services/apiKeys.ts";
import "./services/mediaTools.ts";
import "./services/history.ts";

import "./init/dom.ts";
import "./init/modelSettings.ts";
import "./init/marked.ts";
import "./init/ttsInitialization.ts";
import "./init/aboutTab.ts";
import "./init/services.ts";
import "./init/eventListeners.ts";
import { initialize } from "./init/initialization.ts";

initializeMenus().then((ready) => {
  if (ready) {
    initialize();
  }
});
