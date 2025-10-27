/**
 * Network layer for the Responses API.
 */

import {
  DEFAULT_VERBOSITY,
  DEFAULT_REASONING_EFFORT,
  ensureApiKey,
  getActiveModel,
  getActiveServiceKey,
  getBaseUrl,
  supportsReasoningEffort,
} from './clientConfig.js';
import {
  buildDeveloperMessage,
  collectFunctionCalls,
  serializeMessagesForRequest,
} from './messageUtils.js';
import {
  getEnabledToolDefinitions,
  refreshMcpAvailability,
} from './toolManager.js';
import { getActiveVectorStoreIds } from '../vectorStore.js';

const DEFAULT_INCLUDE_FIELDS = [
  'code_interpreter_call.outputs',
  // 'reasoning.encrypted_content',
  'web_search_call.action.sources',
];

export function buildRequestBody({
  inputMessages,
  instructions,
  tools,
  model,
  verbosity,
  reasoningEffort,
  stream,
  previousResponseId,
}) {
  const targetModel = model || getActiveModel();
  const allowReasoning = supportsReasoningEffort(targetModel);
  const serviceKey = getActiveServiceKey();
  const payload = {
    model: targetModel,
    text: {
      format: { type: 'text' },
      verbosity: verbosity || DEFAULT_VERBOSITY,
    },
    input: serializeMessagesForRequest(inputMessages),
    store: true,
  };
  if (serviceKey !== 'xai') {
    payload.include = [...DEFAULT_INCLUDE_FIELDS];
  }
  if (allowReasoning && serviceKey !== 'xai') {
    payload.reasoning = {
      effort: reasoningEffort || DEFAULT_REASONING_EFFORT,
      summary: 'auto',
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
  if (serviceKey === 'xai' && payload.text) {
    const usesServerSideTools = Array.isArray(tools) && tools.some(tool => {
      if (!tool || typeof tool !== 'object') {
        return false;
      }
      const type = typeof tool.type === 'string' ? tool.type.toLowerCase() : '';
      return type === 'web_search' || type === 'x_search' || type === 'code_interpreter';
    });
    if (usesServerSideTools) {
      delete payload.text;
    }
  }
  return payload;
}

export function buildHeaders() {
  const apiKey = ensureApiKey();
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

export async function executeStreamingRequest(body, abortController) {
  const endpoint = `${getBaseUrl()}/responses`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
    signal: abortController ? abortController.signal : undefined,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Responses API error ${response.status}: ${text || response.statusText}`);
  }
  return response;
}

export async function executeNonStreamingRequest(body, abortController) {
  const endpoint = `${getBaseUrl()}/responses`;
  const headers = buildHeaders();
  headers.Accept = 'application/json';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: abortController ? abortController.signal : undefined,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Responses API error ${response.status}: ${text || response.statusText}`);
  }
  return response.json();
}

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
}) {
  const baseMessages = Array.isArray(inputMessages)
    ? inputMessages.filter(msg => msg && msg.role !== 'developer' && msg.role !== 'system')
    : [];
  let previousResponseId = null;
  let previousAssistantHadImages = false;
  for (let i = baseMessages.length - 1; i >= 0; i -= 1) {
    const candidate = baseMessages[i];
    if (candidate && candidate.role === 'assistant' && candidate.responseId) {
      previousResponseId = candidate.responseId;
      previousAssistantHadImages = Boolean(candidate.hasImages);
      break;
    }
  }
  const serviceKey = getActiveServiceKey();
  const workingMessages = serializeMessagesForRequest(baseMessages);
  const developerContent = buildDeveloperMessage(model);
  if (developerContent) {
    // xAI (Grok) requires 'system' role instead of 'developer'
    const systemRole = serviceKey === 'xai' ? 'system' : 'developer';
    workingMessages.unshift({
      role: systemRole,
      content: developerContent,
      id: 'developer-message',
    });
  }
    if (serviceKey !== 'xai') {
      await refreshMcpAvailability(true);
    }
    let enabledTools = getEnabledToolDefinitions(serviceKey);
    // Safety filter: ensure MCP tools are never included when using xAI
    if (serviceKey === 'xai' && Array.isArray(enabledTools)) {
      enabledTools = enabledTools.filter(tool => tool.type !== 'mcp');
    }
    
    // Handle file_search tool: attach ALL active vector stores (persisted + explicitly active)
    if (enabledTools) {
      const idsSet = new Set();
      try {
        const activeIds = getActiveVectorStoreIds ? getActiveVectorStoreIds() : [];
        if (Array.isArray(activeIds)) {
          activeIds.forEach(id => { if (id) idsSet.add(id); });
        }
      } catch (e) {
        // non-fatal
      }
      if (vectorStoreId) {
        idsSet.add(vectorStoreId);
      }
      const vectorStoreIds = Array.from(idsSet);
      if (vectorStoreIds.length > 0) {
        enabledTools = enabledTools.map(tool => {
          if (tool && tool.type === 'file_search') {
            return {
              ...tool,
              vector_store_ids: vectorStoreIds,
            };
          }
          return tool;
        });
      } else {
        // Remove file_search tool if no vector stores are available
        enabledTools = enabledTools.filter(tool => tool.type !== 'file_search');
      }
    }
  // Aggregate across multiple Responses API cycles (e.g., when tools are called)
  let aggregateText = '';
  let aggregateReasoning = '';

  while (true) {
    const body = buildRequestBody({
      inputMessages: workingMessages,
      instructions: typeof instructions === 'string' && instructions.trim() ? instructions : undefined,
      tools: enabledTools,
      model,
      verbosity,
      reasoningEffort,
      stream,
      previousResponseId: previousAssistantHadImages ? previousResponseId : null,
    });

    let responsePayload = null;
    let streamedText = '';
    let streamedReasoning = '';

    if (stream) {
      const streamResponse = await executeStreamingRequest(body, abortController);
      const result = await window.handleStreamedResponse(streamResponse, loadingId);
      responsePayload = result.response;
      streamedText = result.outputText || '';
      streamedReasoning = result.reasoningText || '';
    } else {
      responsePayload = await executeNonStreamingRequest(body, abortController);
      streamedText = responsePayload.output_text || '';
      const flattenContent = (items) => items
        .map(item => {
          if (typeof item === 'string') {
            return item;
          }
          if (item && typeof item === 'object') {
            if (typeof item.content === 'string') {
              return item.content;
            }
            if (typeof item.text === 'string') {
              return item.text;
            }
          }
          return '';
        })
        .join('');
      if (responsePayload.reasoning && typeof responsePayload.reasoning === 'string') {
        streamedReasoning = responsePayload.reasoning;
      } else if (responsePayload.reasoning && Array.isArray(responsePayload.reasoning)) {
        streamedReasoning = flattenContent(responsePayload.reasoning);
      } else if (responsePayload.reasoning && Array.isArray(responsePayload.reasoning.output)) {
        streamedReasoning = responsePayload.reasoning.output.map(item => item?.content || '').join('');
      } else if (typeof responsePayload.reasoning_content === 'string') {
        streamedReasoning = responsePayload.reasoning_content;
      } else if (Array.isArray(responsePayload.reasoning_content)) {
        streamedReasoning = flattenContent(responsePayload.reasoning_content);
      } else if (responsePayload.reasoning && typeof responsePayload.reasoning === 'object' && typeof responsePayload.reasoning.content === 'string') {
        streamedReasoning = responsePayload.reasoning.content;
      }
    }

    // Accumulate text and reasoning across multiple response cycles
    if (streamedText) {
      if (aggregateText) aggregateText += '\n\n';
      aggregateText += streamedText;
    }
    if (streamedReasoning) {
      if (aggregateReasoning) aggregateReasoning += '\n\n';
      aggregateReasoning += streamedReasoning;
    }

    if (!responsePayload) {
      if ((abortController && abortController.signal && abortController.signal.aborted) || window.shouldStopGeneration) {
        throw new DOMException('Request aborted', 'AbortError');
      }
      throw new Error('Responses API did not return a final payload.');
    }

    const rawCalls = collectFunctionCalls(responsePayload.output || []);
    const actionableCalls = rawCalls
      .map(call => {
        let handler = window.responsesClient?.toolHandlers?.[call.name];
        if (!handler && window.toolImplementations) {
          handler = window.toolImplementations[call.name];
        }
        if (!handler) {
          if (window.VERBOSE_LOGGING) {
            console.info(`Skipping server-managed tool call '${call.name || '<unknown>'}'`);
          }
          return null;
        }
        return { ...call, handler };
      })
      .filter(Boolean);

    if (!actionableCalls.length) {
      return {
        response: responsePayload,
        outputText: (aggregateText || streamedText || responsePayload.output_text || ''),
        reasoningText: (aggregateReasoning || streamedReasoning || ''),
      };
    }

    const preferToolCallFor = (toolName) =>
      serviceKey === 'xai' && (toolName === 'web_search' || toolName === 'x_search' || toolName === 'code_interpreter');

    actionableCalls.forEach(call => {
      const resolvedCallId = call.callId || `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      call.callId = resolvedCallId;
      if (preferToolCallFor(call.name)) {
        const toolCallPart = call.toolCallInput
          ? JSON.parse(JSON.stringify(call.toolCallInput))
          : null;
        const ensureArguments = (part) => {
          if (!part.function || typeof part.function !== 'object') {
            part.function = {
              name: call.name,
              arguments: (typeof call.argsJson === 'string' && call.argsJson.trim())
                ? call.argsJson
                : JSON.stringify(call.argsDict || {}),
            };
          } else {
            part.function.name = part.function.name || call.name;
            if (!part.function.arguments) {
              part.function.arguments = (typeof call.argsJson === 'string' && call.argsJson.trim())
                ? call.argsJson
                : JSON.stringify(call.argsDict || {});
            }
          }
          return part;
        };
        const normalizedPart = ensureArguments(toolCallPart || {
          type: 'tool_call',
          id: resolvedCallId,
          function: {
            name: call.name,
            arguments: (typeof call.argsJson === 'string' && call.argsJson.trim())
              ? call.argsJson
              : JSON.stringify(call.argsDict || {}),
          },
        });
        if (!normalizedPart.id) {
          normalizedPart.id = resolvedCallId;
        }
        workingMessages.push({
          role: 'assistant',
          content: [normalizedPart],
        });
        return;
      }

      const serializedArgs = (typeof call.argsJson === 'string' && call.argsJson.trim())
        ? call.argsJson
        : JSON.stringify(call.argsDict || {});
      workingMessages.push({
        type: 'function_call',
        name: call.name,
        arguments: serializedArgs,
        call_id: resolvedCallId,
      });
    });

    for (const call of actionableCalls) {
      let result;
      try {
        result = await call.handler(call.argsDict || {});
      } catch (error) {
        result = { error: error.message || 'Function execution failed' };
      }
      const resolvedCallId = call.callId || `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const normalizedOutput = typeof result === 'string' ? result : JSON.stringify(result);
      if (preferToolCallFor(call.name)) {
        const resultPayload = {
          type: 'tool_result',
          tool_call_id: resolvedCallId,
          output: normalizedOutput,
        };
        if (result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'error')) {
          resultPayload.is_error = true;
        }
        workingMessages.push({
          role: 'tool',
          tool_call_id: resolvedCallId,
          content: [resultPayload],
        });
      } else {
        workingMessages.push({
          type: 'function_call_output',
          call_id: resolvedCallId,
          output: normalizedOutput,
        });
      }
    }
  }
}
