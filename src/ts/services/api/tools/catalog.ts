/**
 * Tool catalog store: the shared, mutable tool registry and its primitive
 * mutators.
 *
 * `TOOL_CATALOG` (rich entries) and `TOOL_DEFINITIONS` (the provider-facing
 * definitions, in lockstep order) are the single source of truth that the
 * preference, MCP-availability, and filtering concerns all read from and mutate
 * through the helpers exported here. Keeping the arrays and their splice
 * bookkeeping in one module means the "catalog index ↔ definitions index ↔
 * userMcpToolCount" invariant lives in exactly one place.
 */

import { STORAGE_KEYS } from "../../../utils/storage/storage.ts";
import { STATIC_TOOLS } from "../staticTools.ts";
import type { McpServerConfig, ToolDefinition, ToolEntry } from "../../../../types/tools.ts";

/** Rich tool entries (metadata + definition) forming the live registry. */
export const TOOL_CATALOG: ToolEntry[] = [];

/** Provider-facing tool definitions, kept in lockstep order with {@link TOOL_CATALOG}. */
export const TOOL_DEFINITIONS: ToolDefinition[] = [];

/**
 * Number of user-configured MCP tools held at the front of the catalog.
 *
 * @remarks
 * MCP tools occupy the front of the catalog and static tools follow; tracking
 * the boundary keeps MCP inserts and removals from disturbing static order.
 */
let userMcpToolCount = 0;

/** Returns a deep copy of a tool definition so catalog edits never alias state. */
export function cloneDefinition(definition: ToolDefinition): ToolDefinition {
  return JSON.parse(JSON.stringify(definition));
}

/** Reads the user's persisted MCP server configs from localStorage, or `[]`. */
export function loadUserMCPServers(): McpServerConfig[] {
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

/**
 * Builds a catalog entry from an MCP server config, or `null` when the config
 * is missing a label or URL.
 */
export function buildMcpToolEntry(server: McpServerConfig): ToolEntry | null {
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

/** Inserts an MCP tool at the MCP/static boundary and advances the boundary. */
export function insertMcpTool(toolEntry: ToolEntry) {
  TOOL_CATALOG.splice(userMcpToolCount, 0, toolEntry);
  TOOL_DEFINITIONS.splice(userMcpToolCount, 0, cloneDefinition(toolEntry.definition));
  userMcpToolCount += 1;
}

/** Replaces the catalog entry and matching definition at `index` in place. */
export function replaceToolAt(index: number, toolEntry: ToolEntry) {
  TOOL_CATALOG[index] = toolEntry;
  TOOL_DEFINITIONS[index] = cloneDefinition(toolEntry.definition);
}

/** Appends a static tool after the MCP region, preserving static order. */
export function addStaticTool(toolEntry: ToolEntry) {
  TOOL_CATALOG.push(toolEntry);
  TOOL_DEFINITIONS.push(cloneDefinition(toolEntry.definition));
}

/** Removes the catalog entry and matching definition at `index`. */
export function removeToolAt(index: number) {
  TOOL_CATALOG.splice(index, 1);
  TOOL_DEFINITIONS.splice(index, 1);
}

/** Returns the number of user MCP tools occupying the front of the catalog. */
export function getUserMcpToolCount(): number {
  return userMcpToolCount;
}

/** Decrements the MCP tool count (floored at zero) after an MCP removal. */
export function decrementUserMcpToolCount() {
  userMcpToolCount = Math.max(0, userMcpToolCount - 1);
}

/** Returns the catalog index for `key`, or `-1` if absent. */
export function findToolIndex(key: string): number {
  return TOOL_CATALOG.findIndex(tool => tool.key === key);
}

/** Returns the catalog entry for `key`, or `undefined` if absent. */
export function findTool(key: string): ToolEntry | undefined {
  return TOOL_CATALOG.find(tool => tool.key === key);
}

loadUserMCPServers().forEach(server => {
  const entry = buildMcpToolEntry(server);
  if (entry) {
    insertMcpTool(entry);
  }
});

STATIC_TOOLS.forEach(tool => addStaticTool(tool));
