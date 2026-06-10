// ES module entrypoint to load the app in the correct order.
// Vendor libraries (dompurify, marked, highlight.js) are imported directly by
// the modules that use them — no window globals.

// Configuration. Imported first so its console-logging setup runs before the
// rest of the app evaluates. Other modules import { config, ... } directly.
import "../config/config.ts";

// Shared application state and DOM element references.
import "./init/state.ts";

// Utilities
import "./utils/utils.ts";
import "./utils/highlight.ts";
import "./utils/imageStorage.ts";
import "./utils/conversationStorage.ts";
import "./utils/mobileHandling.ts";
import "./utils/notifications.ts";
import { initializeMenus } from "./utils/menuSystem.ts";

// Components
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

/* Services */
import "./services/memory.ts";
import "./services/apiKeys.ts";
import "./services/mediaTools.ts";
import "./services/history.ts";

// Initialization modules
import "./init/dom.ts";
import "./init/modelSettings.ts";
import "./init/marked.ts";
import "./init/ttsInitialization.ts";
import "./init/aboutTab.ts";
import "./init/services.ts";
import "./init/eventListeners.ts";
import { initialize } from "./init/initialization.ts";

// App startup: load the HTML panels, then initialize the app once they're in
// the DOM.
initializeMenus().then((ready) => {
  if (ready) {
    initialize();
  }
});
