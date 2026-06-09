// Shared types for conversation messages and Responses-API payloads.
//
// These model app-internal message objects plus the (loosely specified)
// provider response items. Provider items carry many optional, version- and
// vendor-specific fields, so the raw item/tool-call shapes keep an index
// signature for pass-through; the fields the app actually reads are named.

import type { ToolDefinition } from "./tools.ts";

/** A single content part of a structured message. */
export interface ContentPart {
  type?: string;
  text?: string;
  output?: string;
  image_url?: string;
  [key: string]: unknown;
}

/** A file/image attachment carried alongside a user message. */
export interface Attachment {
  filename?: string;
  dataUrl?: string;
  url?: string;
  type?: string;
  [key: string]: unknown;
}

/** A conversation message as stored in `state.conversationHistory`. */
export interface Message {
  role?: string;
  type?: string;
  name?: string;
  id?: string;
  content?: string | ContentPart[] | ContentPart;
  attachments?: Attachment[];
  arguments?: unknown;
  call_id?: string;
  output?: unknown;
  tool_call_id?: string;
  tool_calls?: ToolCallLike[];
  responseId?: string;
  hasImages?: boolean;
  [key: string]: unknown;
}

/** A function/tool call as embedded in a provider response. */
export interface ToolCallLike {
  type?: string;
  name?: string;
  tool_name?: string;
  function?: { name?: string; arguments?: unknown };
  id?: string;
  call_id?: string;
  arguments?: unknown;
  mode?: string;
  [key: string]: unknown;
}

/** A top-level item in a Responses-API `output` array. */
export interface ResponseOutputItem extends ToolCallLike {
  content?: ToolCallLike[];
  tool_calls?: ToolCallLike[];
}

/** A normalized function call extracted from a response by `collectFunctionCalls`. */
export interface CollectedFunctionCall {
  name: string;
  argsDict: Record<string, unknown>;
  argsJson: string;
  callId: string | null;
  toolCallInput: ToolCallLike;
}

/** Options for `buildRequestBody`. */
export interface BuildRequestOptions {
  inputMessages?: Message[];
  instructions?: string;
  tools?: ToolDefinition[];
  model?: string;
  verbosity?: string;
  reasoningEffort?: string;
  stream?: boolean;
  previousResponseId?: string | null;
}

/** Options for `runTurn`. */
export interface RunTurnOptions {
  inputMessages?: Message[];
  instructions?: string;
  model?: string;
  verbosity?: string;
  reasoningEffort?: string;
  stream?: boolean;
  loadingId?: string | null;
  abortController?: AbortController | null;
  vectorStoreId?: string | null;
  historyTokenBudget?: number;
}

/** Result of a completed `runTurn` cycle. */
export interface RunTurnResult {
  response: any;
  outputText: string;
  reasoningText: string;
}
