/**
 * Network layer for the Responses API.
 */

import { state } from "../../init/state.ts";
import {
  DEFAULT_VERBOSITY,
  DEFAULT_REASONING_EFFORT,
  getActiveModel,
  getActiveServiceKey,
  supportsReasoningEffort,
} from "./clientConfig.ts";
import { executeStreamingRequest, executeNonStreamingRequest } from "./requestTransport.ts";
import {
  collectFunctionCalls,
  serializeMessagesForRequest,
} from "./messageUtils.ts";
import { buildDeveloperMessage } from "./instructions.ts";
import { windowMessagesByTokenBudget } from "./tokenBudget.ts";
import {
  serviceSupportsReasoning,
  supportsResponseIncludeFields,
  usesServerManagedTools,
} from "../providers.ts";
import { extractOutputText, extractReasoningText } from "./responseNormalization.ts";
import {
  getEnabledToolDefinitions,
  isClientSideToolType,
  refreshMcpAvailability,
  supportsClientSideTools,
  TOOL_HANDLERS,
} from "./toolManager.ts";
import { getActiveVectorStoreIds } from "../vectorStore.ts";
import { toolImplementations } from "../toolImplementations.ts";
import { handleStreamedResponse } from "../streaming.ts";
import { executeToolCalls, type ActionableCall } from "./toolCallExecution.ts";
import type {
  BuildRequestOptions,
  CollectedFunctionCall,
  ResponseObject,
  RunTurnOptions,
  RunTurnResult,
} from "../../../types/api.ts";
import type { ToolDefinition } from "../../../types/tools.ts";

const DEFAULT_INCLUDE_FIELDS = [
  "code_interpreter_call.outputs",
  "web_search_call.action.sources",
];

/**
 * Constructs a Responses API request payload from a turn's options, applying
 * provider-specific shaping: include fields, reasoning config, and dropping the
 * `text` block for server-managed tool calls.
 *
 * @returns The JSON-serializable request body.
 */
export function buildRequestBody({
  inputMessages,
  instructions,
  tools,
  model,
  verbosity,
  reasoningEffort,
  stream,
  previousResponseId,
}: BuildRequestOptions): Record<string, unknown> {
  const targetModel = model || getActiveModel();
  const allowReasoning = supportsReasoningEffort(targetModel);
  const serviceKey = getActiveServiceKey();
  const payload: Record<string, unknown> = {
    model: targetModel,
    text: {
      format: { type: "text" },
      verbosity: verbosity || DEFAULT_VERBOSITY,
    },
    input: serializeMessagesForRequest(inputMessages),
    store: true,
  };
  if (supportsResponseIncludeFields(serviceKey)) {
    payload.include = [...DEFAULT_INCLUDE_FIELDS];
  }
  if (allowReasoning && serviceSupportsReasoning(serviceKey)) {
    payload.reasoning = {
      effort: reasoningEffort || DEFAULT_REASONING_EFFORT,
      summary: "auto",
    };
  }
  if (instructions) {
    payload.instructions = instructions;
  }
  if (Array.isArray(tools) && tools.length > 0) {
    payload.tools = tools;
  }
  if (stream) {
    payload.stream = true;
  }
  if (previousResponseId) {
    payload.previous_response_id = previousResponseId;
  }
  if (usesServerManagedTools(serviceKey) && payload.text) {
    const usesServerSideTools = Array.isArray(tools) && tools.some((tool: ToolDefinition) => {
      if (!tool || typeof tool !== "object") {
        return false;
      }
      const type = typeof tool.type === "string" ? tool.type.toLowerCase() : "";
      return type === "web_search" || type === "x_search" || type === "code_interpreter" || type === "mcp";
    });
    if (usesServerSideTools) {
      delete payload.text;
    }
  }
  return payload;
}

/** Builds request headers, adding a Bearer token when the active service has a key. */
/**
 * Runs one conversation turn end to end: windows the history to the token
 * budget, prepends the developer/system message, resolves enabled tools and
 * vector stores, then drives the multi-turn tool-execution loop (streaming or
 * non-streaming) until a final response is produced.
 *
 * @returns `{ response, outputText, reasoningText }` for the completed turn.
 */
