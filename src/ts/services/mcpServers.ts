/**
 * UI and client wiring for URL-based Model Context Protocol (MCP) servers.
 *
 * @remarks
 * Wires the add-server form for user-configured MCP servers (persisted by
 * {@link ./mcpServerStore.ts}) and registers/unregisters them with the
 * {@link responsesClient} so changes take effect without reloading. Configured
 * servers are listed (and removable) through the tools catalog in settings.
 * The storage CRUD helpers are re-exported here so importers keep a single
 * entry point.
 */

import { showNotification } from "../utils/notifications.ts";
import { responsesClient } from "./api.ts";
import { refreshToolSettingsUI } from "../components/tools.ts";
import { getMCPServers, addMCPServer, removeMCPServer } from "./mcpServerStore.ts";

export { getMCPServers, addMCPServer, removeMCPServer };
export type { McpServer } from "./mcpServerStore.ts";

/**
 * Prompts the user to confirm removing an MCP server, then unregisters it.
 *
 * @param serverLabel - The server label to remove.
 * @param fallbackDisplayName - Name shown if the server is no longer in storage.
 * @returns `true` if the server was removed, or `false` if the label is empty
 *   or the user cancels the confirmation.
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

  const requiredFields: Array<[value: string, message: string]> = [
    [displayName, "Please enter a display name"],
    [server_label, "Please enter a server label"],
    [server_url, "Please enter a server URL"],
  ];
  for (const [value, message] of requiredFields) {
    if (!value) {
      if (showNotification) {
        showNotification(message, "error");
      }
      return;
    }
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

/** Wires the add-server button. */
export function initMCPServers() {
  const addButton = document.getElementById("add-mcp-server");
  if (addButton) {
    addButton.addEventListener("click", handleAddServer);
  }
}
