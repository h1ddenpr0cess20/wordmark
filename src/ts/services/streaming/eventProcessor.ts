/**
 * Streaming event processor.
 *
 * @remarks
 * Dispatches Responses API stream events to the streaming runtime, translating
 * each event type into the corresponding text, reasoning, and tool-output
 * updates.
 */

import type { createStreamingRuntime } from "./runtime.ts";
import {
  bufferAppend,
  bufferGet,
  previewLines,
  safeTruncate,
  formatArgsBlock,
  extractQueriesFromArgs,
  extractDeltaText,
  extractReasoningText,
} from "./eventParsing.ts";
import { createScopedLogger } from "../../utils/logger.ts";
import { showWarning } from "../../utils/notifications.ts";
import { ACTIVATE_SKILL_TOOL_NAME, READ_SKILL_RESOURCE_TOOL_NAME } from "../skills/skills.ts";
import { getSkillById } from "../skills/skillsStore.ts";

type StreamingRuntime = ReturnType<typeof createStreamingRuntime>;

const logStream = createScopedLogger("stream");

/** Reasoning-panel header for a tool call, with friendly labels for skill tools. */
function toolReasoningLabel(name: string): string {
  if (name === ACTIVATE_SKILL_TOOL_NAME) {
    return "loading skill";
  }
  if (name === READ_SKILL_RESOURCE_TOOL_NAME) {
    return "reading skill resource";
  }
  return `🔧 ${name}`;
}

/** Resolves the display name for an activated skill from a function call's raw arguments. */
function activatedSkillName(rawArgs: string | undefined): string | null {
  if (!rawArgs) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawArgs);
    const id = typeof parsed?.skill_id === "string" ? parsed.skill_id : "";
    if (!id) {
      return null;
    }
    return getSkillById(id)?.name || id;
  } catch {
    return null;
  }
}

/**
 * Creates the SSE event processor for a streaming turn. The returned handler
 * accumulates per-call argument/code buffers and tool-call queues, and drives
 * the provided {@link StreamingRuntime} as deltas and lifecycle events arrive.
 */
