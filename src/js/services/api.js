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
  setToolEnabled,
  setAllToolsEnabled,
  registerMcpServer,
  unregisterMcpServer,
  getEnabledToolDefinitions,
  refreshMcpAvailability,
} from "./api/toolManager.js";

window.responsesClient = {
  buildInstructions,
  prepareInputMessages: serializeMessagesForRequest,
  collectFunctionCalls,
  runTurn,
  toolDefinitions: TOOL_DEFINITIONS,
  toolHandlers: TOOL_HANDLERS,
  getToolCatalog,
  isToolEnabled,
  setToolEnabled,
  setAllToolsEnabled,
  registerMcpServer,
  unregisterMcpServer,
  getEnabledToolDefinitions,
  getActiveServiceKey,
  refreshMcpAvailability,
};

if (typeof window.initApiReferences !== "function") {
  window.initApiReferences = function(refs) {
    window.apiReferences = refs || {};
  };
}
