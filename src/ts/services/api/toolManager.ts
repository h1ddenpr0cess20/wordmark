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

import { getMemoryConfig } from "../../utils/storage/memoryStorage.ts";
import { getActiveServiceKey, getActiveModel } from "./clientConfig.ts";
import { weatherToolHandler } from "../weather.ts";
import { memoryToolDefinition, forgetToolDefinition } from "../memory.ts";
import { getApiKey } from "../apiKeyStorage.ts";
import { isLocalService, usesServerManagedTools } from "../providers.ts";
import { MCP_ASSUME_ONLINE, config } from "../../../config/config.ts";
import { logVerbose } from "../../utils/logger.ts";
import { activateSkillToolDefinition, readSkillResourceToolDefinition, hasEnabledSkillResources } from "../skills/skills.ts";
import { getEnabledSkills } from "../skills/skillsStore.ts";
import { TOOL_CATALOG, TOOL_DEFINITIONS, cloneDefinition } from "./tools/catalog.ts";
import { OPENAI_IMAGE_FUNCTION_TOOLS } from "./staticTools.ts";
import { getToolPreference, isToolEnabled, setToolEnabled, setAllToolsEnabled } from "./tools/preferences.ts";
import {
  getCachedMcpStatus,
  isLocalNetworkUrl,
  refreshMcpAvailability,
  registerMcpServer,
  unregisterMcpServer,
} from "./tools/mcp.ts";
import type { ToolCatalogEntry, ToolDefinition, ToolEntry } from "../../../types/tools.ts";

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
 * Reports whether a single catalog tool is available for the given
 * provider/model, applying the compatibility gates (but not per-tool user
 * preferences): hidden flag, service allow-list, client-side support, MCP
 * local-network/online rules, required API keys, and the Codex
 * image-generation exclusion.
 *
 * @param tool - Catalog entry to evaluate.
 * @param serviceKey - Target service key.
 * @param modelName - Target model name.
 * @param clientSideToolsSupported - Whether the model accepts client-side tools.
 * @param modelIsCodex - Whether the model is a Codex variant.
 * @returns `true` when the tool may be offered for this provider/model.
 */
