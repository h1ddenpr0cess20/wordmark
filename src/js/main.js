// ES module entrypoint to load the app in the correct order
// Note: Most modules attach to `window.*`; this keeps behavior while enabling ESM.

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
import './utils/toolLoader.js';
import './utils/lazyLoader.js';

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
import './services/api.js';
import './services/streaming.js';
import './services/history.js';
import './services/export.js';
import './services/weather.js';

// Initialization modules
import './init/globals.js';
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
