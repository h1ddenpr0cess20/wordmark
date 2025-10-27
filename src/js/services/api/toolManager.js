/**
 * Tool catalog, preference management, and MCP availability helpers.
 */

import { getActiveServiceKey } from './clientConfig.js';

const TOOL_STORAGE_KEY = 'wordmark_tool_preferences';

function loadUserMCPServers() {
  try {
    const stored = localStorage.getItem('mcp_servers');
    if (!stored) return [];
    const servers = JSON.parse(stored);
    return Array.isArray(servers) ? servers : [];
  } catch (error) {
    console.error('Error loading user MCP servers:', error);
    return [];
  }
}

function buildMcpToolEntry(server) {
  if (!server || !server.server_label || !server.server_url) {
    return null;
  }
  return {
    key: `mcp:${server.server_label}`,
    type: 'mcp',
    displayName: server.displayName || server.server_label,
    description: server.description || 'User-configured MCP server',
    defaultEnabled: true,
    isOnline: null,
    definition: {
      type: 'mcp',
      server_label: server.server_label,
      server_url: server.server_url,
      require_approval: server.require_approval || 'always',
    },
  };
}

function cloneDefinition(definition) {
  return JSON.parse(JSON.stringify(definition));
}

const STATIC_TOOLS = [
  {
    key: 'function:open_meteo_forecast',
    type: 'function',
    displayName: 'Weather (Open-Meteo)',
    description: 'Fetch 1-7 day forecasts using the Open-Meteo API.',
    defaultEnabled: true,
    definition: {
      type: 'function',
      name: 'open_meteo_forecast',
      description: 'Get a short weather forecast via Open-Meteo (1-7 days).',
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: 'City name, e.g. Detroit',
          },
          days: {
            type: 'integer',
            description: 'Number of days of forecast to get',
          },
        },
        required: ['city', 'days'],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    key: 'builtin:web_search',
    type: 'builtin',
    displayName: 'Web Search',
    description: 'Allow the assistant to use provider-managed web searches for fresh information on OpenAI or xAI.',
    defaultEnabled: false,
    onlyServices: ['openai', 'xai'],
    definition: {
      type: 'web_search',
    },
  },
  {
    key: 'builtin:code_interpreter',
    type: 'builtin',
    displayName: 'Code Interpreter',
    description: 'Allow the assistant to run Python code and work with files in the provider sandbox.',
    defaultEnabled: false,
    onlyServices: ['openai', 'xai'],
    definition: {
      type: 'code_interpreter',
      container: {
        type: 'auto',
        file_ids: [],
      },
    },
  },
  {
    key: 'builtin:image_generation',
    type: 'builtin',
    displayName: 'OpenAI Images',
    description: 'Generate or edit images using the OpenAI image tool.',
    defaultEnabled: true,
    onlyServices: ['openai'],
    definition: {
      type: 'image_generation',
    },
  },
  {
    key: 'builtin:file_search',
    type: 'builtin',
    displayName: 'File Search',
    description: 'Search through uploaded documents using vector stores.',
    defaultEnabled: false,
    onlyServices: ['openai'],
    definition: {
      type: 'file_search',
      vector_store_ids: [],
    },
  },
];

const TOOL_CATALOG = [];
const TOOL_DEFINITIONS = [];
let userMcpToolCount = 0;


const SERVER_MANAGED_TOOL_TYPES = new Set([
  'web_search',
  'x_search',
  'code_interpreter',
  'image_generation',
  'file_search',
]);

function insertMcpTool(toolEntry) {
  TOOL_CATALOG.splice(userMcpToolCount, 0, toolEntry);
  TOOL_DEFINITIONS.splice(userMcpToolCount, 0, cloneDefinition(toolEntry.definition));
  userMcpToolCount += 1;
}

function replaceToolAt(index, toolEntry) {
  TOOL_CATALOG[index] = toolEntry;
  TOOL_DEFINITIONS[index] = cloneDefinition(toolEntry.definition);
}

function addStaticTool(toolEntry) {
  TOOL_CATALOG.push(toolEntry);
  TOOL_DEFINITIONS.push(cloneDefinition(toolEntry.definition));
}

