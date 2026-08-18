/**
 * The `queue_followup` tool: the model's own handle on the work queue.
 *
 * @remarks
 * Registers into the shared {@link ../toolImplementations.ts} registry at load
 * time, the same way the memory and image tools do. Going through the registry
 * rather than `TOOL_HANDLERS` matters here: the handler needs the run engine,
 * the run engine needs the request client, and the request client imports the
 * tool manager — registering there would close that circle.
 *
 * The handler is deliberately chatty in its return value. A queued step is
 * invisible to the model until the turn arrives, so the result has to say
 * exactly what was accepted; when the queue's depth cap truncates a batch,
 * silently dropping the tail would leave the model believing in work that will
 * never happen.
 */

import { createScopedLogger } from "../../utils/logger.ts";
import { toolImplementations } from "../toolImplementations.ts";
import { agentRunner } from "./agentRunner.ts";
import { isAgentModeEnabled } from "./agentSettings.ts";

const logAgent = createScopedLogger("agent");

/** The tool's name as the provider sees it. */
export const QUEUE_FOLLOWUP_TOOL_NAME = "queue_followup";

/** What the tool reports back to the model. */
interface QueueFollowupResult {
  queued: number;
  rejected?: number;
  steps?: string[];
  error?: string;
  note?: string;
}

/**
 * Queues the model's own follow-up instructions as steps of the active run.
 *
 * @param args - `{ steps }`, the instructions in the order they should run.
 * @returns A summary of what was accepted, and why anything was not.
 */
export function queueFollowup(args: { steps?: unknown } = {}): QueueFollowupResult {
  if (!isAgentModeEnabled()) {
    return { queued: 0, error: "Autonomous work is switched off, so follow-up steps cannot be queued." };
  }
  if (!agentRunner.isActive()) {
    return { queued: 0, error: "No autonomous run is in progress, so there is nothing to queue steps onto." };
  }

  const steps = Array.isArray(args?.steps)
    ? args.steps.filter((step): step is string => typeof step === "string" && step.trim().length > 0)
    : [];
  if (steps.length === 0) {
    return { queued: 0, error: "No usable steps were supplied. Pass `steps` as an array of instruction strings." };
  }

  const accepted: string[] = [];
  for (const step of steps) {
    if (!agentRunner.queueStep(step)) {
      break;
    }
    accepted.push(step.trim());
  }

  logAgent("queue_followup accepted", accepted.length, "of", steps.length, "step(s)");

  const result: QueueFollowupResult = { queued: accepted.length, steps: accepted };
  if (accepted.length < steps.length) {
    result.rejected = steps.length - accepted.length;
    result.note = "The queue is full; the remaining steps were not accepted. Queue them again once these have run.";
  } else {
    result.note = "Queued. Each step will be sent back to you as its own turn, in order.";
  }
  return result;
}

toolImplementations[QUEUE_FOLLOWUP_TOOL_NAME] = queueFollowup;
