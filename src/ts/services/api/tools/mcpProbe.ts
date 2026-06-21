/**
 * MCP server reachability probing.
 *
 * @remarks
 * Network-facing helpers that decide whether an MCP server URL appears online,
 * honoring the {@link MCP_ASSUME_ONLINE} override and CSP/host restrictions.
 * Split out of {@link ./mcp.ts} so the `fetch`/timeout probing stays separate
 * from the catalog-mutating registration logic; {@link ./mcp.ts} drives these
 * from its availability refresh and re-exports {@link isLocalNetworkUrl}.
 */

import { MCP_ASSUME_ONLINE } from "../../../../config/config.ts";
import { state } from "../../../init/state.ts";
import { logVerbose } from "../../../utils/logger.ts";

interface McpFetchResult {
  status: "ok" | "bad-status" | "timeout" | "error";
  code?: number;
  error?: unknown;
}

const MCP_PING_TIMEOUT_MS = 4000;

/** Reports whether a URL points at localhost, a private LAN range, or a `.local` host. */
export function isLocalNetworkUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
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

/**
 * Probes an MCP server URL for reachability.
 *
 * @returns `true`/`false` once determined, or `null` when the check is skipped
 * (e.g. blocked by host/CSP restrictions) and availability stays unknown.
 */
export async function pingMcpServer(url: string | undefined): Promise<boolean | null> {
  const normalizedUrl = typeof url === "string" ? url : "";
  if (!normalizedUrl) {
    return false;
  }
  if (typeof window !== "undefined" && MCP_ASSUME_ONLINE === true) {
    return true;
  }
  if (!isHostAllowed(normalizedUrl)) {
    logVerbose(`Skipping MCP availability check for ${normalizedUrl} due to CSP restrictions.`);
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

/** Performs a single timed `fetch` probe in the given CORS mode. */
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

/** Reports whether the page's CSP/origin policy permits probing the URL's host. */
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
