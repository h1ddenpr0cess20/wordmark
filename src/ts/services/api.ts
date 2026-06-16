/**
 * Aggregated Responses API client.
 *
 * @remarks
 * Composes the configuration, message-preparation, network, and tool helpers
 * from `./api/*` into a single {@link responsesClient} facade.
 */

import { getActiveServiceKey } from "./api/clientConfig.ts";
import {
  collectFunctionCalls,
  serializeMessagesForRequest,
} from "./api/messageUtils.ts";
import { buildInstructions } from "./api/instructions.ts";
import {
  runTurn,
} from "./api/requestClient.ts";
import {
  TOOL_DEFINITIONS,
  TOOL_HANDLERS,
  getToolCatalog,
  isToolEnabled,
  isClientSideToolType,
  setToolEnabled,
  setAllToolsEnabled,
  registerMcpServer,
  unregisterMcpServer,
  getEnabledToolDefinitions,
  getAvailableToolKeys,
  refreshMcpAvailability,
  supportsClientSideTools,
} from "./api/toolManager.ts";

/**
 * Facade over the Responses API helpers used throughout the app.
 *
 * @remarks
 * `toolDefinitions` and `toolHandlers` are getters so the `toolManager`
 * constants are read at runtime — the import cycle
 * (`toolManager → apiKeys → tools → api → toolManager`) would otherwise hit
 * them in the temporal dead zone during module evaluation.
 */
export const responsesClient = {
  buildInstructions,
  prepareInputMessages: serializeMessagesForRequest,
  collectFunctionCalls,
  runTurn,
  get toolDefinitions() { return TOOL_DEFINITIONS; },
  get toolHandlers() { return TOOL_HANDLERS; },
  getToolCatalog,
  isToolEnabled,
  isClientSideToolType,
  setToolEnabled,
  setAllToolsEnabled,
  registerMcpServer,
  unregisterMcpServer,
  getEnabledToolDefinitions,
  getAvailableToolKeys,
  getActiveServiceKey,
  refreshMcpAvailability,
  supportsClientSideTools,
};
