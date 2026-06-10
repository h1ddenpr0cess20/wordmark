import { getMemoryConfig } from "../../utils/memoryStorage.ts";
/**
 * Tool catalog, preference management, and MCP availability helpers.
 */

import { getActiveServiceKey, getActiveModel } from "./clientConfig.ts";
import { weatherToolHandler } from "../weather.ts";
import { memoryToolDefinition, forgetToolDefinition } from "../memory.ts";
import { getApiKey } from "../apiKeyStorage.ts";
import { isLocalService, usesServerManagedTools } from "../providers.ts";
import { MCP_ASSUME_ONLINE, config } from "../../../config/config.ts";
import { state } from "../../init/state.ts";
import { STORAGE_KEYS, readJSON, writeJSON } from "../../utils/storage.ts";
import type {
  McpServerConfig,
  ToolCatalogEntry,
  ToolDefinition,
  ToolEntry,
} from "../../../types/tools.ts";

interface McpFetchResult {
  status: "ok" | "bad-status" | "timeout" | "error";
  code?: number;
  error?: unknown;
}

const TOOL_STORAGE_KEY = STORAGE_KEYS.toolPreferences;

function loadUserMCPServers(): McpServerConfig[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.mcpServers);
    if (!stored) return [];
    const servers = JSON.parse(stored);
    return Array.isArray(servers) ? servers : [];
  } catch (error) {
    console.error("Error loading user MCP servers:", error);
    return [];
  }
}

function buildMcpToolEntry(server: McpServerConfig): ToolEntry | null {
  if (!server || !server.server_label || !server.server_url) {
    return null;
  }
  return {
    key: `mcp:${server.server_label}`,
    type: "mcp",
    displayName: server.displayName || server.server_label,
    description: server.description || "User-configured MCP server",
    defaultEnabled: true,
    isOnline: null,
    definition: {
      type: "mcp",
      server_label: server.server_label,
      server_url: server.server_url,
      require_approval: server.require_approval || "always",
    },
  };
}

function cloneDefinition(definition: ToolDefinition): ToolDefinition {
  return JSON.parse(JSON.stringify(definition));
}

function isConfiguredServiceEnabled(serviceKey: string): boolean {
  const services = config?.services;
  if (!services) {
    return true;
  }
  if (typeof config?.isServiceEnabled === "function") {
    return config.isServiceEnabled(serviceKey);
  }
  const service = services[serviceKey];
  return Boolean(service && service.enabled !== false);
}

