/**
 * Aggregated Responses API client.
 * Composes configuration, message preparation, network, and tool helpers.
 */

import { getActiveServiceKey } from "./api/clientConfig.js";
import {
  buildInstructions,
  collectFunctionCalls,
  serializeMessagesForRequest,
} from "./api/messageUtils.js";
import {
  runTurn,
} from "./api/requestClient.js";
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
} from "./api/toolManager.js";

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
