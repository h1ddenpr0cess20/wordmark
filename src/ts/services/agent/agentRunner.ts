/**
 * The autonomous-work engine: turns the prompt queue into a goal-directed run.
 *
 * @remarks
 * Ordinary chat is one request per keystroke. A run keeps going on its own: the
 * model may schedule its next steps with `queue_followup`, and when it does not,
 * a cheap out-of-band decision after each turn either writes the next
 * instruction or declares the work finished. Either way the next step lands in
 * {@link ../../components/promptQueue.ts | the queue} as an `agent` entry, and
 * the existing drain sends it as a normal turn — so a run reuses the whole
 * streaming, tool-calling, compaction, and persistence pipeline unchanged.
 *
 * Three things bound it, because a loop that can feed itself can also spend
 * money forever:
 *
 * - a **turn budget**, after which the run pauses and asks for more,
 * - a **failure rule** — an errored, empty, or stopped turn pauses the run
 *   instead of sending the next step into whatever broke,
 * - the **queue depth cap**, which refuses a runaway backlog outright.
 *
 * The engine deliberately does not call `sendMessage` itself. It decides what
 * should happen next and records it; {@link ../../components/interaction.ts}
 * owns the sending. That keeps the dependency one-directional and leaves a
 * single place where a turn is started.
 */

import { state } from "../../init/state.ts";
import { createScopedLogger } from "../../utils/logger.ts";
import { showInfo, showError } from "../../utils/notifications.ts";
import { buildRequestBody } from "../api/requestClient.ts";
import { executeNonStreamingRequest } from "../api/requestTransport.ts";
import { extractOutputText } from "../api/responseNormalization.ts";
import { getActiveModel } from "../api/clientConfig.ts";
import {
  clearPromptQueue,
  enqueuePrompt,
  queuedPromptCount,
  queuedPrompts,
} from "../../components/promptQueue.ts";
import {
  buildContinuationPrompt,
  parseContinuationDecision,
  stepLabel,
} from "./agentPrompts.ts";
import { agentMaxTurns, isAgentModeEnabled } from "./agentSettings.ts";
import type { AgentRunState, AgentRunStatus } from "../../../types/agent.ts";

const logAgent = createScopedLogger("agent");

/**
 * Output cap for the continuation decision.
 *
 * @remarks
 * The reply is one line. The ceiling is generous only because reasoning models
 * spend tokens before emitting it, and a decision truncated to nothing parses
 * as `done` — stopping a run that should have continued.
 */
const DECISION_MAX_OUTPUT_TOKENS = 2048;

/** How the turn that just settled ended, as far as the run is concerned. */
export type TurnOutcome = "ok" | "failed";

/** Statuses in which the run is finished and the bar offers a fresh start. */
const TERMINAL: AgentRunStatus[] = ["done", "blocked"];

/**
 * The autonomous-run singleton. Use {@link agentRunner}; do not instantiate
 * directly elsewhere.
 */
class AgentRunner {
  private controller: AbortController | null = null;
  private deciding = false;
  private nextRunNumber = 0;

  /**
   * The run in progress, or `null`.
   *
   * @remarks
   * Held on the shared app state rather than in a private field so the
   * developer-message builder can read it without importing this module — that
   * import would close a cycle back through the request client.
   */
  private get run(): AgentRunState | null {
    return state.agentRun;
  }

  private set run(value: AgentRunState | null) {
    state.agentRun = value;
  }

  /** A copy of the current run, or `null` when idle. */
  snapshot(): AgentRunState | null {
    return this.run ? { ...this.run } : null;
  }

  /** Whether a run is mid-flight (not paused, exhausted, or finished). */
  isRunning(): boolean {
    return this.run?.status === "running";
  }

  /** Whether a run exists at all, in any state. */
  isActive(): boolean {
    return this.run !== null;
  }

  /**
   * Whether the drain may send agent-authored entries right now.
   *
   * @remarks
   * The single gate on unattended sending. User-composed entries never consult
   * it — someone who typed a message is entitled to have it sent whatever the
   * run is doing.
   */
  mayDrainAgentEntries(): boolean {
    return this.isRunning() && this.run !== null && this.run.turnsUsed < this.run.maxTurns;
  }

  /**
   * Opens a run for `goal`, replacing any run already in progress.
   *
   * @remarks
   * Called for a user-initiated send while autonomous work is enabled. Queued
   * agent entries only exist inside a run, so a draining follow-up can never
   * reach here and reset the budget mid-run.
   */
  start(goal: string): AgentRunState | null {
    const trimmed = (goal || "").trim();
    if (!trimmed || state.partyMode) {
      return null;
    }
    if (this.run) {
      this.discardPlannedSteps();
    }
    this.run = {
      id: `run-${++this.nextRunNumber}`,
      goal: trimmed,
      status: "running",
      turnsUsed: 0,
      maxTurns: agentMaxTurns(),
    };
    logAgent("Run started:", this.run.id, "budget:", this.run.maxTurns);
    this.refreshControlBar();
    return this.snapshot();
  }