const STATIC_TOOLS: ToolEntry[] = [
  {
    key: "function:open_meteo_forecast",
    type: "function",
    displayName: "Weather (Open-Meteo)",
    description: "Fetch 1-7 day forecasts using the Open-Meteo API.",
    defaultEnabled: true,
    definition: {
      type: "function",
      name: "open_meteo_forecast",
      description: "Get a short weather forecast via Open-Meteo (1-7 days).",
      parameters: {
        type: "object",
        properties: {
          city: {
            type: "string",
            description: "City name, e.g. Detroit",
          },
          days: {
            type: "integer",
            description: "Number of days of forecast to get",
          },
        },
        required: ["city", "days"],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    key: "builtin:web_search",
    type: "builtin",
    displayName: "Web Search",
    description: "Allow the assistant to use provider-managed web searches for fresh information on OpenAI or xAI.",
    defaultEnabled: true,
    onlyServices: ["openai", "xai"],
    definition: {
      type: "web_search",
    },
  },
  {
    key: "builtin:code_interpreter",
    type: "builtin",
    displayName: "Code Interpreter",
    description: "Allow the assistant to run Python code and work with files in the provider sandbox.",
    defaultEnabled: false,
    onlyServices: ["openai", "xai"],
    definition: {
      type: "code_interpreter",
      container: {
        type: "auto",
        file_ids: [],
      },
    },
  },
  {
    key: "builtin:image_generation",
    type: "builtin",
    displayName: "OpenAI Images",
    description: "Generate or edit images using the OpenAI image tool.",
    defaultEnabled: true,
    onlyServices: ["openai"],
    definition: {
      type: "image_generation",
    },
  },
  {
    key: "builtin:shell",
    type: "builtin",
    displayName: "Shell",
    description: "Allow the assistant to run shell commands in a sandboxed container environment.",
    defaultEnabled: false,
    onlyServices: ["openai"],
    definition: {
      type: "shell",
      environment: {
        type: "container_auto",
      },
    },
  },
  {
    key: "builtin:file_search",
    type: "builtin",
    displayName: "File Search",
    description: "Search through uploaded documents using vector stores.",
    defaultEnabled: false,
    onlyServices: ["openai"],
    definition: {
      type: "file_search",
      vector_store_ids: [],
    },
  },
  {
    key: "function:grok_generate_image",
    type: "function",
    displayName: "Grok Imagine Image",
    description: "Generate an image with xAI Grok Imagine. Requires an xAI API key.",
    defaultEnabled: true,
    definition: {
      type: "function",
      name: "grok_generate_image",
      description: "Generate an image with xAI Grok Imagine.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "A detailed description of the image to generate.",
          },
          aspect_ratio: {
            type: "string",
            description: "Requested image aspect ratio.",
            enum: [
              "1:1", "16:9", "9:16", "4:3", "3:4",
              "3:2", "2:3", "2:1", "1:2",
              "19.5:9", "9:19.5", "20:9", "9:20", "auto",
            ],
          },
          resolution: {
            type: "string",
            description: "Output resolution.",
            enum: ["1k", "2k"],
          },
          n: {
            type: "integer",
            description: "Number of images to generate.",
            minimum: 1,
            maximum: 10,
          },
        },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
    requiresApiKeyService: "xai",
  },
  {
    key: "function:grok_edit_image",
    type: "function",
    displayName: "Grok Imagine Edit",
    description: "Edit one or more images with xAI Grok Imagine. If no image URL is provided, the most recent uploaded or generated image is used.",
    defaultEnabled: true,
    definition: {
      type: "function",
      name: "grok_edit_image",
      description: "Edit one or more images with xAI Grok Imagine.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "A detailed description of the requested image edit.",
          },
          image_url: {
            type: "string",
            description: "Optional data URI or public URL for a single source image.",
          },
          image_urls: {
            type: "array",
            description: "Optional list of source image URLs or data URIs.",
            items: {
              type: "string",
            },
            minItems: 1,
            maxItems: 3,
          },
          aspect_ratio: {
            type: "string",
            description: "Requested image aspect ratio.",
            enum: [
              "1:1", "16:9", "9:16", "4:3", "3:4",
              "3:2", "2:3", "2:1", "1:2",
              "19.5:9", "9:19.5", "20:9", "9:20", "auto",
            ],
          },
          resolution: {
            type: "string",
            description: "Output resolution.",
            enum: ["1k", "2k"],
          },
          n: {
            type: "integer",
            description: "Number of edited images to return.",
            minimum: 1,
            maximum: 10,
          },
        },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
    requiresApiKeyService: "xai",
  },
];

const TOOL_CATALOG: ToolEntry[] = [];
const TOOL_DEFINITIONS: ToolDefinition[] = [];
let userMcpToolCount = 0;

const SERVER_MANAGED_TOOL_TYPES = new Set([
  "web_search",
  "x_search",
  "code_interpreter",
  "shell",
  "image_generation",
  "file_search",
]);

const CLIENT_SIDE_TOOL_TYPES = new Set([
  "function",
  "mcp",
]);

function insertMcpTool(toolEntry: ToolEntry) {
  TOOL_CATALOG.splice(userMcpToolCount, 0, toolEntry);
  TOOL_DEFINITIONS.splice(userMcpToolCount, 0, cloneDefinition(toolEntry.definition));
  userMcpToolCount += 1;
}

function replaceToolAt(index: number, toolEntry: ToolEntry) {
  TOOL_CATALOG[index] = toolEntry;
  TOOL_DEFINITIONS[index] = cloneDefinition(toolEntry.definition);
}

function addStaticTool(toolEntry: ToolEntry) {
  TOOL_CATALOG.push(toolEntry);
  TOOL_DEFINITIONS.push(cloneDefinition(toolEntry.definition));
}