function removeToolAt(index) {
  TOOL_CATALOG.splice(index, 1);
  TOOL_DEFINITIONS.splice(index, 1);
}

const storedMcpServers = loadUserMCPServers();
storedMcpServers.forEach(server => {
  const entry = buildMcpToolEntry(server);
  if (entry) {
    insertMcpTool(entry);
  }
});

STATIC_TOOLS.forEach(tool => addStaticTool(tool));

const TOOL_HANDLERS = {
  open_meteo_forecast: function(...args) {
    if (window.weatherToolHandler) {
      return window.weatherToolHandler(...args);
    }
    return { error: 'Weather tool not loaded' };
  },
};

const MCP_PING_TIMEOUT_MS = 4000;
const MCP_REFRESH_INTERVAL_MS = 60000;
const mcpStatusCache = new Map();
let lastMcpRefresh = 0;
let mcpRefreshPromise = null;

let toolPreferences = loadToolPreferences();

export function getToolCatalog() {
  return TOOL_CATALOG.map(tool => ({
    key: tool.key,
    type: tool.type,
    displayName: tool.displayName,
    description: tool.description,
    onlyServices: tool.onlyServices ? [...tool.onlyServices] : undefined,
    defaultEnabled: tool.defaultEnabled !== false,
    isOnline: (() => {
      if (tool.type !== 'mcp') {
        return true;
      }
      if (typeof window !== 'undefined' && window.MCP_ASSUME_ONLINE === true) {
        return true;
      }
      const cached = getCachedMcpStatus(tool.key);
      if (typeof cached === 'boolean') {
        return cached;
      }
      return typeof tool.isOnline === 'boolean' ? tool.isOnline : null;
    })(),
    hidden: tool.hidden === true,
    serverUrl: tool.type === 'mcp' ? tool.definition?.server_url : undefined,
  }));
}

export function isToolEnabled(key) {
  const tool = TOOL_CATALOG.find(item => item.key === key);
  if (!tool) {
    return false;
  }
  return getToolPreference(key, tool.defaultEnabled !== false);
}

export function setToolEnabled(key, enabled) {
  const tool = TOOL_CATALOG.find(item => item.key === key);
  if (!tool) {
    return;
  }
  toolPreferences = {
    ...toolPreferences,
    [key]: Boolean(enabled),
  };
  saveToolPreferences(toolPreferences);
}

export function setAllToolsEnabled(enabled) {
  const updated = { ...toolPreferences };
  TOOL_CATALOG.forEach(tool => {
    updated[tool.key] = Boolean(enabled);
  });
  toolPreferences = updated;
  saveToolPreferences(toolPreferences);
}

export function registerMcpServer(serverConfig, options = {}) {
  const { silent = false } = options;
  const entry = buildMcpToolEntry(serverConfig);
  if (!entry) {
    return null;
  }

  const existingIndex = TOOL_CATALOG.findIndex(tool => tool.key === entry.key);
  if (existingIndex !== -1) {
    replaceToolAt(existingIndex, entry);
  } else {
    insertMcpTool(entry);
  }

  if (!silent) {
    mcpStatusCache.delete(entry.key);
  }
  return entry;
}

export function unregisterMcpServer(serverLabel, options = {}) {
  if (!serverLabel) {
    return false;
  }
  const { silent = false } = options;
  const key = `mcp:${serverLabel}`;
  const index = TOOL_CATALOG.findIndex(tool => tool.key === key);
  if (index === -1) {
    return false;
  }

  removeToolAt(index);
  if (index < userMcpToolCount) {
    userMcpToolCount = Math.max(0, userMcpToolCount - 1);
  }
  mcpStatusCache.delete(key);

  if (!silent && Object.prototype.hasOwnProperty.call(toolPreferences, key)) {
    delete toolPreferences[key];
    saveToolPreferences(toolPreferences);
  }
  return true;
}