  /** Counts a turn against the budget. Called as each turn is dispatched. */
  noteTurnStarted(): void {
    if (!this.run) {
      return;
    }
    this.run.turnsUsed += 1;
    this.refreshControlBar();
  }

  /**
   * Decides what the run does now that a turn has settled.
   *
   * @remarks
   * The whole loop in one method: a failure pauses, work already queued is left
   * to drain, an exhausted budget pauses for confirmation, and anything else
   * consults the model. Returns once the next step (if any) is queued, so the
   * caller can drain immediately afterwards.
   */
  async afterTurn(outcome: TurnOutcome): Promise<void> {
    const run = this.run;
    if (!run || run.status !== "running") {
      return;
    }

    if (outcome === "failed") {
      this.halt("paused", "Paused after a turn failed — resume to retry.");
      return;
    }

    // Checked before the queue, not after: a `queue_followup` batch can be
    // longer than the budget left to send it, and a run that returned early
    // here would sit "running" forever while the drain refused its own steps.
    if (run.turnsUsed >= run.maxTurns) {
      this.halt("exhausted", `Used all ${run.maxTurns} turns. Continue to grant more.`);
      return;
    }

    // The model already said what comes next; no need to pay for a second
    // opinion. It drains on the caller's next pass.
    if (queuedPromptCount("agent") > 0) {
      logAgent("Steps already queued; skipping the continuation check.");
      return;
    }

    await this.decideNextStep(run);
  }

  /**
   * Asks, out of band, whether the run should continue and with what.
   *
   * @remarks
   * A plain non-streaming request rather than a conversation turn: it must not
   * stream into a bubble, must not advertise tools, and must not join the
   * transcript — the same shape compaction and Party mode's speaker choice use.
   */
  private async decideNextStep(run: AgentRunState): Promise<void> {
    if (this.deciding) {
      return;
    }
    this.deciding = true;
    this.controller = new AbortController();
    try {
      const body = buildRequestBody({
        inputMessages: [{
          role: "user",
          content: buildContinuationPrompt(
            run.goal,
            this.lastAssistantOutput(),
            run.turnsUsed,
            run.maxTurns,
          ),
        }],
        model: getActiveModel(),
        temperature: 0.2,
        reasoningEffort: "low",
        verbosity: "low",
        maxOutputTokens: DECISION_MAX_OUTPUT_TOKENS,
        stream: false,
      });
      const response = await executeNonStreamingRequest(body, this.controller);
      const decision = parseContinuationDecision(extractOutputText(response) || "");
      logAgent("Continuation decision:", decision.verdict, "—", decision.detail);

      // The run may have been stopped or redirected while the decision was in
      // flight; acting on a stale verdict would restart work the user ended.
      if (this.run !== run || run.status !== "running") {
        return;
      }

      if (decision.verdict === "continue" && decision.detail) {
        this.queueStep(decision.detail);
        return;
      }
      if (decision.verdict === "blocked") {
        this.halt("blocked", decision.detail || "Blocked — needs something from you.");
        return;
      }
      this.halt("done", decision.detail || "Finished.");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      logAgent("Continuation check failed:", error);
      this.halt("paused", "Paused — the continuation check failed. Resume to retry.");
    } finally {
      this.deciding = false;
      this.controller = null;
    }
  }

  /**
   * Queues an instruction as the run's next turn.
   *
   * @remarks
   * Also the `queue_followup` tool's landing point, which is why it tolerates
   * being called with no run in progress (it simply refuses) and reports how
   * many entries it actually accepted — the queue's depth cap can reject some
   * of a batch, and the model is told the truth about that.
   */
  queueStep(instruction: string): boolean {
    const run = this.run;
    const trimmed = (instruction || "").trim();
    if (!run || !trimmed) {
      return false;
    }
    const queued = enqueuePrompt(trimmed, [], [], {
      origin: "agent",
      label: stepLabel(trimmed),
      runId: run.id,
    });
    if (queued) {
      this.refreshControlBar();
    }
    return Boolean(queued);
  }

  /** Requests a pause; the in-flight turn finishes, nothing new is sent. */
  pause(): void {
    if (!this.run || this.run.status !== "running") {
      return;
    }
    this.halt("paused", "Paused — resume to keep working.");
  }