function removeToolAt(index: number) {
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

const TOOL_HANDLERS: Record<string, (...args: unknown[]) => unknown> = {
  open_meteo_forecast: function(...args: unknown[]) {
    if (weatherToolHandler) {
      return weatherToolHandler(...args);
    }
    return { error: "Weather tool not loaded" };
  },
};

const MCP_PING_TIMEOUT_MS = 4000;
const MCP_REFRESH_INTERVAL_MS = 60000;
const mcpStatusCache = new Map<string, { online: boolean | null; checkedAt: number }>();
let lastMcpRefresh = 0;
let mcpRefreshPromise: Promise<void> | null = null;

let toolPreferences = loadToolPreferences();

function isCodexModel(modelName: string | undefined): boolean {
  return typeof modelName === "string" && modelName.toLowerCase().includes("codex");
}

export function xaiModelDisallowsClientSideTools(modelName = getActiveModel()) {
  return typeof modelName === "string"
    && modelName.toLowerCase().includes("multi-agent");
}

export function supportsClientSideTools(
  serviceKey = getActiveServiceKey(),
  modelName = getActiveModel(),
) {
  if (!usesServerManagedTools(serviceKey)) {
    return true;
  }
  return !xaiModelDisallowsClientSideTools(modelName);
}

export function isClientSideToolType(type: string): boolean {
  return CLIENT_SIDE_TOOL_TYPES.has(type);
}

export function getToolCatalog(): ToolCatalogEntry[] {
  return TOOL_CATALOG.map(tool => ({
    key: tool.key,
    type: tool.type,
    displayName: tool.displayName,
    description: tool.description,
    onlyServices: tool.onlyServices ? [...tool.onlyServices] : undefined,
    defaultEnabled: tool.defaultEnabled !== false,
    requiresApiKeyService: tool.requiresApiKeyService,
    hasRequiredApiKey: (() => {
      if (!tool.requiresApiKeyService || typeof getApiKey !== "function") {
        return true;
      }
      return Boolean((getApiKey(tool.requiresApiKeyService) || "").trim());
    })(),
    isOnline: (() => {
      if (tool.type !== "mcp") {
        return true;
      }
      if (typeof window !== "undefined" && MCP_ASSUME_ONLINE === true) {
        return true;
      }
      const cached = getCachedMcpStatus(tool.key);
      if (typeof cached === "boolean") {
        return cached;
      }
      return typeof tool.isOnline === "boolean" ? tool.isOnline : null;
    })(),
    hidden: tool.hidden === true,
    serverUrl: tool.type === "mcp" ? tool.definition?.server_url : undefined,
  }));
}

export function isToolEnabled(key: string): boolean {
  const tool = TOOL_CATALOG.find(item => item.key === key);
  if (!tool) {
    return false;
  }
  return getToolPreference(key, tool.defaultEnabled !== false);
}

export function setToolEnabled(key: string, enabled: boolean) {
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

export function setAllToolsEnabled(enabled: boolean) {
  const updated = { ...toolPreferences };
  TOOL_CATALOG.forEach(tool => {
    updated[tool.key] = Boolean(enabled);
  });
  toolPreferences = updated;
  saveToolPreferences(toolPreferences);
}

export function registerMcpServer(serverConfig: McpServerConfig, options: { silent?: boolean } = {}): ToolEntry | null {
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

export function unregisterMcpServer(serverLabel: string, options: { silent?: boolean } = {}): boolean {
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

export function getEnabledToolDefinitions(serviceKey: string = getActiveServiceKey(), modelName: string = getActiveModel()): ToolDefinition[] {
  const masterEnabled = !(config && config.enableFunctionCalling === false);
  if (!masterEnabled) {
    return [];
  }
  if (!isConfiguredServiceEnabled(serviceKey)) {
    return [];
  }

  const modelIsCodex = isCodexModel(modelName);
  const clientSideToolsSupported = supportsClientSideTools(serviceKey, modelName);
  const defs: ToolDefinition[] = [];

  TOOL_CATALOG.forEach(tool => {
    if (tool.onlyServices && !tool.onlyServices.includes(serviceKey)) {
      return;
    }
    if (tool.hidden) {
      return;
    }

    if (!clientSideToolsSupported && isClientSideToolType(tool.type)) {
      if (state.verboseLogging) {
        console.info(`Skipping client-side tool '${tool.displayName}' for xAI model '${modelName}'.`);
      }
      return;
    }

    if (tool.type === "mcp") {
      if (!isLocalService(serviceKey)) {
        const serverUrl = tool.definition?.server_url;
        if (serverUrl && isLocalNetworkUrl(serverUrl)) {
          if (state.verboseLogging) {
            console.info(`Skipping local MCP server ${tool.displayName} when using cloud service ${serviceKey}`);
          }
          return;
        }
      }
    }

    const onlineState = tool.type === "mcp"
      ? ((typeof window !== "undefined" && MCP_ASSUME_ONLINE === true)
        ? true
        : (getCachedMcpStatus(tool.key) ?? (typeof tool.isOnline === "boolean" ? tool.isOnline : false)))
      : true;
    if (!onlineState) {
      return;
    }

    if (!getToolPreference(tool.key, tool.defaultEnabled !== false)) {
      return;
    }

    if (tool.requiresApiKeyService) {
      const requiredKey = getApiKey(tool.requiresApiKeyService);
      if (!requiredKey || !requiredKey.trim()) {
        return;
      }
    }

    if (tool.key === "builtin:image_generation" && serviceKey === "openai" && modelIsCodex) {
      if (state.verboseLogging) {
        console.info(`Skipping image generation tool for Codex model '${modelName}'.`);
      }
      return;
    }

    // Shell and code_interpreter cannot be used together; shell wins if both enabled
    if (tool.key === "builtin:code_interpreter") {
      const shellEnabled = getToolPreference("builtin:shell", false);
      if (shellEnabled && serviceKey === "openai") {
        if (state.verboseLogging) {
          console.info("Skipping code_interpreter because shell tool is enabled.");
        }
        return;
      }
      if (usesServerManagedTools(serviceKey)) {
        defs.push({
          type: "code_interpreter",
        });
      } else {
        defs.push(JSON.parse(JSON.stringify(tool.definition)));
      }
      return;
    }

    if (tool.key === "builtin:web_search") {
      if (usesServerManagedTools(serviceKey)) {
        defs.push({
          type: "web_search",
          enable_video_understanding: true,
          enable_image_understanding: true,
        });
        defs.push({
          type: "x_search",
          enable_video_understanding: true,
          enable_image_understanding: true,
        });
      } else {
        defs.push({ type: "web_search" });
      }
      return;
    }

    defs.push(JSON.parse(JSON.stringify(tool.definition)));
  });

  appendMemoryTools(defs, serviceKey, modelName);
  return defs;
}

export function refreshMcpAvailability(force = false): Promise<void> {
  const mcpTools = TOOL_CATALOG.filter(tool => tool.type === "mcp");
  if (typeof window !== "undefined" && MCP_ASSUME_ONLINE === true) {
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

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
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
    console.warn("Error refreshing MCP availability:", error);
  }).finally(() => {
    lastMcpRefresh = Date.now();
    mcpRefreshPromise = null;
  });

  return mcpRefreshPromise;
}

export { TOOL_DEFINITIONS, TOOL_HANDLERS };

function loadToolPreferences(): Record<string, boolean> {
  const parsed = readJSON<Record<string, boolean>>(TOOL_STORAGE_KEY, {});
  return parsed && typeof parsed === "object" ? parsed : {};
}

function saveToolPreferences(prefs: Record<string, boolean>) {
  try {
    writeJSON(TOOL_STORAGE_KEY, prefs);
  } catch {
    /* Ignore storage errors */
  }
}

function getToolPreference(key: string, defaultEnabled: boolean): boolean {
  if (Object.prototype.hasOwnProperty.call(toolPreferences, key)) {
    return Boolean(toolPreferences[key]);
  }
  return defaultEnabled;
}

function isLocalNetworkUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return true;
    }
    if (hostname.match(/^192\.168\.\d+\.\d+$/)) return true;
    if (hostname.match(/^10\.\d+\.\d+\.\d+$/)) return true;
    if (hostname.match(/^172\.(1[6-9]|2[0-9]|3[01])\.\d+\.\d+$/)) return true;
    if (hostname.endsWith(".local")) return true;
    return false;
  } catch {
    return false;
  }
}

