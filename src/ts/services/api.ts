/**
 * Aggregated Responses API client.
 * Composes configuration, message preparation, network, and tool helpers.
 */

import { getActiveServiceKey } from "./api/clientConfig.ts";
import {
  buildInstructions,
  collectFunctionCalls,
  serializeMessagesForRequest,
} from "./api/messageUtils.ts";
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
  refreshMcpAvailability,
  supportsClientSideTools,
} from "./api/toolManager.ts";

export const responsesClient = {
  buildInstructions,
  prepareInputMessages: serializeMessagesForRequest,
  collectFunctionCalls,
  runTurn,
  // Getters defer reading these toolManager consts until runtime so that an
  // import cycle (toolManager → apiKeys → tools → api → toolManager) does not
  // hit them in the temporal dead zone during module evaluation.
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
  getActiveServiceKey,
  refreshMcpAvailability,
  supportsClientSideTools,
};
