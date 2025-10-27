/**
 * MCP Server Management
 * Handles configuration and management of URL-based Model Context Protocol servers
 */

// Storage key for MCP servers
const MCP_SERVERS_STORAGE_KEY = "mcp_servers";

/**
 * Get all configured MCP servers
 * @returns {Array} Array of server configurations
 */
function getMCPServers() {
  try {
    const stored = localStorage.getItem(MCP_SERVERS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Error loading MCP servers:", error);
    return [];
  }
}

/**
 * Save MCP servers to localStorage
 * @param {Array} servers - Array of server configurations
 */
function saveMCPServers(servers) {
  try {
    localStorage.setItem(MCP_SERVERS_STORAGE_KEY, JSON.stringify(servers));
  } catch (error) {
    console.error("Error saving MCP servers:", error);
    throw error;
  }
}

/**
 * Add a new MCP server
 * @param {Object} server - Server configuration
 * @returns {boolean} Success status
 */
function addMCPServer(server) {
  try {
    const servers = getMCPServers();

    // Check if server with same label already exists
    if (servers.some(s => s.server_label === server.server_label)) {
      throw new Error(`Server with label "${server.server_label}" already exists`);
    }

    servers.push(server);
    saveMCPServers(servers);
    return true;
  } catch (error) {
    console.error("Error adding MCP server:", error);
    throw error;
  }
}

/**
 * Remove an MCP server by label
 * @param {string} serverLabel - Label of server to remove
 * @returns {boolean} Success status
 */
function removeMCPServer(serverLabel) {
  try {
    const servers = getMCPServers();
    const filtered = servers.filter(s => s.server_label !== serverLabel);
    saveMCPServers(filtered);
    return true;
  } catch (error) {
    console.error("Error removing MCP server:", error);
    throw error;
  }
}

/**
 * Render the list of MCP servers in the UI
 */
function renderMCPServersList() {
  const container = document.getElementById("mcp-servers-list");
  if (!container) return;

  const servers = getMCPServers();

  if (servers.length === 0) {
    container.innerHTML = "<p class=\"info-text\" style=\"margin: 0;\">No MCP servers configured. Add one below to get started.</p>";
    return;
  }

  container.innerHTML = servers.map(server => `
    <div class="mcp-server-item" data-server-label="${server.server_label}">
      <div class="mcp-server-info">
        <strong>${server.displayName}</strong>
        <div class="mcp-server-details">
          <code>${server.server_url}</code>
          ${server.description ? `<div style="font-size: 0.8rem; margin-top: 4px;">${server.description}</div>` : ""}
        </div>
      </div>
      <button type="button" class="mcp-server-remove" data-server-label="${server.server_label}" title="Remove Server">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <use href="src/assets/icons.svg#trash"></use>
        </svg>
      </button>
    </div>
  `).join("");

  // Add event listeners for remove buttons
  container.querySelectorAll(".mcp-server-remove").forEach(button => {
    button.addEventListener("click", handleRemoveServer);
  });
}

function requestMcpServerRemoval(serverLabel, fallbackDisplayName) {
  if (!serverLabel) {
    return false;
  }

  const servers = getMCPServers();
  const server = servers.find(s => s.server_label === serverLabel);
  const displayName = server ? server.displayName : (fallbackDisplayName || serverLabel);

  if (!confirm(`Are you sure you want to remove the MCP server "${displayName}"?`)) {
    return false;
  }

  try {
    removeMCPServer(serverLabel);
    renderMCPServersList();

    if (window.responsesClient && typeof window.responsesClient.unregisterMcpServer === "function") {
      try {
        window.responsesClient.unregisterMcpServer(serverLabel);
      } catch (unregisterError) {
        console.warn("Unable to unregister MCP server:", unregisterError);
      }
    }

    refreshToolingState();

    if (window.showNotification) {
      window.showNotification("MCP server removed successfully", "success");
    }
    return true;
  } catch (error) {
    if (window.showNotification) {
      window.showNotification(`Error removing server: ${error.message}`, "error");
    }
    return false;
  }
}

function refreshToolingState(options = {}) {
  const { checkAvailability = false } = options;

  if (typeof window.refreshToolSettingsUI === "function") {
    window.refreshToolSettingsUI();
  } else if (typeof window.updateToolDefinitions === "function") {
    window.updateToolDefinitions();
  }

  if (!checkAvailability) {
    return;
  }

  if (window.responsesClient && typeof window.responsesClient.refreshMcpAvailability === "function") {
    try {
      const maybePromise = window.responsesClient.refreshMcpAvailability(true);
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(() => {
          if (typeof window.refreshToolSettingsUI === "function") {
            window.refreshToolSettingsUI();
          }
        }).catch(error => {
          console.warn("Unable to refresh MCP availability:", error);
        });
      }
    } catch (error) {
      console.warn("Unable to refresh MCP availability:", error);
    }
  }
}