function appendMemoryTools(defs: ToolDefinition[], serviceKey: string = getActiveServiceKey(), modelName: string = getActiveModel()) {
  try {
    const cfg = getMemoryConfig();
    if (!cfg || !cfg.enabled) {
      return;
    }

    if (!supportsClientSideTools(serviceKey, modelName)) {
      if (state.verboseLogging) {
        console.info(`Skipping memory tools for xAI model '${modelName}' because it disallows client-side tools.`);
      }
      return;
    }

    const hasServerManagedTool = defs.some((def: ToolDefinition) => {
      if (!def || typeof def !== "object") {
        return false;
      }
      return SERVER_MANAGED_TOOL_TYPES.has(def.type);
    });

    if (hasServerManagedTool && usesServerManagedTools(serviceKey)) {
      if (state.verboseLogging) {
        console.info(`Skipping memory tools because server-managed tools are active for service '${serviceKey}'.`);
      }
      return;
    }
    if (memoryToolDefinition) {
      defs.push(JSON.parse(JSON.stringify(memoryToolDefinition)));
    }
    if (forgetToolDefinition) {
      defs.push(JSON.parse(JSON.stringify(forgetToolDefinition)));
    }
  } catch (error) {
    console.warn("Unable to append memory tools:", error);
  }
}