export async function runTurn({
  inputMessages,
  instructions,
  model,
  verbosity,
  reasoningEffort,
  stream = true,
  loadingId,
  abortController,
  vectorStoreId,
  historyTokenBudget = 0,
}: RunTurnOptions): Promise<RunTurnResult> {
  const baseMessages = Array.isArray(inputMessages)
    ? inputMessages.filter(msg => msg && msg.role !== "developer" && msg.role !== "system")
    : [];
  let previousResponseId: string | null = null;
  let previousAssistantHadImages = false;
  for (let i = baseMessages.length - 1; i >= 0; i -= 1) {
    const candidate = baseMessages[i];
    if (candidate && candidate.role === "assistant" && candidate.responseId) {
      previousResponseId = candidate.responseId ?? null;
      previousAssistantHadImages = Boolean(candidate.hasImages);
      break;
    }
  }
  const serviceKey = getActiveServiceKey();
  const resolvedModel = model || getActiveModel();
  const windowedMessages = windowMessagesByTokenBudget(baseMessages, historyTokenBudget);
  const workingMessages = serializeMessagesForRequest(windowedMessages);
  const developerContent = buildDeveloperMessage();
  if (developerContent) {
    const systemRole = serviceKey === "xai" ? "system" : "developer";
    workingMessages.unshift({
      role: systemRole,
      content: developerContent,
      id: "developer-message",
    });
  }
  await refreshMcpAvailability(true);
  let enabledTools = getEnabledToolDefinitions(serviceKey, resolvedModel);
  const clientSideToolsSupported = supportsClientSideTools(serviceKey, resolvedModel);

  if (enabledTools) {
    const idsSet = new Set<string>();
    try {
      const activeIds = getActiveVectorStoreIds ? getActiveVectorStoreIds() : [];
      if (Array.isArray(activeIds)) {
        activeIds.forEach(id => { if (id) idsSet.add(id); });
      }
    } catch {
      /* non-fatal */
    }
    if (vectorStoreId) {
      idsSet.add(vectorStoreId);
    }
    const vectorStoreIds = Array.from(idsSet);
    if (vectorStoreIds.length > 0) {
      enabledTools = enabledTools.map(tool => {
        if (tool && tool.type === "file_search") {
          return {
            ...tool,
            vector_store_ids: vectorStoreIds,
          };
        }
        return tool;
      });
    } else {
      enabledTools = enabledTools.filter(tool => tool.type !== "file_search");
    }
  }
  let aggregateText = "";
  let aggregateReasoning = "";

  const MAX_TOOL_CALL_ITERATIONS = 20;
  let toolCallIteration = 0;

  while (true) {
    if (++toolCallIteration > MAX_TOOL_CALL_ITERATIONS) {
      throw new Error(`Tool call loop exceeded maximum of ${MAX_TOOL_CALL_ITERATIONS} iterations`);
    }
    const body = buildRequestBody({
      inputMessages: workingMessages,
      instructions: typeof instructions === "string" && instructions.trim() ? instructions : undefined,
      tools: enabledTools,
      model: resolvedModel,
      verbosity,
      reasoningEffort,
      stream,
      previousResponseId: previousAssistantHadImages ? previousResponseId : null,
    });

    let responsePayload: ResponseObject | null = null;
    let streamedText = "";
    let streamedReasoning = "";

    try {
      if (stream) {
        const streamResponse = await executeStreamingRequest(body, abortController);
        const result = await handleStreamedResponse(streamResponse, loadingId || "");
        responsePayload = result.response;
        streamedText = result.outputText || "";
        streamedReasoning = result.reasoningText || "";
      } else {
        responsePayload = await executeNonStreamingRequest(body, abortController);
        streamedText = extractOutputText(responsePayload);
        streamedReasoning = extractReasoningText(responsePayload);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const shouldRetryWithoutClientSideTools = clientSideToolsSupported === false
        && Array.isArray(enabledTools)
        && enabledTools.some((tool: ToolDefinition) => isClientSideToolType(tool?.type))
        && message.includes("Client side tool is not supported for multi-agent models");
      if (shouldRetryWithoutClientSideTools) {
        enabledTools = enabledTools.filter((tool: ToolDefinition) => !isClientSideToolType(tool?.type));
        if (state.verboseLogging) {
          console.warn(`Retrying xAI request for '${resolvedModel}' without client-side tools.`);
        }
        continue;
      }
      throw error;
    }

    if (streamedText) {
      if (aggregateText) aggregateText += "\n\n";
      aggregateText += streamedText;
    }
    if (streamedReasoning) {
      if (aggregateReasoning) aggregateReasoning += "\n\n";
      aggregateReasoning += streamedReasoning;
    }

    if (!responsePayload) {
      if ((abortController && abortController.signal && abortController.signal.aborted) || state.shouldStopGeneration) {
        throw new DOMException("Request aborted", "AbortError");
      }
      throw new Error("Responses API did not return a final payload.");
    }

    const rawCalls = collectFunctionCalls(responsePayload.output || []);
    const actionableCalls: ActionableCall[] = rawCalls
      .map((call: CollectedFunctionCall): ActionableCall | null => {
        const handler = TOOL_HANDLERS[call.name] || toolImplementations[call.name];
        if (!handler) {
          if (state.verboseLogging) {
            console.info(`Skipping server-managed tool call '${call.name || "<unknown>"}'`);
          }
          return null;
        }
        return { ...call, handler };
      })
      .filter((call): call is ActionableCall => call !== null);

    if (!actionableCalls.length) {
      return {
        response: responsePayload,
        outputText: (aggregateText || streamedText || extractOutputText(responsePayload)),
        reasoningText: (aggregateReasoning || streamedReasoning || ""),
      };
    }

    await executeToolCalls(actionableCalls, workingMessages, serviceKey);
  }
}
