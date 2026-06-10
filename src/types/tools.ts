/**
 * Shared types for the tool catalog, MCP servers, and Responses-API tool defs.
 */

/** A tool/function definition sent to the provider with each request. */
export interface ToolDefinition {
  type: string;
  name?: string;
  description?: string;
  parameters?: Record<string, unknown>;
  strict?: boolean;
  server_label?: string;
  server_url?: string;
  require_approval?: string;
  container?: Record<string, unknown>;
  environment?: Record<string, unknown>;
  vector_store_ids?: string[];
  enable_video_understanding?: boolean;
  enable_image_understanding?: boolean;
  [key: string]: unknown;
}

/** A full catalog entry (internal): metadata plus its provider definition. */
export interface ToolEntry {
  key: string;
  type: string;
  displayName: string;
  description?: string;
  defaultEnabled?: boolean;
  onlyServices?: string[];
  requiresApiKeyService?: string;
  hidden?: boolean;
  isOnline?: boolean | null;
  definition: ToolDefinition;
}

/** User-supplied MCP server configuration (persisted to localStorage). */
export interface McpServerConfig {
  server_label?: string;
  server_url?: string;
  displayName?: string;
  description?: string;
  require_approval?: string;
  [key: string]: unknown;
}

/** The UI-facing subset of a catalog entry returned by `getToolCatalog()`. */
export interface ToolCatalogEntry {
  key: string;
  type: string;
  displayName: string;
  description?: string;
  onlyServices?: string[];
  defaultEnabled: boolean;
  requiresApiKeyService?: string;
  hasRequiredApiKey: boolean;
  isOnline: boolean | null;
  hidden: boolean;
  serverUrl?: string;
}