  /**
   * Resumes a paused or exhausted run.
   *
   * @remarks
   * Resuming an exhausted run grants a fresh budget rather than raising the
   * ceiling, so "continue" always means the same amount of further work no
   * matter how many times it is pressed. Any steps it had already planned are
   * still queued and resume with it.
   */
  resume(): void {
    const run = this.run;
    if (!run || run.status === "running") {
      return;
    }
    if (TERMINAL.includes(run.status)) {
      return;
    }
    if (run.status === "exhausted") {
      run.turnsUsed = 0;
      run.maxTurns = agentMaxTurns();
    }
    run.status = "running";
    run.note = undefined;
    logAgent("Run resumed:", run.id);
    this.refreshControlBar();
  }

  /** Ends the run and discards the steps it had planned. */
  stop(note = "Stopped."): void {
    if (!this.run) {
      return;
    }
    logAgent("Run stopped:", this.run.id);
    this.abortDecision();
    this.discardPlannedSteps();
    this.run = null;
    this.removeControlBar();
    if (note && showInfo) {
      showInfo(note);
    }
  }

  /** Clears the run without a notification — used when the conversation changes. */
  reset(): void {
    this.abortDecision();
    this.discardPlannedSteps();
    this.run = null;
    this.removeControlBar();
  }

  /** Moves the run to a non-running status and surfaces why. */
  private halt(status: AgentRunStatus, note: string): void {
    if (!this.run) {
      return;
    }
    this.run.status = status;
    this.run.note = note;
    logAgent("Run", this.run.id, "→", status, "—", note);
    // An exhausted run exists to be continued, so the plan it had queued
    // survives the pause and resumes with it. Every other halt is an ending;
    // steps left behind there would fire against a run the user let go.
    if (status !== "exhausted") {
      this.discardPlannedSteps();
    }
    this.refreshControlBar();
    if (status === "done" && showInfo) {
      showInfo(`Autonomous run finished: ${note}`);
    } else if (status === "blocked" && showError) {
      showError(`Autonomous run blocked: ${note}`);
    }
  }

  /** Drops the run's queued steps, leaving anything the user typed alone. */
  private discardPlannedSteps(): void {
    const dropped = clearPromptQueue("agent");
    if (dropped > 0) {
      logAgent("Discarded", dropped, "planned step(s)");
    }
  }

  private abortDecision(): void {
    try {
      this.controller?.abort();
    } catch {
      /* noop */
    }
    this.controller = null;
  }

  /** The text of the most recent assistant message in the transcript. */
  private lastAssistantOutput(): string {
    const history = Array.isArray(state.conversationHistory) ? state.conversationHistory : [];
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const message = history[i];
      if (message?.role === "assistant" && typeof message.content === "string") {
        return message.content;
      }
    }
    return "";
  }

  private ensureControlBar(): HTMLElement | null {
    const existing = document.getElementById("agent-control-bar");
    if (existing) {
      return existing;
    }
    const container = document.getElementById("chat-container");
    const inputContainer = container?.querySelector(".input-container");
    if (!container || !inputContainer) {
      return null;
    }
    const bar = document.createElement("div");
    bar.id = "agent-control-bar";
    bar.setAttribute("aria-live", "polite");
    container.insertBefore(bar, inputContainer);
    return bar;
  }

  /** Renders the control bar to match the run's current status. */
  refreshControlBar(): void {
    const run = this.run;
    if (!run || !isAgentModeEnabled()) {
      this.removeControlBar();
      return;
    }
    const bar = this.ensureControlBar();
    if (!bar) {
      return;
    }
    bar.innerHTML = "";
    bar.dataset.status = run.status;

    const status = document.createElement("span");
    status.className = "agent-status";
    status.textContent = this.statusText(run);
    bar.appendChild(status);

    const budget = document.createElement("span");
    budget.className = "agent-budget";
    budget.textContent = `${run.turnsUsed}/${run.maxTurns} turns`;
    bar.appendChild(budget);

    if (run.status === "running") {
      bar.appendChild(this.button("Pause", () => this.pause()));
    } else if (!TERMINAL.includes(run.status)) {
      bar.appendChild(this.button(run.status === "exhausted" ? "Continue" : "Resume", () => this.resume()));
    }
    bar.appendChild(this.button(TERMINAL.includes(run.status) ? "Dismiss" : "Stop", () => this.stop("")));
  }

  /** The one-line description of what the run is doing. */
  private statusText(run: AgentRunState): string {
    const pending = queuedPrompts().filter(entry => entry.origin === "agent").length;
    switch (run.status) {
    case "running":
      return pending > 0
        ? `Working — ${pending} step${pending === 1 ? "" : "s"} queued. Type any time to redirect.`
        : "Working — type any time to redirect.";
    case "exhausted":
    case "paused":
    case "blocked":
    case "done":
      return run.note || "Stopped.";
    default:
      return "Idle.";
    }
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  private removeControlBar(): void {
    document.getElementById("agent-control-bar")?.remove();
  }
}

/** Shared autonomous-run engine singleton. */
export const agentRunner = new AgentRunner();
