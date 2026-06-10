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

import { STORAGE_KEYS } from "../../../utils/storage.ts";
import { STATIC_TOOLS } from "../staticTools.ts";
import type { McpServerConfig, ToolDefinition, ToolEntry } from "../../../../types/tools.ts";

export const TOOL_CATALOG: ToolEntry[] = [];
export const TOOL_DEFINITIONS: ToolDefinition[] = [];

// User-configured MCP tools occupy the front of the catalog; static tools follow.
// Tracking the boundary keeps MCP inserts/removals from disturbing static order.
let userMcpToolCount = 0;

export function cloneDefinition(definition: ToolDefinition): ToolDefinition {
  return JSON.parse(JSON.stringify(definition));
}

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

export function insertMcpTool(toolEntry: ToolEntry) {
  TOOL_CATALOG.splice(userMcpToolCount, 0, toolEntry);
  TOOL_DEFINITIONS.splice(userMcpToolCount, 0, cloneDefinition(toolEntry.definition));
  userMcpToolCount += 1;
}

export function replaceToolAt(index: number, toolEntry: ToolEntry) {
  TOOL_CATALOG[index] = toolEntry;
  TOOL_DEFINITIONS[index] = cloneDefinition(toolEntry.definition);
}

export function addStaticTool(toolEntry: ToolEntry) {
  TOOL_CATALOG.push(toolEntry);
  TOOL_DEFINITIONS.push(cloneDefinition(toolEntry.definition));
}

export function removeToolAt(index: number) {
  TOOL_CATALOG.splice(index, 1);
  TOOL_DEFINITIONS.splice(index, 1);
}

export function getUserMcpToolCount(): number {
  return userMcpToolCount;
}

export function decrementUserMcpToolCount() {
  userMcpToolCount = Math.max(0, userMcpToolCount - 1);
}

export function findToolIndex(key: string): number {
  return TOOL_CATALOG.findIndex(tool => tool.key === key);
}

export function findTool(key: string): ToolEntry | undefined {
  return TOOL_CATALOG.find(tool => tool.key === key);
}

// Populate the catalog at module load: persisted MCP servers first, then the
// static builtin/function tools.
loadUserMCPServers().forEach(server => {
  const entry = buildMcpToolEntry(server);
  if (entry) {
    insertMcpTool(entry);
  }
});

STATIC_TOOLS.forEach(tool => addStaticTool(tool));
