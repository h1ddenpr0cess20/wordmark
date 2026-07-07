/**
 * Tool settings management for Responses API integrations.
 *
 * @remarks
 * Renders the tool list, persists toggle state, and synchronises with the
 * Responses client so only enabled tools are sent with each request. The public
 * API is assigned by the IIFE below and re-exported; the IIFE form preserves the
 * module's private state and closure without re-indenting.
 */

import { elements } from "../init/state.ts";
import { showInfo } from "../utils/notifications.ts";
import { getMemoryConfig } from "../utils/storage/memoryStorage.ts";
import { updateFeatureStatus } from "./settings.ts";
import { requestMcpServerRemoval } from "../services/mcpServers.ts";
import { responsesClient } from "../services/api.ts";
import { config } from "../../config/config.ts";
import type { ToolCatalogEntry } from "../../types/tools.ts";
import { isLocalService } from "../services/providers.ts";
import { isLocalNetworkUrl } from "../services/api/tools/mcpProbe.ts";
import { getApiKey } from "../services/apiKeyStorage.ts";

let initToolsSettings: () => void;
let updateMasterToolCallingStatus: (enabled: boolean) => void;
let refreshToolSettingsUI: () => void;
let updateToolDefinitions: () => void;
let getToolsDescription: () => string;

(function() {
  let toolsContainer: HTMLElement | null = null;
  let enableAllButton: HTMLElement | null = null;
  let disableAllButton: HTMLElement | null = null;
  let bulkActionsBound = false;

  function ensureClient() {
    if (!responsesClient) {
      console.warn("Responses client unavailable; tool settings cannot be initialised yet.");
      return false;
    }
    return true;
  }

  function getActiveServiceKey() {
    if (!ensureClient()) {
      return "openai";
    }
    return responsesClient.getActiveServiceKey();
  }

  function isMasterEnabled() {
    return !(config && config.enableFunctionCalling === false);
  }

  function getActiveModelName(): string {
    if (elements.modelSelector && elements.modelSelector.value) {
      return elements.modelSelector.value;
    }
    if (config && typeof config.getDefaultModel === "function") {
      try {
        return config.getDefaultModel();
      } catch {
        /* ignore */
      }
    }
    const activeKey = config && config.defaultService;
    if (activeKey && config?.services?.[activeKey]?.defaultModel) {
      return config.services[activeKey].defaultModel;
    }
    return "";
  }

  function isCodexModel(modelName: string): boolean {
    return typeof modelName === "string" && modelName.toLowerCase().includes("codex");
  }

  function supportsClientSideToolsForCurrentModel(serviceKey: string, modelName: string): boolean {
    if (!responsesClient || typeof responsesClient.supportsClientSideTools !== "function") {
      return true;
    }
    return responsesClient.supportsClientSideTools(serviceKey, modelName);
  }

  function isClientSideTool(tool: ToolCatalogEntry): boolean {
    if (!tool) {
      return false;
    }
    if (responsesClient && typeof responsesClient.isClientSideToolType === "function") {
      return responsesClient.isClientSideToolType(tool.type);
    }
    return tool.type === "function" || tool.type === "mcp";
  }

  /**
   * Returns the reason the OpenAI Images tool is unavailable for the current
   * service/model, or `null` when it is usable. On OpenAI only Codex models
   * exclude it; elsewhere it runs as client-side function tools, which need
   * client-side tool support and an OpenAI API key.
   */
  function openAiImageUnavailableReason(serviceKey: string, codexModelActive: boolean, clientSideToolsSupported: boolean): string | null {
    if (serviceKey === "openai") {
      return codexModelActive ? "Image generation is unavailable for Codex models." : null;
    }
    if (!clientSideToolsSupported) {
      return "This xAI multi-agent model does not support client-side tools.";
    }
    if (!(getApiKey("openai") || "").trim()) {
      return "Add your OpenAI API key in Settings → API Keys to use OpenAI Images with this service.";
    }
    return null;
  }

  function createBadge(tool: ToolCatalogEntry): HTMLSpanElement {
    const badge = document.createElement("span");
    badge.className = `tool-badge tool-badge-${tool.type}`;
    switch (tool.type) {
    case "mcp":
      badge.textContent = "MCP";
      break;
    case "function":
      badge.textContent = "Function";
      break;
    default:
      badge.textContent = "Builtin";
    }
    return badge;
  }

  function availabilityNote(tool: ToolCatalogEntry, isAvailable: boolean, isOnline: boolean | null, masterEnabled: boolean, serviceKey: string, codexModelActive: boolean, clientSideToolsSupported: boolean): HTMLDivElement | null {
    if (tool.requiresApiKeyService && tool.hasRequiredApiKey === false) {
      const note = document.createElement("div");
      note.className = "tool-note";
      note.textContent = `Add your ${tool.requiresApiKeyService === "xai" ? "xAI" : "OpenAI"} API key in Settings → API Keys to enable this tool.`;
      return note;
    }

    if (!isAvailable) {
      const note = document.createElement("div");
      note.className = "tool-note";
      if (tool.key === "builtin:image_generation") {
        const reason = openAiImageUnavailableReason(serviceKey, codexModelActive, clientSideToolsSupported);
        if (reason) {
          note.textContent = reason;
          return note;
        }
      }
      if (!clientSideToolsSupported && isClientSideTool(tool)) {
        note.textContent = "This xAI multi-agent model does not support client-side tools.";
        return note;
      }
      if (tool.onlyServices && tool.onlyServices.length) {
        const friendlyServices = tool.onlyServices
          .map(service => (service === "openai"
            ? "OpenAI"
            : service.charAt(0).toUpperCase() + service.slice(1)))
          .join(", ");
        note.textContent = `Available when ${friendlyServices} is selected.`;
      } else {
        note.textContent = "Currently unavailable for this service.";
      }
      return note;
    }

    if (!masterEnabled) {
      const note = document.createElement("div");
      note.className = "tool-note";
      note.textContent = "Enable tool calling above to activate this tool.";
      return note;
    }

    if (tool.type === "mcp" && isOnline === false) {
      const note = document.createElement("div");
      note.className = "tool-note";
      note.textContent = "MCP server is unreachable. Ensure it is running and accessible.";
      return note;
    }

    return null;
  }

  function handleToolToggle(event: Event) {
    const checkbox = event.currentTarget as HTMLInputElement;
    const toolKey = checkbox.getAttribute("data-tool-key");
    if (!toolKey || !ensureClient()) {
      return;
    }
    const enabled = checkbox.checked;
    responsesClient.setToolEnabled(toolKey, enabled);
    updateFeatureStatus();

    showInfo(`${enabled ? "Enabled" : "Disabled"} ${checkbox.getAttribute("data-tool-name") || "tool"}.`);

  }

  function handleMcpDelete(tool: ToolCatalogEntry) {
    if (!tool || !tool.key) {
      return;
    }
    const label = tool.key.replace(/^mcp:/, "");
    requestMcpServerRemoval(label, tool.displayName);

  }

  function renderToolList() {
    if (!toolsContainer) {
      return;
    }

    if (!ensureClient()) {
      toolsContainer.innerHTML = `
        <div class="tool-template-placeholder">
          <p><strong>Tool settings are loading…</strong></p>
          <p class="tool-template-subcopy">Retry after the Responses client finishes initialising.</p>
        </div>
      `;
      return;
    }

    const catalog = responsesClient.getToolCatalog();
    const serviceKey = getActiveServiceKey();
    const masterEnabled = isMasterEnabled();
    const activeModelName = getActiveModelName();
    const codexModelActive = isCodexModel(activeModelName);
    const clientSideToolsSupported = supportsClientSideToolsForCurrentModel(serviceKey, activeModelName);

    toolsContainer.classList.toggle("tools-disabled", !masterEnabled);
    toolsContainer.innerHTML = "";

    if (!catalog.length) {
      toolsContainer.innerHTML = `
        <div class="tool-template-placeholder">
          <p><strong>No tools are configured.</strong></p>
          <p class="tool-template-subcopy">Add tool definitions in <code>src/ts/services/api/staticTools.ts</code> to expose them here.</p>
        </div>
      `;
      return;
    }

    catalog.forEach(tool => {
      if (tool.hidden) {
        return;
      }
      let isAvailable = !tool.onlyServices || tool.onlyServices.includes(serviceKey);
      if (tool.requiresApiKeyService && tool.hasRequiredApiKey === false) {
        isAvailable = false;
      }
      if (tool.key === "builtin:image_generation" && openAiImageUnavailableReason(serviceKey, codexModelActive, clientSideToolsSupported)) {
        isAvailable = false;
      }
      if (!clientSideToolsSupported && isClientSideTool(tool)) {
        isAvailable = false;
      }
      const isOnline = tool.type !== "mcp" ? true : tool.isOnline !== false;
      const preferenceEnabled = responsesClient.isToolEnabled(tool.key);
      const item = document.createElement("div");
      item.className = "tool-toggle-item";
      if (!masterEnabled) {
        item.classList.add("tool-master-disabled");
      }
      if (!isAvailable) {
        item.classList.add("tool-unavailable");
      }
      if (tool.type === "mcp" && isOnline === false) {
        item.classList.add("tool-offline");
      }

      const content = document.createElement("div");
      content.className = "tool-toggle-content";

      const info = document.createElement("div");
      info.className = "tool-info";

      const titleRow = document.createElement("div");
      titleRow.className = "tool-title-row";

      const name = document.createElement("span");
      name.className = "tool-name";
      name.textContent = tool.displayName;

      titleRow.appendChild(name);
      titleRow.appendChild(createBadge(tool));
      info.appendChild(titleRow);

      if (tool.description) {
        const description = document.createElement("p");
        description.className = "tool-description";
        description.textContent = tool.description;
        info.appendChild(description);
      }

      const note = availabilityNote(tool, isAvailable, isOnline, masterEnabled, serviceKey, codexModelActive, clientSideToolsSupported);
      if (note) {
        info.appendChild(note);
      }

      if (tool.type === "mcp" && tool.serverUrl) {
        const endpoint = document.createElement("div");
        endpoint.className = "tool-mcp-endpoint";

        const code = document.createElement("code");
        code.textContent = tool.serverUrl;
        endpoint.appendChild(code);

        info.appendChild(endpoint);
      }

      const control = document.createElement("div");
      control.className = "tool-toggle-control";

      const toggleContainer = document.createElement("div");
      toggleContainer.className = "toggle-container";

      const inputId = `tool-toggle-${tool.key.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = inputId;
      checkbox.dataset.toolKey = tool.key;
      checkbox.dataset.toolName = tool.displayName;
      checkbox.checked = isAvailable && isOnline ? preferenceEnabled : false;
      checkbox.disabled = !isAvailable || !isOnline || !masterEnabled;

      const label = document.createElement("label");
      label.className = "toggle-switch";
      label.setAttribute("for", inputId);

      checkbox.addEventListener("change", handleToolToggle);

      if (tool.type === "mcp") {
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "tool-action-delete";
        deleteButton.title = `Remove ${tool.displayName}`;
        deleteButton.setAttribute("aria-label", `Remove ${tool.displayName}`);

        deleteButton.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <use href="#trash"></use>
          </svg>
        `;

        deleteButton.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          handleMcpDelete(tool);
        });

        control.appendChild(deleteButton);
      }

      toggleContainer.appendChild(checkbox);
      toggleContainer.appendChild(label);
      control.appendChild(toggleContainer);

      content.appendChild(info);
      content.appendChild(control);

      item.appendChild(content);
      toolsContainer!.appendChild(item);
    });

    updateFeatureStatus();

  }

  function bindBulkActions() {
    if (bulkActionsBound) {
      return;
    }
    bulkActionsBound = true;

    if (enableAllButton) {
      enableAllButton.addEventListener("click", () => {
        if (!ensureClient()) {
          return;
        }
        responsesClient.setAllToolsEnabled(true);
        renderToolList();
        updateFeatureStatus();

        showInfo("All tools enabled.");

      });
    }

    if (disableAllButton) {
      disableAllButton.addEventListener("click", () => {
        if (!ensureClient()) {
          return;
        }
        responsesClient.setAllToolsEnabled(false);
        renderToolList();
        updateFeatureStatus();

        showInfo("All tools disabled.");

      });
    }
  }

  initToolsSettings = function() {
    toolsContainer = document.getElementById("individual-tools-container");
    enableAllButton = document.getElementById("enable-all-tools");
    disableAllButton = document.getElementById("disable-all-tools");

    if (elements.toolCallingToggle) {
      elements.toolCallingToggle.disabled = false;
      elements.toolCallingToggle.removeAttribute("aria-disabled");
      elements.toolCallingToggle.title = "";
    }

    bindBulkActions();
    renderToolList();

    if (responsesClient && typeof responsesClient.refreshMcpAvailability === "function") {
      try {
        const maybePromise = responsesClient.refreshMcpAvailability();
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then(() => {
            renderToolList();
          }).catch(error => {
            console.warn("Unable to refresh MCP availability:", error);
            renderToolList();
          });
        }
      } catch (error) {
        console.warn("Unable to refresh MCP availability:", error);
        renderToolList();
      }
    }
  };

  updateMasterToolCallingStatus = function(enabled: boolean) {
    if (elements.toolCallingToggle) {
      elements.toolCallingToggle.checked = enabled;
    }
    if (config) {
      config.enableFunctionCalling = enabled;
    }
    renderToolList();
  };

  refreshToolSettingsUI = function() {
    renderToolList();
  };

  updateToolDefinitions = function() {
    refreshToolSettingsUI();
  };

  getToolsDescription = function() {
    if (!config || config.enableFunctionCalling === false) {
      return "";
    }
    if (!responsesClient) {
      return "";
    }

    const serviceKey = typeof responsesClient.getActiveServiceKey === "function"
      ? responsesClient.getActiveServiceKey()
      : (config.defaultService || "openai");
    const activeModelName = getActiveModelName();
    const codexModelActive = isCodexModel(activeModelName);
    const clientSideToolsSupported = supportsClientSideToolsForCurrentModel(serviceKey, activeModelName);

    let catalog: ToolCatalogEntry[] = [];
    if (typeof responsesClient.getToolCatalog === "function") {
      catalog = responsesClient.getToolCatalog();
    }

    const items: string[] = [];
    catalog.forEach(tool => {
      if (tool.hidden) {
        return;
      }
      if (tool.onlyServices && !tool.onlyServices.includes(serviceKey)) {
        return;
      }

      if (tool.type === "mcp" && !isLocalService(serviceKey)) {
        const toolDef = responsesClient?.toolDefinitions?.find(def =>
          def.type === "mcp" && def.server_label === tool.key.replace("mcp:", ""),
        );
        const serverUrl = toolDef?.server_url;
        if (serverUrl && isLocalNetworkUrl(serverUrl)) {
          return;
        }
      }

      if (tool.type === "mcp" && tool.isOnline === false) {
        return;
      }
      if (tool.key === "builtin:image_generation" && openAiImageUnavailableReason(serviceKey, codexModelActive, clientSideToolsSupported)) {
        return;
      }
      if (!clientSideToolsSupported && isClientSideTool(tool)) {
        return;
      }
      if (typeof responsesClient.isToolEnabled === "function" && !responsesClient.isToolEnabled(tool.key)) {
        return;
      }
      const description = tool.description ? `: ${tool.description}` : "";
      items.push(`- ${tool.displayName}${description}`);
    });

    try {
      if (
        clientSideToolsSupported

        && getMemoryConfig().enabled
      ) {
        items.push("- Memory: The assistant can remember or forget short details when you ask it to.");
      }
    } catch (error) {
      console.warn("Unable to inspect memory configuration:", error);
    }

    if (!items.length) {
      return "";
    }
    return `\nAvailable tools you can call when needed:\n${items.join("\n")}\n`;
  };
})();

export { initToolsSettings, updateMasterToolCallingStatus, refreshToolSettingsUI, updateToolDefinitions, getToolsDescription };
