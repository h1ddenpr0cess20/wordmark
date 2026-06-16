/**
 * Tool-call execution for a Responses API turn.
 *
 * @remarks
 * Given the actionable tool calls collected from a model response, appends the
 * corresponding assistant tool-call messages, runs each call's handler, and
 * appends the results back onto the working message list — choosing the
 * `tool_call`/`tool_result` shape for server-managed providers and the
 * `function_call`/`function_call_output` shape otherwise. Extracted from
 * {@link ./requestClient.ts}'s `runTurn` loop to keep that orchestration readable.
 */

import { usesServerManagedTools } from "../providers.ts";
import type { CollectedFunctionCall, Message, ToolCallLike } from "../../../types/api.ts";

/** A collected function call paired with the resolved handler that implements it. */
export type ActionableCall = CollectedFunctionCall & {
  handler: (...args: unknown[]) => unknown;
};

/**
 * Appends assistant tool-call messages and their executed results to
 * `workingMessages` for the given calls.
 *
 * @param actionableCalls - Calls with resolved handlers; each is stamped with a
 * `callId`.
 * @param workingMessages - The request message list, mutated in place.
 * @param serviceKey - Active service key, used to pick the message shape.
 */
export async function executeToolCalls(
  actionableCalls: ActionableCall[],
  workingMessages: Message[],
  serviceKey: string,
): Promise<void> {
  const preferToolCallFor = (toolName: string): boolean =>
    usesServerManagedTools(serviceKey) && (toolName === "web_search" || toolName === "x_search" || toolName === "code_interpreter");

  actionableCalls.forEach((call: ActionableCall) => {
    const resolvedCallId = call.callId || `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    call.callId = resolvedCallId;
    if (preferToolCallFor(call.name)) {
      const toolCallPart = call.toolCallInput
        ? JSON.parse(JSON.stringify(call.toolCallInput))
        : null;
      const ensureArguments = (part: ToolCallLike): ToolCallLike => {
        if (!part.function || typeof part.function !== "object") {
          part.function = {
            name: call.name,
            arguments: (typeof call.argsJson === "string" && call.argsJson.trim())
              ? call.argsJson
              : JSON.stringify(call.argsDict || {}),
          };
        } else {
          part.function.name = part.function.name || call.name;
          if (!part.function.arguments) {
            part.function.arguments = (typeof call.argsJson === "string" && call.argsJson.trim())
              ? call.argsJson
              : JSON.stringify(call.argsDict || {});
          }
        }
        return part;
      };
      const normalizedPart = ensureArguments(toolCallPart || {
        type: "tool_call",
        id: resolvedCallId,
        function: {
          name: call.name,
          arguments: (typeof call.argsJson === "string" && call.argsJson.trim())
            ? call.argsJson
            : JSON.stringify(call.argsDict || {}),
        },
      });
      if (!normalizedPart.id) {
        normalizedPart.id = resolvedCallId;
      }
      workingMessages.push({
        role: "assistant",
        content: [normalizedPart],
      });
      return;
    }

    const serializedArgs = (typeof call.argsJson === "string" && call.argsJson.trim())
      ? call.argsJson
      : JSON.stringify(call.argsDict || {});
    workingMessages.push({
      type: "function_call",
      name: call.name,
      arguments: serializedArgs,
      call_id: resolvedCallId,
    });
  });

  for (const call of actionableCalls) {
    let result: unknown;
    try {
      result = await call.handler(call.argsDict || {});
    } catch (error) {
      result = { error: (error instanceof Error && error.message) || "Function execution failed" };
    }
    const resolvedCallId = call.callId || `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const normalizedOutput = typeof result === "string" ? result : JSON.stringify(result);
    if (preferToolCallFor(call.name)) {
      const resultPayload: Record<string, unknown> = {
        type: "tool_result",
        tool_call_id: resolvedCallId,
        output: normalizedOutput,
      };
      if (result && typeof result === "object" && Object.prototype.hasOwnProperty.call(result, "error")) {
        resultPayload.is_error = true;
      }
      workingMessages.push({
        role: "tool",
        tool_call_id: resolvedCallId,
        content: [resultPayload],
      });
    } else {
      workingMessages.push({
        type: "function_call_output",
        call_id: resolvedCallId,
        output: normalizedOutput,
      });
    }
  }
}
