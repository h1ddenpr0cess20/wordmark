/**
 * Shared types for conversation messages and Responses-API payloads.
 *
 * @remarks
 * These model app-internal message objects plus the (loosely specified)
 * provider response items. Provider items carry many optional, version- and
 * vendor-specific fields, so the raw item/tool-call shapes keep an index
 * signature for pass-through; the fields the app actually reads are named.
 */

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
  dataUrl?: string | null;
  url?: string;
  type?: string;
  id?: string;
  inlineDataRemoved?: boolean;
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
  reasoning?: string;
  codeInterpreterOutputs?: unknown;
  timestamp?: string;
  /** Party mode: the character that authored this message. */
  character?: { name: string };
  /** True when generation was stopped before completing this message. */
  incomplete?: boolean;
  /**
   * Alternate generations for an assistant message. Populated lazily the first
   * time a message is regenerated; index 0 is the original response.
   */
  variants?: MessageVariant[];
  /** Index into {@link variants} of the version currently displayed. */
  activeVariant?: number;
  [key: string]: unknown;
}

/** A single alternate generation of an assistant message. */
export interface MessageVariant {
  content: string;
  reasoning?: string;
  responseId?: string;
  codeInterpreterOutputs?: unknown;
  hasImages?: boolean;
  /** True when this variant was stopped before completing. */
  incomplete?: boolean;
}

/**
 * The internal "rendered message" object passed to the message-content
 * updaters. All fields are optional; `response` carries the raw provider
 * payload (parsed at that boundary) and is intentionally untyped.
 */
export interface StreamedMessageContent {
  content?: string;
  reasoning?: string;
  codeInterpreterOutputs?: unknown;
  response?: unknown;
  /** Party mode: the character authoring this message. */
  character?: { name: string };
  /** True when generation was stopped before completing this message. */
  incomplete?: boolean;
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

/**
 * A Responses-API response object: the parsed body of a non-streaming
 * request, or the `response` field of a `response.completed` event.
 *
 * Only `output` (and `id`) have a stable, cross-provider shape and are named.
 * Other fields (`output_text`, `reasoning`/`reasoning_content`, vendor
 * extensions) vary by provider and are read defensively at the parse sites,
 * so they pass through the index signature as `unknown`.
 */
export interface ResponseObject {
  id?: string;
  model?: string;
  output?: ResponseOutputItem[];
  [key: string]: unknown;
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
  temperature?: number;
  maxOutputTokens?: number;
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
  /**
   * Party mode: replaces the auto-built developer/system message with this exact
   * system prompt. When omitted, the standard developer message is used.
   */
  systemOverride?: string;
  /**
   * Party mode: restricts enabled tools to these catalog keys. `undefined` keeps
   * the default enabled-tool set; an empty array runs the turn tool-free.
   */
  allowedTools?: string[];
  /** Optional sampling temperature (set only when provided). */
  temperature?: number;
}

/** Result of a completed `runTurn` cycle. */
export interface RunTurnResult {
  response: ResponseObject | null;
  outputText: string;
  reasoningText: string;
  /** True when the turn was halted early by a stop/abort. */
  stopped?: boolean;
}
