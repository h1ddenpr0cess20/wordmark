import { icon } from "../utils/icons.ts";
import { showNotification } from "../utils/notifications.ts";
import { responsesClient } from "./api.ts";
import { refreshToolSettingsUI } from "../components/tools.ts";
import { STORAGE_KEYS, writeJSON } from "../utils/storage.ts";
/**
 * Management of URL-based Model Context Protocol (MCP) servers.
 *
 * @remarks
 * Persists user-configured MCP servers to localStorage, renders the settings
 * list, and registers/unregisters them with the {@link responsesClient} so
 * changes take effect without reloading.
 */

const MCP_SERVERS_STORAGE_KEY = STORAGE_KEYS.mcpServers;

/** A configured URL-based MCP server, as persisted in localStorage. */
interface McpServer {
  server_label: string;
  server_url: string;
  displayName: string;
  require_approval?: string;
  description?: string;
}

/** Returns all configured MCP servers, or `[]` on read/parse failure. */
export function getMCPServers(): McpServer[] {
  try {
    const stored = localStorage.getItem(MCP_SERVERS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Error loading MCP servers:", error);
    return [];
  }
}

/**
 * Persists the full list of MCP servers to localStorage.
 *
 * @param servers - The servers to store.
 */
function saveMCPServers(servers: McpServer[]) {
  try {
    writeJSON(MCP_SERVERS_STORAGE_KEY, servers);
  } catch (error) {
    console.error("Error saving MCP servers:", error);
    throw error;
  }
}

/**
 * Adds a new MCP server.
 *
 * @param server - The server configuration to add.
 * @returns `true` on success.
 * @throws If a server with the same `server_label` already exists.
 */
export function addMCPServer(server: McpServer) {
  try {
    const servers = getMCPServers();

    if (servers.some((s) => s.server_label === server.server_label)) {
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
 * Removes the MCP server with the given label.
 *
 * @param serverLabel - Label of the server to remove.
 * @returns `true` on success.
 */
export function removeMCPServer(serverLabel: string) {
  try {
    const servers = getMCPServers();
    const filtered = servers.filter((s) => s.server_label !== serverLabel);
    saveMCPServers(filtered);
    return true;
  } catch (error) {
    console.error("Error removing MCP server:", error);
    throw error;
  }
}

/** Renders the configured MCP servers into the settings list. */
function renderMCPServersList() {
  const container = document.getElementById("mcp-servers-list");
  if (!container) return;

  const servers = getMCPServers();

  if (servers.length === 0) {
    container.innerHTML = "<p class=\"info-text\" style=\"margin: 0;\">No MCP servers configured. Add one below to get started.</p>";
    return;
  }

  container.innerHTML = "";

  servers.forEach((server) => {
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

/**
 * Prompts the user to confirm removing an MCP server, then unregisters it.
 *
 * @param serverLabel - The server label to remove.
 * @param fallbackDisplayName - Name shown if the server is no longer in storage.
 * @returns `true` if the server was removed.
 */
export function requestMcpServerRemoval(serverLabel: string, fallbackDisplayName?: string) {
  if (!serverLabel) {
    return false;
  }

  const servers = getMCPServers();
  const server = servers.find((s) => s.server_label === serverLabel);
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
      showNotification(`Error removing server: ${error instanceof Error ? error.message : ""}`, "error");
    }
    return false;
  }
}

/**
 * Refreshes the tool-settings UI, optionally re-checking MCP availability.
 *
 * @param options - When `checkAvailability` is `true`, re-probes server
 * availability and re-renders once it resolves.
 */
function refreshToolingState(options: { checkAvailability?: boolean } = {}) {
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

/** Click handler for a server's remove button. */
function handleRemoveServer(event: Event) {
  const serverLabel = (event.currentTarget as HTMLElement).dataset.serverLabel;
  if (serverLabel) {
    requestMcpServerRemoval(serverLabel);
  }
}

/** Reads the add-server form, validates it, and registers the new server. */
function handleAddServer() {
  const nameInput = document.getElementById("mcp-server-name") as HTMLInputElement | null;
  const labelInput = document.getElementById("mcp-server-label") as HTMLInputElement | null;
  const urlInput = document.getElementById("mcp-server-url") as HTMLInputElement | null;
  const approvalInput = document.getElementById("mcp-server-approval") as HTMLSelectElement | null;
  const descriptionInput = document.getElementById("mcp-server-description") as HTMLTextAreaElement | null;

  if (!nameInput || !labelInput || !urlInput || !approvalInput) {
    console.error("Required form elements not found");
    return;
  }

  const displayName = nameInput.value.trim();
  const server_label = labelInput.value.trim();
  const server_url = urlInput.value.trim();
  const require_approval = approvalInput.value;
  const description = descriptionInput?.value.trim();

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

  try {
    const url = new URL(server_url);
    void url;
  } catch {
    if (showNotification) {
      showNotification("Please enter a valid URL (e.g., http://localhost:9404/mcp)", "error");
    }
    return;
  }

  const server = {
    displayName,
    server_label,
    server_url,
    require_approval,
    ...(description && { description }),
  };

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
      showNotification(`Error adding server: ${error instanceof Error ? error.message : ""}`, "error");
    }
  }
}

/** Renders the initial server list and wires the add-server button. */
export function initMCPServers() {
  renderMCPServersList();

  const addButton = document.getElementById("add-mcp-server");
  if (addButton) {
    addButton.addEventListener("click", handleAddServer);
  }
}
