// ES module entrypoint to load the app in the correct order
// Note: Most modules attach to `window.*`; this keeps behavior while enabling ESM.

// Vendor libraries (bundled by Vite). Attach to window so the not-yet-converted
// modules that reference bare `DOMPurify`/`marked` globals keep working.
import DOMPurify from 'dompurify';
import { marked } from 'marked';
window.DOMPurify = DOMPurify;
window.marked = marked;

// Configuration (classic global side-effects: window.config, window.APP_VERSION, ...)
import '../config/config.js';

// Shared state + window-compat bridge. Imported early so the accessors are
// installed before any module sets state at import time.
import './init/state.js';
import './init/globals.js';

// Utilities
import './utils/icons.js';
import './utils/utils.js';
import './utils/highlight.js';
import './utils/imageStorage.js';
import './utils/conversationStorage.js';
import './utils/memoryStorage.js';
import './utils/mobileHandling.js';
import './utils/notifications.js';
import './utils/menuSystem.js';

// Components
import './components/messages.js';
import './components/settings.js';
import './components/ui.js';
import './components/theme.js';
import './components/interaction.js';
import './components/attachments.js';
import './components/tools.js';
import './components/memory.js';
import './components/logo.js';
import './components/aboutPopups.js';

/* Services */
import './services/memory.js';
import './services/mcpServers.js';
import './services/apiKeys.js';
import './services/mediaTools.js';
import './services/api.js';
import './services/streaming.js';
import './services/history.js';
import './services/export.js';
import './services/weather.js';

// Initialization modules
import './init/dom.js';
import './init/modelSettings.js';
import './init/marked.js';
import './init/ttsInitialization.js';
import './init/aboutTab.js';
import './init/services.js';
import './init/eventListeners.js';
import './init/initialization.js';

// Note: App startup is triggered by menuSystem.js after panels load.
// It calls window.initialize() once HTML fragments are inserted.
