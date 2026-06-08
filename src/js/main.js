// ES module entrypoint to load the app in the correct order.
// Vendor libraries (dompurify, marked, highlight.js) are imported directly by
// the modules that use them — no window globals.

// Configuration. Imported first so its console-logging setup runs before the
// rest of the app evaluates. Other modules import { config, ... } directly.
import "../config/config.js";

// Shared application state and DOM element references.
import "./init/state.js";

// Utilities
import "./utils/utils.js";
import "./utils/highlight.js";
import "./utils/imageStorage.js";
import "./utils/conversationStorage.js";
import "./utils/mobileHandling.js";
import "./utils/notifications.js";
import { initializeMenus } from "./utils/menuSystem.js";

// Components
import "./components/messages.js";
import "./components/settings.js";
import "./components/ui.js";
import "./components/theme.js";
import "./components/interaction.js";
import "./components/attachments.js";
import "./components/tools.js";
import "./components/memory.js";
import "./components/logo.js";
import "./components/aboutPopups.js";

/* Services */
import "./services/memory.js";
import "./services/apiKeys.js";
import "./services/mediaTools.js";
import "./services/history.js";

// Initialization modules
import "./init/dom.js";
import "./init/modelSettings.js";
import "./init/marked.js";
import "./init/ttsInitialization.js";
import "./init/aboutTab.js";
import "./init/services.js";
import "./init/eventListeners.js";
import { initialize } from "./init/initialization.js";

// App startup: load the HTML panels, then initialize the app once they're in
// the DOM.
initializeMenus().then((ready) => {
  if (ready) {
    initialize();
  }
});
