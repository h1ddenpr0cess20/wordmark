/**
 * Prompt assembly and response parsing for the autonomous-work loop.
 *
 * @remarks
 * Two prompts live here. {@link buildRunInstructions} is folded into the
 * developer message while a run is active, so the model knows it is working
 * toward a goal across several turns rather than answering a one-off question.
 * {@link buildContinuationPrompt} drives the out-of-band decision made after
 * each turn: keep going, and with what next instruction, or stop.
 *
 * Both are pure string functions, kept apart from
 * {@link ./agentRunner.ts | the engine} so the wording and the parser are
 * testable without a provider.
 */

import type { ContinuationDecision, ContinuationVerdict } from "../../../types/agent.ts";

/** How much of a turn's output the continuation decision gets to see. */
const OUTPUT_EXCERPT_LIMIT = 4000;

/** How much of the goal is echoed into the decision prompt. */
const GOAL_EXCERPT_LIMIT = 2000;

/** Trims `text` to `limit` characters, marking the cut. */
function excerpt(text: string, limit: number): string {
  const trimmed = (text || "").trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit)}\n…[truncated]`;
}

/**
 * The guidance appended to the developer message while a run is active.
 *
 * @remarks
 * Says three things the model cannot infer from the transcript: that its reply
 * is one step of a longer effort, that it can schedule its own next steps, and
 * that finishing is something it has to declare rather than drift into. The
 * `queue_followup` sentence is conditional because the tool is not offered to
 * every provider/model combination — promising a tool that will not be in the
 * request is how you get a model narrating tool calls it never makes.
 *
 * @param goal - The instruction that opened the run.
 * @param turnsUsed - Turns spent, counting the one being built. The budget is
 * charged as a turn is dispatched, so this is the current turn's number.
 * @param maxTurns - The run's ceiling.
 * @param canQueue - Whether `queue_followup` is actually in this request.
 */
export function buildRunInstructions(
  goal: string,
  turnsUsed: number,
  maxTurns: number,
  canQueue: boolean,
): string {
  const turnNumber = Math.max(1, turnsUsed);
  const remaining = Math.max(0, maxTurns - turnNumber);
  const lines = [
    "## Autonomous work in progress",
    `You are working through a multi-step task rather than answering a single question. The overall goal is:\n\n${excerpt(goal, GOAL_EXCERPT_LIMIT)}`,
    `This is turn ${turnNumber} of at most ${maxTurns}; ${remaining} further turn${remaining === 1 ? "" : "s"} remain after this one before the run pauses for the user.`,
    "Make concrete progress on the goal this turn — actually do the next piece of work, using your tools where they help. Do not restate the plan without advancing it.",
  ];
  if (canQueue) {
    lines.push(
      "Call `queue_followup` when you can already name the next steps; each one is sent back to you as its own turn, so write them as self-contained instructions.",
    );
  }
  lines.push(
    "When the goal is fully met, say so plainly and stop. If you are blocked on something only the user can supply — a credential, a decision, a file — say that instead of guessing.",
  );
  return lines.join("\n\n");
}

/**
 * Builds the out-of-band prompt that decides whether the run continues.
 *
 * @remarks
 * Deliberately asked outside the conversation: the deciding call sees a
 * summary rather than the transcript, so it cannot be talked into continuing by
 * an assistant turn that ends with an enthusiastic "shall I keep going?". The
 * pipe-delimited reply keeps parsing trivial across providers that ignore
 * structured-output requests.
 *
 * @param goal - The run's originating instruction.
 * @param lastOutput - The assistant text from the turn that just settled.
 * @param turnsUsed - Turns spent so far.
 * @param maxTurns - The run's ceiling.
 * @param pendingSteps - Steps already queued, so the decision does not
 * duplicate work that is about to happen anyway.
 */
export function buildContinuationPrompt(
  goal: string,
  lastOutput: string,
  turnsUsed: number,
  maxTurns: number,
  pendingSteps: string[] = [],
): string {
  const pending = pendingSteps.length
    ? `\n\nAlready queued (do not repeat these):\n${pendingSteps.map(step => `- ${excerpt(step, 200)}`).join("\n")}`
    : "";
  return [
    "You are supervising an assistant working through a multi-step task. Judge only whether the work is finished, and reply in exactly one line.",
    "",
    "Format: <STATUS>|<detail>",
    "  CONTINUE|<the single next instruction to give the assistant, written as a direct imperative>",
    "  DONE|<one sentence on what was accomplished>",
    "  BLOCKED|<what the user must supply before work can continue>",
    "",
    "Answer DONE when the goal has been met, or when the remaining work needs a decision only the user can make. Answer CONTINUE only when there is concrete, unambiguous work left that the assistant can do on its own. Never answer CONTINUE with a request for confirmation or a suggestion to review.",
    "",
    `Goal:\n${excerpt(goal, GOAL_EXCERPT_LIMIT)}`,
    "",
    `Turns used: ${turnsUsed} of ${maxTurns}.`,
    "",
    `Most recent assistant output:\n${excerpt(lastOutput, OUTPUT_EXCERPT_LIMIT) || "(no output)"}`,
    pending,
  ].join("\n");
}

/** Recognized verdict words, in the order they are searched for. */
const VERDICTS: ContinuationVerdict[] = ["continue", "done", "blocked"];

/**
 * Parses a continuation reply into a verdict and its detail.
 *
 * @remarks
 * Tolerant by design: models decorate single-line formats with markdown,
 * quotes, and preambles. Anything that cannot be read as a verdict becomes
 * `done`, because the safe failure for a loop that spends money is to stop.
 */
export function parseContinuationDecision(raw: string): ContinuationDecision {
  const text = (raw || "").trim();
  if (!text) {
    return { verdict: "done", detail: "The continuation check returned nothing." };
  }

  const [head, ...rest] = text.split("|");
  const headWord = head.replace(/[^a-z]/gi, "").toLowerCase();
  const verdict = VERDICTS.find(candidate => headWord === candidate);
  const detail = rest.join("|").trim();

  if (verdict) {
    return { verdict, detail: stripDecoration(detail) };
  }

  // No leading verdict: fall back to the first one mentioned anywhere, so a
  // reply like "Status: DONE - the report is written" is still usable.
  const lowered = text.toLowerCase();
  const mentioned = VERDICTS
    .map(candidate => ({ candidate, at: lowered.indexOf(candidate) }))
    .filter(found => found.at !== -1)
    .sort((a, b) => a.at - b.at)[0];
  if (mentioned) {
    return { verdict: mentioned.candidate, detail: stripDecoration(text) };
  }
  return { verdict: "done", detail: "The continuation check was unreadable." };
}

/** Strips wrapping quotes, list bullets, and markdown emphasis from a detail. */
function stripDecoration(detail: string): string {
  return detail
    .replace(/^[\s>*_-]+/, "")
    .replace(/[\s*_]+$/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

/** Shortens an instruction into a chip-sized label. */
export function stepLabel(instruction: string, limit = 60): string {
  const flat = (instruction || "").replace(/\s+/g, " ").trim();
  if (flat.length <= limit) {
    return flat;
  }
  return `${flat.slice(0, limit - 1).trimEnd()}…`;
}
