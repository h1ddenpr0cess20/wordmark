/**
 * MCP server registration and availability (online/offline) tracking.
 *
 * Owns the per-server status cache and the network pinging that backs it, plus
 * register/unregister, which mutate the shared catalog. Availability is read by
 * the catalog-facing UI and the request-time tool filter via
 * `getCachedMcpStatus`.
 */

import { MCP_ASSUME_ONLINE } from "../../../../config/config.ts";
import { state } from "../../../init/state.ts";
import {
  TOOL_CATALOG,
  buildMcpToolEntry,
  decrementUserMcpToolCount,
  findTool,
  findToolIndex,
  getUserMcpToolCount,
  insertMcpTool,
  removeToolAt,
  replaceToolAt,
} from "./catalog.ts";
import { getToolPreference, removeToolPreference } from "./preferences.ts";
import type { McpServerConfig, ToolEntry } from "../../../../types/tools.ts";

interface McpFetchResult {
  status: "ok" | "bad-status" | "timeout" | "error";
  code?: number;
  error?: unknown;
}

const MCP_PING_TIMEOUT_MS = 4000;
const MCP_REFRESH_INTERVAL_MS = 60000;
const mcpStatusCache = new Map<string, { online: boolean | null; checkedAt: number }>();
let lastMcpRefresh = 0;
let mcpRefreshPromise: Promise<void> | null = null;

export function getCachedMcpStatus(toolKey: string): boolean | null {
  const entry = mcpStatusCache.get(toolKey);
  return entry ? entry.online : null;
}

function setCachedMcpStatus(toolKey: string, online: boolean | null) {
  mcpStatusCache.set(toolKey, { online, checkedAt: Date.now() });
  const tool = findTool(toolKey);
  if (tool) {
    tool.isOnline = online;
  }
}

export function registerMcpServer(serverConfig: McpServerConfig, options: { silent?: boolean } = {}): ToolEntry | null {
  const { silent = false } = options;
  const entry = buildMcpToolEntry(serverConfig);
  if (!entry) {
    return null;
  }

  const existingIndex = findToolIndex(entry.key);
  if (existingIndex !== -1) {
    replaceToolAt(existingIndex, entry);
  } else {
    insertMcpTool(entry);
  }

  if (!silent) {
    mcpStatusCache.delete(entry.key);
  }
  return entry;
}

export function unregisterMcpServer(serverLabel: string, options: { silent?: boolean } = {}): boolean {
  if (!serverLabel) {
    return false;
  }
  const { silent = false } = options;
  const key = `mcp:${serverLabel}`;
  const index = findToolIndex(key);
  if (index === -1) {
    return false;
  }

  removeToolAt(index);
  if (index < getUserMcpToolCount()) {
    decrementUserMcpToolCount();
  }
  mcpStatusCache.delete(key);

  if (!silent) {
    removeToolPreference(key);
  }
  return true;
}

export function refreshMcpAvailability(force = false): Promise<void> {
  const mcpTools = TOOL_CATALOG.filter(tool => tool.type === "mcp");
  if (typeof window !== "undefined" && MCP_ASSUME_ONLINE === true) {
    mcpTools.forEach(tool => setCachedMcpStatus(tool.key, true));
    lastMcpRefresh = Date.now();
    return Promise.resolve();
  }
  if (mcpTools.length === 0) {
    return Promise.resolve();
  }
  const now = Date.now();
  if (!force && mcpRefreshPromise) {
    return mcpRefreshPromise;
  }
  if (!force && now - lastMcpRefresh < MCP_REFRESH_INTERVAL_MS) {
    return Promise.resolve();
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    mcpTools.forEach(tool => setCachedMcpStatus(tool.key, false));
    lastMcpRefresh = Date.now();
    return Promise.resolve();
  }

  mcpRefreshPromise = (async () => {
    await Promise.all(mcpTools.map(async tool => {
      const enabled = getToolPreference(tool.key, tool.defaultEnabled !== false);
      if (!enabled) {
        return;
      }
      const online = await pingMcpServer(tool.definition.server_url);
      if (online !== null) {
        setCachedMcpStatus(tool.key, online);
      }
    }));
  })().catch(error => {
    console.warn("Error refreshing MCP availability:", error);
  }).finally(() => {
    lastMcpRefresh = Date.now();
    mcpRefreshPromise = null;
  });

  return mcpRefreshPromise;
}

export function isLocalNetworkUrl(url: string): boolean {
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

async function pingMcpServer(url: string | undefined): Promise<boolean | null> {
  const normalizedUrl = typeof url === "string" ? url : "";
  if (!normalizedUrl) {
    return false;
  }
  if (typeof window !== "undefined" && MCP_ASSUME_ONLINE === true) {
    return true;
  }
  if (!isHostAllowed(normalizedUrl)) {
    if (state.verboseLogging) {
      console.info(`Skipping MCP availability check for ${normalizedUrl} due to CSP restrictions.`);
    }
    return null;
  }
  const corsAttempt = await attemptMcpFetch(normalizedUrl, "cors");
  if (corsAttempt.status === "ok") {
    return true;
  }
  if (corsAttempt.status === "bad-status") {
    return false;
  }
  if (corsAttempt.status === "timeout") {
    return false;
  }

  const noCorsAttempt = await attemptMcpFetch(normalizedUrl, "no-cors");
  if (noCorsAttempt.status === "ok") {
    return true;
  }
  if (noCorsAttempt.status === "bad-status") {
    return false;
  }
  if (noCorsAttempt.status === "timeout") {
    return false;
  }
  if (noCorsAttempt.status === "error") {
    if (state.verboseLogging) {
      console.warn(`MCP availability check failed (${normalizedUrl}) with network error:`, noCorsAttempt.error);
    }
    return false;
  }
  if (state.verboseLogging) {
    console.warn(`MCP availability check failed for ${normalizedUrl}.`);
  }
  return false;
}

async function attemptMcpFetch(url: string, mode: RequestMode): Promise<McpFetchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MCP_PING_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      mode,
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response) {
      return { status: "ok" };
    }
    if (response.type === "opaque") {
      return { status: "ok" };
    }
    if (response.status < 500) {
      return { status: "ok" };
    }
    return { status: "bad-status", code: response.status };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      return { status: "timeout" };
    }
    if (state.verboseLogging) {
      console.warn(`MCP availability check failed (${mode}) for ${url}:`, error);
    }
    return { status: "error", error };
  }
}

function isHostAllowed(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    const host = parsed.hostname;
    if (!host) {
      return false;
    }
    if (host === window.location.hostname) {
      return true;
    }
    if (host === "localhost" || host === "127.0.0.1") {
      return true;
    }
    if (host.endsWith(".localhost")) {
      return true;
    }
    return true;
  } catch (error) {
    console.warn("Failed to parse MCP URL:", url, error);
    return false;
  }
}
