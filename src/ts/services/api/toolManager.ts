/**
 * Tool manager facade.
 *
 * Holds the request-time concerns — building the enabled tool-definition list
 * for a given service/model and the UI-facing catalog view — and re-exports the
 * catalog/preferences/MCP sub-modules so existing importers keep a single entry
 * point. The mutable catalog store lives in `tools/catalog.ts`, enable/disable
 * preferences in `tools/preferences.ts`, and MCP registration/availability in
 * `tools/mcp.ts`.
 */

import { getMemoryConfig } from "../../utils/memoryStorage.ts";
import { getActiveServiceKey, getActiveModel } from "./clientConfig.ts";
import { weatherToolHandler } from "../weather.ts";
import { memoryToolDefinition, forgetToolDefinition } from "../memory.ts";
import { getApiKey } from "../apiKeyStorage.ts";
import { isLocalService, usesServerManagedTools } from "../providers.ts";
import { MCP_ASSUME_ONLINE, config } from "../../../config/config.ts";
import { state } from "../../init/state.ts";
import { TOOL_CATALOG, TOOL_DEFINITIONS } from "./tools/catalog.ts";
import { getToolPreference, isToolEnabled, setToolEnabled, setAllToolsEnabled } from "./tools/preferences.ts";
import {
  getCachedMcpStatus,
  isLocalNetworkUrl,
  refreshMcpAvailability,
  registerMcpServer,
  unregisterMcpServer,
} from "./tools/mcp.ts";
import type { ToolCatalogEntry, ToolDefinition } from "../../../types/tools.ts";

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

const TOOL_HANDLERS: Record<string, (...args: unknown[]) => unknown> = {
  open_meteo_forecast: function(...args: unknown[]) {
    if (weatherToolHandler) {
      return weatherToolHandler(...args);
    }
    return { error: "Weather tool not loaded" };
  },
};

/**
 * Reports whether a service is enabled per config — via `config.isServiceEnabled`
 * when available, else the service's `enabled` flag. Defaults to `true` when no
 * services are configured.
 */
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

/** Reports whether a model is an OpenAI Codex model (by name), which excludes some tools. */
function isCodexModel(modelName: string | undefined): boolean {
  return typeof modelName === "string" && modelName.toLowerCase().includes("codex");
}

/** Reports whether an xAI model (e.g. multi-agent variants) forbids client-side tools. */
export function xaiModelDisallowsClientSideTools(modelName = getActiveModel()) {
  return typeof modelName === "string"
    && modelName.toLowerCase().includes("multi-agent");
}

/**
 * Reports whether the given service/model pair can run client-side (locally
 * executed) tools. Server-managed providers only do so when the model allows it.
 */
export function supportsClientSideTools(
  serviceKey = getActiveServiceKey(),
  modelName = getActiveModel(),
) {
  if (!usesServerManagedTools(serviceKey)) {
    return true;
  }
  return !xaiModelDisallowsClientSideTools(modelName);
}

/** Reports whether a tool type is executed client-side rather than by the provider. */
export function isClientSideToolType(type: string): boolean {
  return CLIENT_SIDE_TOOL_TYPES.has(type);
}

/**
 * Returns a display-oriented snapshot of the tool catalog for the settings UI,
 * resolving per-tool API-key presence and MCP online status.
 */
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

/**
 * Builds the list of tool definitions to send with a request, applying every
 * gate: master switch, service enablement, service/model compatibility, MCP
 * online and local-network rules, per-tool preferences, required API keys, and
 * provider-specific exclusions (e.g. Codex image generation, shell vs. code
 * interpreter).
 *
 * @param serviceKey - Target service; defaults to the active service.
 * @param modelName - Target model; defaults to the active model.
 */
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

/**
 * Appends the memory/forget client-side tool definitions to `defs` when memory
 * is enabled. Skips them for models that disallow client-side tools, and when
 * server-managed tools are already active for the service (to avoid mixing).
 *
 * @param defs - The tool-definition list to append to (mutated in place).
 * @param serviceKey - Target service; defaults to the active service.
 * @param modelName - Target model; defaults to the active model.
 */
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

export {
  TOOL_DEFINITIONS,
  TOOL_HANDLERS,
  isToolEnabled,
  setToolEnabled,
  setAllToolsEnabled,
  registerMcpServer,
  unregisterMcpServer,
  refreshMcpAvailability,
};