export function getEnabledToolDefinitions(serviceKey = getActiveServiceKey()) {
  const masterEnabled = !(window.config && window.config.enableFunctionCalling === false);
  if (!masterEnabled) {
    return [];
  }

  const isLocalService = serviceKey === 'lmstudio' || serviceKey === 'ollama';
  const defs = [];

  TOOL_CATALOG.forEach(tool => {
    if (tool.onlyServices && !tool.onlyServices.includes(serviceKey)) {
      return;
    }
    if (tool.hidden) {
      return;
    }

    if (tool.type === 'mcp') {
      if (serviceKey === 'xai') {
        return;
      }
      if (!isLocalService) {
        const serverUrl = tool.definition?.server_url;
        if (serverUrl && isLocalNetworkUrl(serverUrl)) {
          if (window.VERBOSE_LOGGING) {
            console.info(`Skipping local MCP server ${tool.displayName} when using cloud service ${serviceKey}`);
          }
          return;
        }
      }
    }

    const onlineState = tool.type === 'mcp'
      ? ((typeof window !== 'undefined' && window.MCP_ASSUME_ONLINE === true)
          ? true
          : (getCachedMcpStatus(tool.key) ?? (typeof tool.isOnline === 'boolean' ? tool.isOnline : false)))
      : true;
    if (!onlineState) {
      return;
    }

    if (!getToolPreference(tool.key, tool.defaultEnabled !== false)) {
      return;
    }

    if (tool.key === 'builtin:web_search') {
      if (serviceKey === 'xai') {
        defs.push({
          type: 'web_search',
          enable_video_understanding: true,
          enable_image_understanding: true,
        });
        defs.push({
          type: 'x_search',
          enable_video_understanding: true,
          enable_image_understanding: true,
        });
      } else {
        defs.push({ type: 'web_search' });
      }
      return;
    }

    defs.push(JSON.parse(JSON.stringify(tool.definition)));
  });

  appendMemoryTools(defs, serviceKey);
  return defs;
}

export function refreshMcpAvailability(force = false) {
  const mcpTools = TOOL_CATALOG.filter(tool => tool.type === 'mcp');
  if (typeof window !== 'undefined' && window.MCP_ASSUME_ONLINE === true) {
    mcpTools.forEach(tool => setCachedMcpStatus(tool.key, true));
    lastMcpRefresh = Date.now();
    return Promise.resolve();
  }
  if (mcpTools.length === 0) {
    return Promise.resolve();
  }
  const now = Date.now();
  if (!force && mcpRefreshPromise) {
    return mcpRefreshPromise;
  }
  if (!force && now - lastMcpRefresh < MCP_REFRESH_INTERVAL_MS) {
    return Promise.resolve();
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    mcpTools.forEach(tool => setCachedMcpStatus(tool.key, false));
    lastMcpRefresh = Date.now();
    return Promise.resolve();
  }

  mcpRefreshPromise = (async () => {
    await Promise.all(mcpTools.map(async tool => {
      const enabled = getToolPreference(tool.key, tool.defaultEnabled !== false);
      if (!enabled) {
        return;
      }
      const online = await pingMcpServer(tool.definition.server_url);
      if (online !== null) {
        setCachedMcpStatus(tool.key, online);
      }
    }));
  })().catch(error => {
    console.warn('Error refreshing MCP availability:', error);
  }).finally(() => {
    lastMcpRefresh = Date.now();
    mcpRefreshPromise = null;
  });

  return mcpRefreshPromise;
}

export { TOOL_DEFINITIONS, TOOL_HANDLERS };