/**
 * Handle removing a server
 */
function handleRemoveServer(event) {
  const serverLabel = event.currentTarget.dataset.serverLabel;
  requestMcpServerRemoval(serverLabel);
}

/**
 * Handle adding a new server from the form
 */
function handleAddServer() {
  const nameInput = document.getElementById("mcp-server-name");
  const labelInput = document.getElementById("mcp-server-label");
  const urlInput = document.getElementById("mcp-server-url");
  const approvalInput = document.getElementById("mcp-server-approval");
  const descriptionInput = document.getElementById("mcp-server-description");

  if (!nameInput || !labelInput || !urlInput || !approvalInput) {
    console.error("Required form elements not found");
    return;
  }

  const displayName = nameInput.value.trim();
  const server_label = labelInput.value.trim();
  const server_url = urlInput.value.trim();
  const require_approval = approvalInput.value;
  const description = descriptionInput?.value.trim();

  // Validate inputs
  if (!displayName) {
    if (window.showNotification) {
      window.showNotification("Please enter a display name", "error");
    }
    return;
  }

  if (!server_label) {
    if (window.showNotification) {
      window.showNotification("Please enter a server label", "error");
    }
    return;
  }

  if (!server_url) {
    if (window.showNotification) {
      window.showNotification("Please enter a server URL", "error");
    }
    return;
  }

  // Validate URL format
  try {
    const url = new URL(server_url);
    // URL validation successful if we get here
    void url; // Explicitly mark as intentionally unused
  } catch {
    if (window.showNotification) {
      window.showNotification("Please enter a valid URL (e.g., http://localhost:9404/mcp)", "error");
    }
    return;
  }

  // Create server configuration matching api.js TOOL_CATALOG format
  const server = {
    displayName,
    server_label,
    server_url,
    require_approval,
    ...(description && { description }),
  };

  // Add server
  try {
    addMCPServer(server);
    renderMCPServersList();

    if (window.responsesClient && typeof window.responsesClient.registerMcpServer === "function") {
      try {
        window.responsesClient.registerMcpServer(server);
      } catch (registerError) {
        console.warn("Unable to register MCP server dynamically:", registerError);
      }
    }

    refreshToolingState({ checkAvailability: true });

    // Clear form
    nameInput.value = "";
    labelInput.value = "";
    urlInput.value = "";
    approvalInput.value = "always";
    if (descriptionInput) descriptionInput.value = "";

    if (window.showNotification) {
      window.showNotification("MCP server added successfully. It is now available without reloading.", "success");
    }
  } catch (error) {
    if (window.showNotification) {
      window.showNotification(`Error adding server: ${error.message}`, "error");
    }
  }
}

/**
 * Initialize MCP server management
 */
function initMCPServers() {
  // Render initial list
  renderMCPServersList();

  // Setup add server button
  const addButton = document.getElementById("add-mcp-server");
  if (addButton) {
    addButton.addEventListener("click", handleAddServer);
  }
}

// Export functions to window for access from other modules
window.getMCPServers = getMCPServers;
window.addMCPServer = addMCPServer;
window.removeMCPServer = removeMCPServer;
window.requestMcpServerRemoval = requestMcpServerRemoval;
window.initMCPServers = initMCPServers;
