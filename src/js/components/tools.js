/**
 * Tool settings management for Responses API integrations.
 * Renders the tool list, persists toggle state, and synchronises with the
 * Responses client so only enabled tools are sent with each request.
 */
(function() {
  let toolsContainer = null;
  let enableAllButton = null;
  let disableAllButton = null;
  let bulkActionsBound = false;

  function ensureClient() {
    if (!window.responsesClient) {
      console.warn("Responses client unavailable; tool settings cannot be initialised yet.");
      return false;
    }
    return true;
  }

  function getActiveServiceKey() {
    if (!ensureClient()) {
      return "openai";
    }
    return window.responsesClient.getActiveServiceKey();
  }

  function isMasterEnabled() {
    return !(window.config && window.config.enableFunctionCalling === false);
  }

  function getActiveModelName() {
    if (window.modelSelector && window.modelSelector.value) {
      return window.modelSelector.value;
    }
    if (window.config && typeof window.config.getDefaultModel === "function") {
      try {
        return window.config.getDefaultModel();
      } catch {
        /* ignore */
      }
    }
    const activeKey = window.config && window.config.defaultService;
    if (activeKey && window.config?.services?.[activeKey]?.defaultModel) {
      return window.config.services[activeKey].defaultModel;
    }
    return "";
  }

  function isCodexModel(modelName) {
    return typeof modelName === "string" && modelName.toLowerCase().includes("codex");
  }

  function createBadge(tool) {
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

  function availabilityNote(tool, isAvailable, isOnline, masterEnabled, serviceKey, codexModelActive) {
    if (!isAvailable) {
      const note = document.createElement("div");
      note.className = "tool-note";
      if (tool.key === "builtin:image_generation" && serviceKey === "openai" && codexModelActive) {
        note.textContent = "Image generation is unavailable for Codex models.";
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

  function handleToolToggle(event) {
    const checkbox = event.currentTarget;
    const toolKey = checkbox.getAttribute("data-tool-key");
    if (!toolKey || !ensureClient()) {
      return;
    }
    const enabled = checkbox.checked;
    window.responsesClient.setToolEnabled(toolKey, enabled);
    if (typeof window.updateFeatureStatus === "function") {
      window.updateFeatureStatus();
    }
    if (typeof window.showInfo === "function") {
      window.showInfo(`${enabled ? "Enabled" : "Disabled"} ${checkbox.getAttribute("data-tool-name") || "tool"}.`);
    }
  }

  function handleMcpDelete(tool) {
    if (!tool || !tool.key) {
      return;
    }
    const label = tool.key.replace(/^mcp:/, "");
    if (typeof window.requestMcpServerRemoval === "function") {
      window.requestMcpServerRemoval(label, tool.displayName);
    } else {
      console.warn("MCP removal helper unavailable; unable to delete server from UI.");
    }
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

    const catalog = window.responsesClient.getToolCatalog();
    const serviceKey = getActiveServiceKey();
    const masterEnabled = isMasterEnabled();
    const activeModelName = getActiveModelName();
    const codexModelActive = isCodexModel(activeModelName);

    toolsContainer.classList.toggle("tools-disabled", !masterEnabled);
    toolsContainer.innerHTML = "";

    if (!catalog.length) {
      toolsContainer.innerHTML = `
        <div class="tool-template-placeholder">
          <p><strong>No tools are configured.</strong></p>
          <p class="tool-template-subcopy">Add tool definitions in <code>src/js/services/api.js</code> to expose them here.</p>
        </div>
      `;
      return;
    }

    catalog.forEach(tool => {
      if (tool.hidden) {
        return;
      }
      let isAvailable = !tool.onlyServices || tool.onlyServices.includes(serviceKey);
      if (tool.key === "builtin:image_generation" && serviceKey === "openai" && codexModelActive) {
        isAvailable = false;
      }
      const isOnline = tool.type !== "mcp" ? true : tool.isOnline !== false;
      const preferenceEnabled = window.responsesClient.isToolEnabled(tool.key);
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

      const note = availabilityNote(tool, isAvailable, isOnline, masterEnabled, serviceKey, codexModelActive);
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
            <use href="src/assets/icons.svg#trash"></use>
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
      toolsContainer.appendChild(item);
    });

    if (typeof window.updateFeatureStatus === "function") {
      window.updateFeatureStatus();
    }
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
        window.responsesClient.setAllToolsEnabled(true);
        renderToolList();
        if (typeof window.updateFeatureStatus === "function") {
          window.updateFeatureStatus();
        }
        if (typeof window.showInfo === "function") {
          window.showInfo("All tools enabled.");
        }
      });
    }

    if (disableAllButton) {
      disableAllButton.addEventListener("click", () => {
        if (!ensureClient()) {
          return;
        }
        window.responsesClient.setAllToolsEnabled(false);
        renderToolList();
        if (typeof window.updateFeatureStatus === "function") {
          window.updateFeatureStatus();
        }
        if (typeof window.showInfo === "function") {
          window.showInfo("All tools disabled.");
        }
      });
    }
  }

  window.initToolsSettings = function() {
    toolsContainer = document.getElementById("individual-tools-container");
    enableAllButton = document.getElementById("enable-all-tools");
    disableAllButton = document.getElementById("disable-all-tools");

    if (window.toolCallingToggle) {
      window.toolCallingToggle.disabled = false;
      window.toolCallingToggle.removeAttribute("aria-disabled");
      window.toolCallingToggle.title = "";
    }

    bindBulkActions();
    renderToolList();

    if (window.responsesClient && typeof window.responsesClient.refreshMcpAvailability === "function") {
      try {
        const maybePromise = window.responsesClient.refreshMcpAvailability();
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

  window.updateMasterToolCallingStatus = function(enabled) {
    if (window.toolCallingToggle) {
      window.toolCallingToggle.checked = enabled;
    }
    if (window.config) {
      window.config.enableFunctionCalling = enabled;
    }
    renderToolList();
  };

  window.refreshToolSettingsUI = function() {
    renderToolList();
  };

  window.updateToolDefinitions = function() {
    if (typeof window.refreshToolSettingsUI === "function") {
      window.refreshToolSettingsUI();
    }
  };

  function isLocalNetworkUrl(url) {
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

  window.getToolsDescription = function() {
    if (!window.config || window.config.enableFunctionCalling === false) {
      return "";
    }
    if (!window.responsesClient) {
      return "";
    }

    const serviceKey = typeof window.responsesClient.getActiveServiceKey === "function"
      ? window.responsesClient.getActiveServiceKey()
      : (window.config.defaultService || "openai");
    const activeModelName = getActiveModelName();
    const codexModelActive = isCodexModel(activeModelName);

    // Check if this is a local AI service
    const isLocalService = serviceKey === "lmstudio";

    let catalog = [];
    if (typeof window.responsesClient.getToolCatalog === "function") {
      catalog = window.responsesClient.getToolCatalog();
    }

    const items = [];
    catalog.forEach(tool => {
      if (tool.hidden) {
        return;
      }
      if (tool.onlyServices && !tool.onlyServices.includes(serviceKey)) {
        return;
      }

      // Skip MCP servers on local network when using cloud AI services
      if (tool.type === "mcp" && !isLocalService) {
        // Get server URL from the tool definition
        const toolDef = window.responsesClient?.toolDefinitions?.find(def =>
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
      if (tool.key === "builtin:image_generation" && serviceKey === "openai" && codexModelActive) {
        return;
      }
      if (typeof window.responsesClient.isToolEnabled === "function" && !window.responsesClient.isToolEnabled(tool.key)) {
        return;
      }
      const description = tool.description ? `: ${tool.description}` : "";
      items.push(`- ${tool.displayName}${description}`);
    });

    try {
      if (typeof window.getMemoryConfig === "function" && window.getMemoryConfig().enabled) {
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