function isToolAvailableForProvider(
  tool: ToolEntry,
  serviceKey: string,
  modelName: string,
  clientSideToolsSupported: boolean,
  modelIsCodex: boolean,
): boolean {
  if (tool.hidden) {
    return false;
  }
  if (tool.onlyServices && !tool.onlyServices.includes(serviceKey)) {
    return false;
  }
  if (!clientSideToolsSupported && isClientSideToolType(tool.type)) {
    return false;
  }
  if (tool.type === "mcp") {
    if (!isLocalService(serviceKey)) {
      const serverUrl = tool.definition?.server_url;
      if (serverUrl && isLocalNetworkUrl(serverUrl)) {
        return false;
      }
    }
    const onlineState = (typeof window !== "undefined" && MCP_ASSUME_ONLINE === true)
      ? true
      : (getCachedMcpStatus(tool.key) ?? (typeof tool.isOnline === "boolean" ? tool.isOnline : false));
    if (!onlineState) {
      return false;
    }
  }
  if (tool.requiresApiKeyService) {
    const requiredKey = getApiKey(tool.requiresApiKeyService);
    if (!requiredKey || !requiredKey.trim()) {
      return false;
    }
  }
  if (tool.key === "builtin:image_generation") {
    if (serviceKey === "openai") {
      if (modelIsCodex) {
        return false;
      }
    } else {
      // Non-OpenAI services run the tool as client-side openai_generate_image /
      // openai_edit_image functions, which need OpenAI credentials.
      if (!clientSideToolsSupported) {
        return false;
      }
      const openAiKey = getApiKey("openai");
      if (!openAiKey || !openAiKey.trim()) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Returns the catalog keys of tools usable with the given provider/model,
 * applying the same provider/model gates as {@link getEnabledToolDefinitions}
 * but ignoring per-tool user preferences. Used by Party mode to offer each
 * character only the tools the active provider actually supports.
 *
 * @param serviceKey - Target service; defaults to the active service.
 * @param modelName - Target model; defaults to the active model.
 * @returns The catalog keys of the tools supported for that provider/model.
 */
export function getAvailableToolKeys(serviceKey: string = getActiveServiceKey(), modelName: string = getActiveModel()): string[] {
  if (config && config.enableFunctionCalling === false) {
    return [];
  }
  if (!isConfiguredServiceEnabled(serviceKey)) {
    return [];
  }
  const modelIsCodex = isCodexModel(modelName);
  const clientSideToolsSupported = supportsClientSideTools(serviceKey, modelName);
  return TOOL_CATALOG
    .filter(tool => isToolAvailableForProvider(tool, serviceKey, modelName, clientSideToolsSupported, modelIsCodex))
    .map(tool => tool.key);
}

/**
 * Builds the list of tool definitions to send to the model, resolving each
 * catalog entry to its provider-appropriate shape (server-managed vs.
 * client-side) and honoring the master function-calling toggle and per-tool
 * user preferences. Returns an empty list when function calling is disabled or
 * the service is not configured/enabled.
 *
 * @param serviceKey - Target service; defaults to the active service.
 * @param modelName - Target model; defaults to the active model.
 * @param allowedToolKeys - When provided, restricts output to these catalog
 *   keys and bypasses per-tool preference checks and memory-tool appending;
 *   when omitted, all preference-enabled available tools are included.
 * @returns The provider-ready tool definitions.
 */
export function getEnabledToolDefinitions(serviceKey: string = getActiveServiceKey(), modelName: string = getActiveModel(), allowedToolKeys?: string[]): ToolDefinition[] {
  const masterEnabled = !(config && config.enableFunctionCalling === false);
  if (!masterEnabled) {
    return [];
  }
  if (!isConfiguredServiceEnabled(serviceKey)) {
    return [];
  }

  const restrictKeys = Array.isArray(allowedToolKeys);
  const allowedKeySet = restrictKeys ? new Set(allowedToolKeys) : null;
  const modelIsCodex = isCodexModel(modelName);
  const clientSideToolsSupported = supportsClientSideTools(serviceKey, modelName);
  const defs: ToolDefinition[] = [];

  TOOL_CATALOG.forEach(tool => {
    if (allowedKeySet && !allowedKeySet.has(tool.key)) {
      return;
    }
    if (!isToolAvailableForProvider(tool, serviceKey, modelName, clientSideToolsSupported, modelIsCodex)) {
      return;
    }

    if (!restrictKeys && !getToolPreference(tool.key, tool.defaultEnabled !== false)) {
      return;
    }

    if (tool.key === "builtin:code_interpreter") {
      const shellEnabled = getToolPreference("builtin:shell", false);
      if (shellEnabled && serviceKey === "openai") {
        logVerbose("Skipping code_interpreter because shell tool is enabled.");
        return;
      }
      if (usesServerManagedTools(serviceKey)) {
        defs.push({
          type: "code_interpreter",
        });
      } else {
        defs.push(cloneDefinition(tool.definition));
      }
      return;
    }

    if (tool.key === "builtin:image_generation") {
      if (serviceKey === "openai") {
        defs.push(cloneDefinition(tool.definition));
      } else {
        OPENAI_IMAGE_FUNCTION_TOOLS.forEach(definition => {
          defs.push(cloneDefinition(definition));
        });
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

    defs.push(cloneDefinition(tool.definition));
  });

  if (!restrictKeys) {
    appendMemoryTools(defs, serviceKey, modelName);
    appendSkillTools(defs, serviceKey, modelName);
  }
  return defs;
}

/**
 * Appends the `activate_skill` tool definition when at least one skill is
 * enabled and the service/model supports client-side tool calls. Skipped when
 * client-side tools are unavailable — in that case the skills' instructions are
 * inlined into the developer message instead (see `getSkillsDescription`).
 *
 * @param defs - The tool-definition list to append to (mutated in place).
 * @param serviceKey - Target service; defaults to the active service.
 * @param modelName - Target model; defaults to the active model.
 */
function appendSkillTools(defs: ToolDefinition[], serviceKey: string = getActiveServiceKey(), modelName: string = getActiveModel()) {
  try {
    if (!supportsClientSideTools(serviceKey, modelName)) {
      return;
    }
    if (!getEnabledSkills().length) {
      return;
    }
    defs.push(cloneDefinition(activateSkillToolDefinition));
    if (hasEnabledSkillResources()) {
      defs.push(cloneDefinition(readSkillResourceToolDefinition));
    }
  } catch (error) {
    console.warn("Unable to append skill tools:", error);
  }
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
      logVerbose(`Skipping memory tools for xAI model '${modelName}' because it disallows client-side tools.`);
      return;
    }

    const hasServerManagedTool = defs.some((def: ToolDefinition) => {
      if (!def || typeof def !== "object") {
        return false;
      }
      return SERVER_MANAGED_TOOL_TYPES.has(def.type);
    });

    if (hasServerManagedTool && usesServerManagedTools(serviceKey)) {
      logVerbose(`Skipping memory tools because server-managed tools are active for service '${serviceKey}'.`);
      return;
    }
    if (memoryToolDefinition) {
      defs.push(cloneDefinition(memoryToolDefinition));
    }
    if (forgetToolDefinition) {
      defs.push(cloneDefinition(forgetToolDefinition));
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
