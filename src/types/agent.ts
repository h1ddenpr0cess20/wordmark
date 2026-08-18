/**
 * Shared types for the autonomous-work loop: queue-entry provenance and the
 * state of a goal-directed run.
 */

/**
 * Where a queued prompt came from.
 *
 * @remarks
 * The distinction is what separates type-ahead from autonomy. `user` entries
 * are messages a person composed while a turn was streaming; they are always
 * eligible to send. `agent` entries were produced by the model — either through
 * the `queue_followup` tool or by the continuation decision — and only drain
 * while a run is active, unpaused, and inside its turn budget.
 */
export type QueuedPromptOrigin = "user" | "agent";

/** Lifecycle state of an autonomous run. */
export type AgentRunStatus =
  /** No run in progress. */
  | "idle"
  /** Working: turns are being sent as the queue drains. */
  | "running"
  /** Halted at a checkpoint, resumable without losing the queue. */
  | "paused"
  /** The turn budget ran out; resumable by granting more turns. */
  | "exhausted"
  /** The goal was reached. */
  | "done"
  /** The model reported it cannot make further progress unaided. */
  | "blocked";

/** A snapshot of the active run, for the control bar and for tests. */
export interface AgentRunState {
  id: string;
  /** The originating instruction the run is working toward. */
  goal: string;
  status: AgentRunStatus;
  /** Assistant turns spent so far on this run. */
  turnsUsed: number;
  /** Ceiling on turns before the run pauses for confirmation. */
  maxTurns: number;
  /** Why the run ended or stalled, shown on the control bar. */
  note?: string;
}

/** How the continuation decision says a run should proceed. */
export type ContinuationVerdict = "continue" | "done" | "blocked";

/** The parsed result of a continuation-decision call. */
export interface ContinuationDecision {
  verdict: ContinuationVerdict;
  /**
   * The next instruction to queue when the verdict is `continue`, or the
   * reason the run stopped otherwise.
   */
  detail: string;
}
