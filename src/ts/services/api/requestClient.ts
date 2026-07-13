/**
 * Network layer for the Responses API.
 */

import { state } from "../../init/state.ts";
import { logVerbose } from "../../utils/logger.ts";
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
import { stripSkillToolMessages } from "../skills/skills.ts";
import { windowMessagesByTokenBudget } from "./tokenBudget.ts";
import {
  serviceSupportsReasoning,
  supportsResponseIncludeFields,
  usesServerManagedTools,
  instructionMessageRole,
} from "../providers.ts";
import { extractOutputText, extractReasoningText } from "./responseNormalization.ts";
import {
  getEnabledToolDefinitions,
  isClientSideToolType,
  refreshMcpAvailability,
  supportsClientSideTools,
  TOOL_HANDLERS,
} from "./toolManager.ts";
import { applyVectorStoreIds } from "./vectorStoreTools.ts";
import { isImageGenerationToolName } from "./staticTools.ts";
import { toolImplementations } from "../toolImplementations.ts";
import { handleStreamedResponse } from "../streaming.ts";
import { executeToolCalls, type ActionableCall } from "./toolCallExecution.ts";
import { showImageWaitSpinnerById, hideImageWaitSpinnerById } from "../../components/ui/imageWaitSpinner.ts";
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
 * @param options - The turn's request inputs.
 * @param options.inputMessages - Conversation messages serialized into `input`.
 * @param options.instructions - Optional developer/system instructions block.
 * @param options.tools - Tool definitions to advertise; omitted when empty.
 * @param options.model - Target model; defaults to the active model.
 * @param options.verbosity - Text verbosity; defaults to `DEFAULT_VERBOSITY`.
 * @param options.reasoningEffort - Reasoning effort; applied only when the
 *   model and service support reasoning.
 * @param options.stream - Whether to request a streamed response.
 * @param options.previousResponseId - Prior response id for multi-turn chaining.
 * @param options.temperature - Sampling temperature; included only when finite.
 * @param options.maxOutputTokens - Output-token cap; included only when finite.
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
  temperature,
  maxOutputTokens,
}: BuildRequestOptions): Record<string, unknown> {
  const targetModel = model || getActiveModel();
  const allowReasoning = supportsReasoningEffort(targetModel);
  const serviceKey = getActiveServiceKey();
  state.lastUsedModel = targetModel;
  state.lastUsedService = serviceKey;
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
  if (typeof temperature === "number" && Number.isFinite(temperature)) {
    payload.temperature = temperature;
  }
  if (typeof maxOutputTokens === "number" && Number.isFinite(maxOutputTokens)) {
    payload.max_output_tokens = maxOutputTokens;
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
  systemOverride,
  allowedTools,
  temperature,
}: RunTurnOptions): Promise<RunTurnResult> {
  const baseMessages = stripSkillToolMessages(
    Array.isArray(inputMessages)
      ? inputMessages.filter(msg => msg && msg.role !== "developer" && msg.role !== "system")
      : [],
  );
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
  const developerContent = typeof systemOverride === "string" ? systemOverride : buildDeveloperMessage();
  if (developerContent) {
    workingMessages.unshift({
      role: instructionMessageRole(serviceKey),
      content: developerContent,
      id: "developer-message",
    });
  }
  await refreshMcpAvailability(true);
  let enabledTools = getEnabledToolDefinitions(serviceKey, resolvedModel, allowedTools);
  const clientSideToolsSupported = supportsClientSideTools(serviceKey, resolvedModel);

  enabledTools = applyVectorStoreIds(enabledTools, vectorStoreId);
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
      temperature,
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

    const wasStopped = (abortController && abortController.signal && abortController.signal.aborted)
      || state.shouldStopGeneration;

    if (wasStopped) {
      return {
        response: responsePayload,
        outputText: aggregateText,
        reasoningText: aggregateReasoning,
        stopped: true,
      };
    }

    if (!responsePayload) {
      throw new Error("Responses API did not return a final payload.");
    }

    const rawCalls = collectFunctionCalls(responsePayload.output || []);
    const actionableCalls: ActionableCall[] = rawCalls
      .map((call: CollectedFunctionCall): ActionableCall | null => {
        const handler = TOOL_HANDLERS[call.name] || toolImplementations[call.name];
        if (!handler) {
          logVerbose(`Skipping server-managed tool call '${call.name || "<unknown>"}'`);
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

    const awaitingImage = actionableCalls.some(call => isImageGenerationToolName(call.name));
    if (awaitingImage) {
      showImageWaitSpinnerById(loadingId || "");
    }
    try {
      await executeToolCalls(actionableCalls, workingMessages, serviceKey);
    } finally {
      if (awaitingImage) {
        hideImageWaitSpinnerById(loadingId || "");
      }
    }
  }
}
