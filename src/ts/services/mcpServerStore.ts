/**
 * Storage for URL-based Model Context Protocol (MCP) servers.
 *
 * @remarks
 * Pure persistence layer for user-configured MCP servers: read/add/remove
 * against localStorage, with no DOM or client-registration concerns. The UI and
 * `responsesClient` wiring lives in {@link ./mcpServers.ts}, which re-exports
 * these so existing importers keep a single entry point.
 */

import { STORAGE_KEYS, writeJSON } from "../utils/storage.ts";

const MCP_SERVERS_STORAGE_KEY = STORAGE_KEYS.mcpServers;

/** A configured URL-based MCP server, as persisted in localStorage. */
export interface McpServer {
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