function loadToolPreferences() {
  try {
    const raw = localStorage.getItem(TOOL_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function saveToolPreferences(prefs) {
  try {
    localStorage.setItem(TOOL_STORAGE_KEY, JSON.stringify(prefs));
  } catch (_) {
    /* Ignore storage errors */
  }
}

function getToolPreference(key, defaultEnabled) {
  if (Object.prototype.hasOwnProperty.call(toolPreferences, key)) {
    return Boolean(toolPreferences[key]);
  }
  return defaultEnabled;
}

function isLocalNetworkUrl(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return true;
    }
    if (hostname.match(/^192\.168\.\d+\.\d+$/)) return true;
    if (hostname.match(/^10\.\d+\.\d+\.\d+$/)) return true;
    if (hostname.match(/^172\.(1[6-9]|2[0-9]|3[01])\.\d+\.\d+$/)) return true;
    if (hostname.endsWith('.local')) return true;
    return false;
  } catch (error) {
    return false;
  }
}

function appendMemoryTools(defs, serviceKey = getActiveServiceKey()) {
  try {
    const cfg = typeof window.getMemoryConfig === 'function'
      ? window.getMemoryConfig()
      : { enabled: false };
    if (!cfg || !cfg.enabled) {
      return;
    }

    const hasServerManagedTool = defs.some(def => {
      if (!def || typeof def !== 'object') {
        return false;
      }
      return SERVER_MANAGED_TOOL_TYPES.has(def.type);
    });

    if (hasServerManagedTool && serviceKey === 'xai') {
      if (window.VERBOSE_LOGGING) {
        console.info(`Skipping memory tools because server-managed tools are active for service '${serviceKey}'.`);
      }
      return;
    }
    if (window.memoryToolDefinition) {
      defs.push(JSON.parse(JSON.stringify(window.memoryToolDefinition)));
    }
    if (window.forgetToolDefinition) {
      defs.push(JSON.parse(JSON.stringify(window.forgetToolDefinition)));
    }
  } catch (error) {
    console.warn('Unable to append memory tools:', error);
  }
}

function getCachedMcpStatus(toolKey) {
  const entry = mcpStatusCache.get(toolKey);
  return entry ? entry.online : null;
}

function setCachedMcpStatus(toolKey, online) {
  mcpStatusCache.set(toolKey, { online, checkedAt: Date.now() });
  const tool = TOOL_CATALOG.find(item => item.key === toolKey);
  if (tool) {
    tool.isOnline = online;
  }
}

async function pingMcpServer(url) {
  const normalizedUrl = typeof url === 'string' ? url : '';
  if (!normalizedUrl) {
    return false;
  }
  if (typeof window !== 'undefined' && window.MCP_ASSUME_ONLINE === true) {
    return true;
  }
  if (!isHostAllowed(normalizedUrl)) {
    if (window.VERBOSE_LOGGING) {
      console.info(`Skipping MCP availability check for ${normalizedUrl} due to CSP restrictions.`);
    }
    return null;
  }
  const corsAttempt = await attemptMcpFetch(normalizedUrl, 'cors');
  if (corsAttempt.status === 'ok') {
    return true;
  }
  if (corsAttempt.status === 'bad-status') {
    return false;
  }
  if (corsAttempt.status === 'timeout') {
    return false;
  }

  const noCorsAttempt = await attemptMcpFetch(normalizedUrl, 'no-cors');
  if (noCorsAttempt.status === 'ok') {
    return true;
  }
  if (noCorsAttempt.status === 'bad-status') {
    return false;
  }
  if (noCorsAttempt.status === 'timeout') {
    return false;
  }
  if (noCorsAttempt.status === 'error') {
    if (window.VERBOSE_LOGGING) {
      console.warn(`MCP availability check failed (${normalizedUrl}) with network error:`, noCorsAttempt.error);
    }
    return false;
  }
  if (window.VERBOSE_LOGGING) {
    console.warn(`MCP availability check failed for ${normalizedUrl}.`);
  }
  return false;
}

async function attemptMcpFetch(url, mode) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MCP_PING_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      mode,
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response) {
      return { status: 'ok' };
    }
    if (response.type === 'opaque') {
      return { status: 'ok' };
    }
    if (response.status < 500) {
      return { status: 'ok' };
    }
    return { status: 'bad-status', code: response.status };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error && error.name === 'AbortError') {
      return { status: 'timeout' };
    }
    if (window.VERBOSE_LOGGING) {
      console.warn(`MCP availability check failed (${mode}) for ${url}:`, error);
    }
    return { status: 'error', error };
  }
}

function isHostAllowed(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    const host = parsed.hostname;
    if (!host) {
      return false;
    }
    if (host === window.location.hostname) {
      return true;
    }
    if (host === 'localhost' || host === '127.0.0.1') {
      return true;
    }
    if (host.endsWith('.localhost')) {
      return true;
    }
    return true;
  } catch (error) {
    console.warn('Failed to parse MCP URL:', url, error);
    return false;
  }
}