export function createStreamingEventProcessor(runtime: StreamingRuntime) {
  const argBuffers = new Map<string, string>();
  const mcpArgBuffers = new Map<string, string>();
  const codeBuffers = new Map<string, string>();
  const webSearchQueue: string[] = [];
  const webSearchById = new Map<string, string>();
  const xSearchQueue: string[] = [];
  const xSearchById = new Map<string, string>();
  const activeCodeStreams = new Set<string>();
  const activeCustomInput = new Set<string>();
  const toolExecutions = new Map<string, { name: string; status: string; startTime: number }>();

  let finalResponsePayload: any = null;
  let responseStartOffset = 0;
  let expectNewResponse = false;

  /**
   * Builds the four lifecycle handlers (in_progress/searching/completed/failed)
   * for a query-bearing search tool. The handlers share identical bookkeeping —
   * pulling the pending query off `queue`, remembering it per item id in `byId`,
   * and emitting reasoning lines — and differ only in the display label/emoji
   * and the "searching…" verb shown while the call is in flight.
   */
  function makeSearchHandlers(
    label: string,
    emoji: string,
    inProgressVerb: string,
    queue: string[],
    byId: Map<string, string>,
  ) {
    return {
      inProgress(payload: any) {
        const id = payload.item_id || "";
        let q = "";
        if (byId.has(id)) {
          q = byId.get(id) || "";
        } else if (queue.length > 0) {
          q = queue.shift() || "";
          if (id) byId.set(id, q);
        }
        beginToolBlock(`**${emoji} ${label}${q ? ` "${safeTruncate(q, 60)}"` : ""}**:`);
        runtime.appendReasoningLine(`  ⏳ _${inProgressVerb}…_`);
      },
      searching(payload: any) {
        const id = payload.item_id || "";
        const q = byId.get(id) || "";
        runtime.updateLastReasoningLine(`  🔍 _searching${q ? ` "${safeTruncate(q, 60)}"` : ""}…_`);
      },
      completed(payload: any) {
        const id = payload.item_id || "";
        runtime.appendReasoningLine("  ✔️ _completed_");
        runtime.appendReasoningLine("");
        if (id) byId.delete(id);
      },
      failed(payload: any) {
        const id = payload.item_id || "";
        const error = payload?.error?.message || "failed";
        runtime.appendReasoningLine(`  ❌ _failed: ${error}_`);
        runtime.appendReasoningLine("");
        if (id) byId.delete(id);
      },
    };
  }

  const webSearch = makeSearchHandlers("web_search", "🌐", "searching web", webSearchQueue, webSearchById);
  const xSearch = makeSearchHandlers("x_search", "🐦", "searching X", xSearchQueue, xSearchById);

  /**
   * Emits a fenced (```) reasoning block containing a length-capped preview of
   * `text`, optionally preceded by an indented `header` line. Centralizes the
   * shell/code-interpreter output rendering that otherwise repeats per output
   * kind.
   */
  function appendFencedPreview(text: string, limit: number, header?: string, language = "") {
    if (header) runtime.appendReasoningLine(header);
    runtime.appendReasoningLine(`  \`\`\`${language}`);
    previewLines(text, limit).forEach(line => runtime.appendReasoningLine(`  ${line}`));
    runtime.appendReasoningLine("  ```");
  }

  /**
   * Starts a tool block in the reasoning panel: a blank separator line (so the
   * header begins a fresh markdown paragraph after streamed reasoning prose or
   * a previous block) followed by the bold header line.
   */
  function beginToolBlock(header: string) {
    runtime.appendReasoningLine("");
    runtime.appendReasoningLine(header);
  }

  /** Renders tool-call arguments as a fenced code block under an `args:` label. */
  function appendArgsBlock(args: unknown, label = "  args:") {
    const block = formatArgsBlock(args);
    if (block) {
      appendFencedPreview(block, 20, label, "json");
    }
  }

  function ensureResponseSegment() {
    if (!expectNewResponse) return;
    const current = runtime.getOutputText();
    if (current.trim().length > 0 && !current.endsWith("\n\n")) {
      runtime.appendOutputText(current.endsWith("\n") ? "\n" : "\n\n");
    }
    responseStartOffset = runtime.getOutputLength();
    expectNewResponse = false;
  }

  function processEvent(eventType: string | null, dataLines: string[]) {
    if (!dataLines.length) {
      return;
    }
    const dataStr = dataLines.join("\n").trim();
    if (!dataStr) {
      return;
    }

    let payload;
    try {
      payload = JSON.parse(dataStr);
    } catch (err) {
      console.error("Failed to parse SSE payload:", eventType || "<no-event>", err, dataStr);
      return;
    }
    if (!payload || typeof payload !== "object") {
      return;
    }

    const effectiveType = eventType || payload.type || "";
    const isImageGenerationEvent = effectiveType && (
      effectiveType.includes("image_generation") ||
      effectiveType.includes("image_edit") ||
      effectiveType.includes("image_variation") ||
      effectiveType === "image_generation_call"
    );

    if (isImageGenerationEvent) {
      runtime.collectImagesFromSource(payload, effectiveType);
      if (payload.delta && typeof payload.delta === "object") {
        runtime.collectImagesFromSource(payload.delta, `${effectiveType}:delta`);
      }
    }

    switch (effectiveType) {
    case "response.output_text.delta": {
      const delta = extractDeltaText(payload);
      if (delta) {
        ensureResponseSegment();
        runtime.appendOutputText(delta);
      }
      break;
    }
    case "response.reasoning.delta":
    case "response.reasoning_text.delta":
    case "response.reasoning_summary_text.delta": {
      const delta = extractDeltaText(payload);
      if (delta) {
        runtime.appendReasoningDelta(delta);
      }
      break;
    }
    case "response.reasoning.done":
    case "response.reasoning_text.done":
    case "response.reasoning_summary_text.done": {
      const full = extractReasoningText(payload);
      if (typeof full === "string" && full.trim().length > 0) {
        const current = runtime.getReasoningText();
        // Deltas for this text usually streamed already; only append when the
        // full text isn't in the accumulated reasoning, to avoid duplication.
        if (!current.includes(full.trim())) {
          if (current.trim().length > 0) {
            runtime.appendReasoningDelta(current.endsWith("\n") ? "\n" : "\n\n");
          }
          runtime.appendReasoningDelta(full);
        }
      }
      break;
    }
    case "response.reasoning_summary_part.added": {
      // Reasoning summaries arrive as separate parts; separate them with a
      // blank line so consecutive parts don't run together.
      const current = runtime.getReasoningText();
      if (current.trim().length > 0 && !current.endsWith("\n\n")) {
        runtime.appendReasoningDelta(current.endsWith("\n") ? "\n" : "\n\n");
      }
      break;
    }
    case "response.reasoning_summary_part.done":
    case "response.content_part.added":
    case "response.content_part.done":
    case "response.output_text.annotation.added": {
      break;
    }
    case "response.delta": {
      const innerType = (payload && (payload.type || (payload.delta && payload.delta.type))) || "";
      const deltaText = extractDeltaText(payload);
      if (innerType.includes("reasoning")) {
        if (deltaText) {
          runtime.appendReasoningDelta(deltaText);
        }
        break;
      }
      if (deltaText) {
        ensureResponseSegment();
        runtime.appendOutputText(deltaText);
      }
      break;
    }
    case "response.output_item.added": {
      const item = payload?.item || null;
      const itype = item?.type ? String(item.type).toLowerCase() : "";
      const itemId = item?.id || "";

      if (itype === "shell_call") {
        toolExecutions.set(itemId, {
          name: "shell",
          status: "started",
          startTime: Date.now(),
        });
        beginToolBlock("**🖥️ shell**:");
        const cmds = item?.action?.commands;
        if (Array.isArray(cmds) && cmds.length > 0) {
          appendFencedPreview(cmds.map((c: string) => `$ ${c}`).join("\n"), 10, undefined, "bash");
        }
        runtime.appendReasoningLine("  ⏳ _executing…_");
      } else if (itype === "mcp_call") {
        const name = item?.name || "mcp";
        const serverLabel = typeof item?.server_label === "string" && item.server_label ? `${item.server_label}.` : "";
        toolExecutions.set(itemId, {
          name,
          status: "started",
          startTime: Date.now(),
        });
        beginToolBlock(`**🔧 ${serverLabel}${name}**:`);
      } else if (itype === "mcp_list_tools") {
        const serverLabel = typeof item?.server_label === "string" && item.server_label ? ` ${item.server_label}` : "";
        beginToolBlock(`**🔧 mcp${serverLabel}**:`);
        runtime.appendReasoningLine("  ⏳ _listing tools…_");
      } else if ((itype.includes("tool") || itype.includes("function")) && !itype.includes("output")) {
        const name = item?.name || item?.tool_name || item?.function?.name || "tool";
        toolExecutions.set(itemId, {
          name,
          status: "started",
          startTime: Date.now(),
        });
        beginToolBlock(`**${toolReasoningLabel(name)}**:`);
      }
      break;
    }
    case "response.output_item.done": {
      const item = payload?.item || null;
      const itype = item?.type ? String(item.type).toLowerCase() : "";
      const itemId = item?.id || "";

      if (itype === "shell_call") {
        const exec = toolExecutions.get(itemId);
        if (exec) {
          const duration = Date.now() - exec.startTime;
          runtime.appendReasoningLine(`  ✔️ _completed in ${duration}ms_`);
          runtime.appendReasoningLine("");
          toolExecutions.delete(itemId);
        }
      } else if (itype === "shell_call_output") {
        const outputList = Array.isArray(item?.output) ? item.output : [];
        for (const out of outputList) {
          if (!out || typeof out !== "object") continue;
          const stdout = typeof out.stdout === "string" ? out.stdout.trim() : "";
          const stderr = typeof out.stderr === "string" ? out.stderr.trim() : "";
          const outcome = out.outcome || {};
          if (stdout) {
            appendFencedPreview(stdout, 15);
          }
          if (stderr) {
            appendFencedPreview(stderr, 10, "  ⚠️ stderr:");
          }
          if (outcome.type === "exit" && typeof outcome.exit_code === "number" && outcome.exit_code !== 0) {
            runtime.appendReasoningLine(`  ❌ _exit code: ${outcome.exit_code}_`);
          }
          if (outcome.type === "timeout") {
            runtime.appendReasoningLine("  ⏳ _timed out_");
          }
        }
        runtime.appendReasoningLine("");
      } else if (itype.includes("code_interpreter")) {
        const ciRoot = item?.code_interpreter_call || item;
        const ciOutputs = ciRoot?.results || ciRoot?.outputs || ciRoot?.output || [];
        const outputArr = Array.isArray(ciOutputs) ? ciOutputs : [];
        const topLogs = typeof ciRoot?.logs === "string" ? ciRoot.logs.trim() : "";
        if (topLogs) {
          appendFencedPreview(topLogs, 20, "  📄 output:");
        }
        for (const out of outputArr) {
          if (!out || typeof out !== "object") continue;
          const outType = typeof out.type === "string" ? out.type.toLowerCase() : "";
          if (outType.includes("log") || outType === "stderr") {
            const raw = out.logs ?? out.text ?? out.content ?? "";
            const text = Array.isArray(raw) ? raw.join("\n") : (raw ? String(raw) : "");
            if (text && text.trim()) {
              appendFencedPreview(text.trim(), 20, "  📄 output:");
            }
          } else if (outType.includes("image") || outType.includes("file")) {
            const filename = out.filename || out.name || out.file_id || out.fileId || "";
            if (filename) {
              runtime.appendReasoningLine(`  📄 _${filename}_`);
            }
          }
        }
      } else if (itype === "mcp_call") {
        const exec = toolExecutions.get(itemId);
        const mcpOutput = typeof item?.output === "string" ? item.output.trim() : "";
        const mcpError = typeof item?.error === "string"
          ? item.error
          : (item?.error && typeof item.error.message === "string" ? item.error.message : "");
        if (mcpOutput) {
          appendFencedPreview(mcpOutput, 15, "  📄 output:");
        }
        if (mcpError) {
          runtime.appendReasoningLine(`  ❌ _failed: ${safeTruncate(mcpError, 200)}_`);
        } else if (exec) {
          runtime.appendReasoningLine(`  ✔️ _completed in ${Date.now() - exec.startTime}ms_`);
        }
        runtime.appendReasoningLine("");
        toolExecutions.delete(itemId);
      } else if (itype === "mcp_list_tools") {
        runtime.updateLastReasoningLine("  ✔️ _tools listed_");
        runtime.appendReasoningLine("");
      } else if ((itype.includes("tool") || itype.includes("function")) && !itype.includes("output")) {
        const exec = toolExecutions.get(itemId);
        if (exec) {
          if (exec.name === ACTIVATE_SKILL_TOOL_NAME) {
            const bufferedArgs = argBuffers.get(`${itemId}|${exec.name}`) ?? argBuffers.get(`${itemId}|`);
            const skillName = activatedSkillName(item?.arguments ?? bufferedArgs);
            if (skillName) {
              runtime.appendReasoningLine(`  _loaded skill: ${skillName}_`);
            }
          }
          const duration = Date.now() - exec.startTime;
          runtime.appendReasoningLine(`  ✔️ _completed in ${duration}ms_`);
          runtime.appendReasoningLine("");
          toolExecutions.delete(itemId);
        }
      }
      break;
    }
    case "response.tool_call.delta": {
      break;
    }
    case "response.tool_call.completed": {
      break;
    }
    case "response.tool_call.failed": {
      const error = payload?.error?.message || payload?.message || "failed";
      runtime.appendReasoningLine(`  ❌ _failed: ${error}_`);
      runtime.appendReasoningLine("");
      break;
    }
    case "response.function_call_arguments.delta": {
      const name = payload.name || payload?.function?.name || "";
      const itemId = payload.item_id || payload.item?.id || "";
      const key = `${itemId}|${name}`;
      const delta = typeof payload.delta === "string" ? payload.delta : extractDeltaText(payload);
      bufferAppend(argBuffers, key, delta || "");
      break;
    }
    case "response.function_call_arguments.done": {
      const name = payload.name || payload?.function?.name || "";
      const itemId = payload.item_id || payload.item?.id || "";
      const key = `${itemId}|${name}`;
      const args = typeof payload.arguments === "string"
        ? payload.arguments
        : (payload.arguments ? JSON.stringify(payload.arguments) : "");
      if (args) argBuffers.set(key, args);

      appendArgsBlock(args || bufferGet(argBuffers, key));

      const normalizedName = (name || "").toLowerCase();
      if (normalizedName === "web_search") {
        const qs = extractQueriesFromArgs(args || "");
        qs.forEach(q => webSearchQueue.push(q));
      } else if (normalizedName === "x_search") {
        const qs = extractQueriesFromArgs(args || "");
        qs.forEach(q => xSearchQueue.push(q));
      }
      break;
    }
    case "response.function_call_arguments.failed": {
      runtime.appendReasoningLine("  ❌ _args failed_");
      break;
    }
    case "response.mcp_call_arguments.delta": {
      const itemId = payload.item_id || payload.item?.id || "";
      const delta = typeof payload.delta === "string" ? payload.delta : extractDeltaText(payload);
      bufferAppend(mcpArgBuffers, itemId, delta || "");
      break;
    }
    case "response.mcp_call_arguments.done": {
      const itemId = payload.item_id || payload.item?.id || "";
      const args = typeof payload.arguments === "string"
        ? payload.arguments
        : (payload.arguments ? JSON.stringify(payload.arguments) : "");
      if (args) mcpArgBuffers.set(itemId, args);

      appendArgsBlock(args || bufferGet(mcpArgBuffers, itemId));

      const qs = extractQueriesFromArgs(args || "");
      qs.forEach(q => webSearchQueue.push(q));
      break;
    }
    case "response.mcp_call.in_progress": {
      runtime.appendReasoningLine("  ⏳ _executing…_");
      break;
    }
    case "response.mcp_call.completed": {
      break;
    }
    case "response.mcp_call.failed": {
      const errorMessage = payload?.error?.message || "failed";
      const errorCode = payload?.error?.code;
      const detail = errorCode ? `${errorCode}: ${errorMessage}` : errorMessage;
      runtime.appendReasoningLine(`  ❌ _failed: ${detail}_`);
      runtime.appendReasoningLine("");
      showWarning(`MCP server call failed (${detail}). The server may be offline or unreachable.`);
      break;
    }
    case "response.file_search_call.in_progress": {
      beginToolBlock("**🔎 file_search**:");
      runtime.appendReasoningLine("  ⏳ _searching…_");
      break;
    }
    case "response.file_search_call.searching": {
      runtime.updateLastReasoningLine("  🔍 _searching files…_");
      break;
    }
    case "response.file_search_call.completed": {
      runtime.appendReasoningLine("  ✔️ _completed_");
      runtime.appendReasoningLine("");
      break;
    }
    case "response.file_search_call.failed": {
      const error = payload?.error?.message || "failed";
      runtime.appendReasoningLine(`  ❌ _failed: ${error}_`);
      runtime.appendReasoningLine("");
      break;
    }
    case "response.web_search_call.in_progress": {
      webSearch.inProgress(payload);
      break;
    }
    case "response.web_search_call.searching": {
      webSearch.searching(payload);
      break;
    }
    case "response.web_search_call.completed": {
      webSearch.completed(payload);
      break;
    }
    case "response.web_search_call.failed": {
      webSearch.failed(payload);
      break;
    }
    case "response.x_search_call.in_progress": {
      xSearch.inProgress(payload);
      break;
    }
    case "response.x_search_call.searching": {
      xSearch.searching(payload);
      break;
    }
    case "response.x_search_call.completed": {
      xSearch.completed(payload);
      break;
    }
    case "response.x_search_call.failed": {
      xSearch.failed(payload);
      break;
    }
    case "response.code_interpreter_call.in_progress": {
      beginToolBlock("**💻 code_interpreter**:");
      break;
    }
    case "response.code_interpreter_call.interpreting": {
      runtime.appendReasoningLine("  ▶️ _executing…_");
      break;
    }
    case "response.code_interpreter_call.completed": {
      runtime.appendReasoningLine("  ✔️ _completed_");
      runtime.appendReasoningLine("");
      break;
    }
    case "response.code_interpreter_call.failed": {
      const error = payload?.error?.message || "failed";
      runtime.appendReasoningLine(`  ❌ _failed: ${error}_`);
      runtime.appendReasoningLine("");
      break;
    }
    case "response.code_interpreter_call_code.delta": {
      const itemId = payload.item_id || "";
      const delta = typeof payload.delta === "string" ? payload.delta : extractDeltaText(payload);
      bufferAppend(codeBuffers, itemId, delta || "");
      if (!activeCodeStreams.has(itemId)) {
        runtime.appendReasoningLine("  📝 _code streaming…_");
        activeCodeStreams.add(itemId);
      }
      break;
    }
    case "response.code_interpreter_call_code.done": {
      const itemId = payload.item_id || "";
      const code = typeof payload.code === "string"
        ? payload.code
        : (payload.code ? JSON.stringify(payload.code) : bufferGet(codeBuffers, itemId));
      if (code && code.length > 0) {
        appendFencedPreview(code, 30, undefined, "python");
      }
      activeCodeStreams.delete(itemId);
      break;
    }
    case "response.image_generation_call.in_progress": {
      beginToolBlock("**🎨 image_generation**:");
      runtime.appendReasoningLine("  ⏳ _preparing…_");
      break;
    }
    case "response.image_generation_call.generating": {
      runtime.updateLastReasoningLine("  🖌️ _generating image…_");
      break;
    }
    case "response.image_generation_call.completed": {
      runtime.appendReasoningLine("  ✔️ _completed_");
      runtime.appendReasoningLine("");
      break;
    }
    case "response.image_generation_call.failed": {
      const error = payload?.error?.message || "failed";
      runtime.appendReasoningLine(`  ❌ _failed: ${error}_`);
      runtime.appendReasoningLine("");
      break;
    }
    case "response.image_generation_call.partial_image": {
      const idx = typeof payload.partial_image_index === "number" ? payload.partial_image_index : 0;
      runtime.appendReasoningLine(`  🖼️ _image ${idx+1} generated_`);
      break;
    }
    case "response.custom_tool_call_input.delta": {
      if (!activeCustomInput.has("custom")) {
        runtime.appendReasoningLine("  📥 _receiving input…_");
        activeCustomInput.add("custom");
      }
      break;
    }
    case "response.custom_tool_call_input.done": {
      const input = typeof payload.input === "string" ? payload.input : (payload.input ? JSON.stringify(payload.input) : "");
      appendArgsBlock(input, "  input:");
      activeCustomInput.delete("custom");
      break;
    }
    case "response.refusal.delta": {
      const delta = extractDeltaText(payload);
      if (delta && !activeCustomInput.has("refusal")) {
        runtime.appendReasoningLine("⛔ Content Policy Refusal:");
        activeCustomInput.add("refusal");
      }
      break;
    }
    case "response.refusal.done": {
      const refusal = typeof payload.refusal === "string" ? payload.refusal : (payload.refusal ? JSON.stringify(payload.refusal) : "");
      if (refusal) {
        runtime.appendReasoningLine(`  ${safeTruncate(refusal || "")}`);
      }
      activeCustomInput.delete("refusal");
      break;
    }
    case "response.queued":
    case "response.created":
    case "response.in_progress": {
      break;
    }
    case "error": {
      const code = payload.code || "";
      const message = payload.message || "Unknown error";
      runtime.appendReasoningLine(`⚠️ error ${code} ${message}`);
      break;
    }
    case "response.output_text.done": {
      const fullText = extractDeltaText(payload);
      if (fullText) {
        if (expectNewResponse) {
          ensureResponseSegment();
        }
        runtime.replaceOutputSegment(responseStartOffset, fullText);
        expectNewResponse = true;
      }
      break;
    }
    case "response.error": {
      const message = payload.error?.message || payload.message || "Unknown streaming error";
      runtime.appendReasoningLine(`⚠️ response.error ${safeTruncate(message)}`);
      if (payload.response) {
        finalResponsePayload = payload.response;
      }
      break;
    }
    case "response.completed": {
      if (payload.response) {
        finalResponsePayload = payload.response;
      }
      runtime.ensureReasoningTrailingNewline();
      break;
    }
    default: {
      if (!finalResponsePayload && payload.response) {
        finalResponsePayload = payload.response;
      } else {
        logStream("unhandled event type:", effectiveType || "<empty>");
      }
      break;
    }
    }
  }

  return {
    processEvent,
    finalize: () => {
      runtime.ensureReasoningTrailingNewline();
    },
    getFinalResponsePayload: () => (finalResponsePayload ? { ...finalResponsePayload } : null),
    attachImages: (payload: Record<string, any> | null) => runtime.attachImagesToPayload(payload),
  };
}
