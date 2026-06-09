import { icon } from "../utils/icons.ts";
import { showNotification } from "../utils/notifications.ts";
import { responsesClient } from "./api.ts";
import { refreshToolSettingsUI } from "../components/tools.ts";
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
export function getMCPServers() {
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
export function addMCPServer(server) {
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
export function removeMCPServer(serverLabel) {
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
  const container = document.getElementById("mcp-servers-list") as any;
  if (!container) return;

  const servers = getMCPServers();

  if (servers.length === 0) {
    container.innerHTML = "<p class=\"info-text\" style=\"margin: 0;\">No MCP servers configured. Add one below to get started.</p>";
    return;
  }

  container.innerHTML = "";

  servers.forEach(server => {
    const item = document.createElement("div");
    item.className = "mcp-server-item";
    item.dataset.serverLabel = server.server_label;

    const info = document.createElement("div");
    info.className = "mcp-server-info";

    const name = document.createElement("strong");
    name.textContent = server.displayName;
    info.appendChild(name);

    const details = document.createElement("div");
    details.className = "mcp-server-details";

    const url = document.createElement("code");
    url.textContent = server.server_url;
    details.appendChild(url);

    if (server.description) {
      const desc = document.createElement("div");
      desc.className = "mcp-server-description";
      desc.textContent = server.description;
      details.appendChild(desc);
    }

    info.appendChild(details);
    item.appendChild(info);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "mcp-server-remove";
    removeBtn.dataset.serverLabel = server.server_label;
    removeBtn.title = "Remove Server";
    removeBtn.innerHTML = icon("trash", { width: 16, height: 16 });
    removeBtn.addEventListener("click", handleRemoveServer);
    item.appendChild(removeBtn);

    container.appendChild(item);
  });
}

export function requestMcpServerRemoval(serverLabel, fallbackDisplayName?) {
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

    if (responsesClient && typeof responsesClient.unregisterMcpServer === "function") {
      try {
        responsesClient.unregisterMcpServer(serverLabel);
      } catch (unregisterError) {
        console.warn("Unable to unregister MCP server:", unregisterError);
      }
    }

    refreshToolingState();

    if (showNotification) {
      showNotification("MCP server removed successfully", "success");
    }
    return true;
  } catch (error) {
    if (showNotification) {
      showNotification(`Error removing server: ${error.message}`, "error");
    }
    return false;
  }
}

function refreshToolingState(options: any = {}) {
  const { checkAvailability = false } = options;

  refreshToolSettingsUI();

  if (!checkAvailability) {
    return;
  }

  if (responsesClient && typeof responsesClient.refreshMcpAvailability === "function") {
    try {
      const maybePromise = responsesClient.refreshMcpAvailability(true);
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(() => {
          refreshToolSettingsUI();

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
  const nameInput = document.getElementById("mcp-server-name") as any;
  const labelInput = document.getElementById("mcp-server-label") as any;
  const urlInput = document.getElementById("mcp-server-url") as any;
  const approvalInput = document.getElementById("mcp-server-approval") as any;
  const descriptionInput = document.getElementById("mcp-server-description") as any;

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
    if (showNotification) {
      showNotification("Please enter a display name", "error");
    }
    return;
  }

  if (!server_label) {
    if (showNotification) {
      showNotification("Please enter a server label", "error");
    }
    return;
  }

  if (!server_url) {
    if (showNotification) {
      showNotification("Please enter a server URL", "error");
    }
    return;
  }

  // Validate URL format
  try {
    const url = new URL(server_url);
    // URL validation successful if we get here
    void url; // Explicitly mark as intentionally unused
  } catch {
    if (showNotification) {
      showNotification("Please enter a valid URL (e.g., http://localhost:9404/mcp)", "error");
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

    if (responsesClient && typeof responsesClient.registerMcpServer === "function") {
      try {
        responsesClient.registerMcpServer(server);
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

    if (showNotification) {
      showNotification("MCP server added successfully. It is now available without reloading.", "success");
    }
  } catch (error) {
    if (showNotification) {
      showNotification(`Error adding server: ${error.message}`, "error");
    }
  }
}

/**
 * Initialize MCP server management
 */
export function initMCPServers() {
  // Render initial list
  renderMCPServersList();

  // Setup add server button
  const addButton = document.getElementById("add-mcp-server") as any;
  if (addButton) {
    addButton.addEventListener("click", handleAddServer);
  }
}