function getCachedMcpStatus(toolKey: string): boolean | null {
  const entry = mcpStatusCache.get(toolKey);
  return entry ? entry.online : null;
}

function setCachedMcpStatus(toolKey: string, online: boolean | null) {
  mcpStatusCache.set(toolKey, { online, checkedAt: Date.now() });
  const tool = TOOL_CATALOG.find(item => item.key === toolKey);
  if (tool) {
    tool.isOnline = online;
  }
}

async function pingMcpServer(url: string | undefined): Promise<boolean | null> {
  const normalizedUrl = typeof url === "string" ? url : "";
  if (!normalizedUrl) {
    return false;
  }
  if (typeof window !== "undefined" && MCP_ASSUME_ONLINE === true) {
    return true;
  }
  if (!isHostAllowed(normalizedUrl)) {
    if (state.verboseLogging) {
      console.info(`Skipping MCP availability check for ${normalizedUrl} due to CSP restrictions.`);
    }
    return null;
  }
  const corsAttempt = await attemptMcpFetch(normalizedUrl, "cors");
  if (corsAttempt.status === "ok") {
    return true;
  }
  if (corsAttempt.status === "bad-status") {
    return false;
  }
  if (corsAttempt.status === "timeout") {
    return false;
  }

  const noCorsAttempt = await attemptMcpFetch(normalizedUrl, "no-cors");
  if (noCorsAttempt.status === "ok") {
    return true;
  }
  if (noCorsAttempt.status === "bad-status") {
    return false;
  }
  if (noCorsAttempt.status === "timeout") {
    return false;
  }
  if (noCorsAttempt.status === "error") {
    if (state.verboseLogging) {
      console.warn(`MCP availability check failed (${normalizedUrl}) with network error:`, noCorsAttempt.error);
    }
    return false;
  }
  if (state.verboseLogging) {
    console.warn(`MCP availability check failed for ${normalizedUrl}.`);
  }
  return false;
}

async function attemptMcpFetch(url: string, mode: RequestMode): Promise<McpFetchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MCP_PING_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      mode,
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response) {
      return { status: "ok" };
    }
    if (response.type === "opaque") {
      return { status: "ok" };
    }
    if (response.status < 500) {
      return { status: "ok" };
    }
    return { status: "bad-status", code: response.status };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      return { status: "timeout" };
    }
    if (state.verboseLogging) {
      console.warn(`MCP availability check failed (${mode}) for ${url}:`, error);
    }
    return { status: "error", error };
  }
}

function isHostAllowed(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    const host = parsed.hostname;
    if (!host) {
      return false;
    }
    if (host === window.location.hostname) {
      return true;
    }
    if (host === "localhost" || host === "127.0.0.1") {
      return true;
    }
    if (host.endsWith(".localhost")) {
      return true;
    }
    return true;
  } catch (error) {
    console.warn("Failed to parse MCP URL:", url, error);
    return false;
  }
}
