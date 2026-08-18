import test, { mock } from "node:test";
import assert from "node:assert/strict";

/**
 * Control-flow tests for the autonomous-run engine. The engine reaches for the
 * network, the DOM, and the settings store, so each is replaced with a light
 * fake via `mock.module`; the real engine and the real prompt queue run, so the
 * tests cover the handoff between them.
 *
 * Run requires `--experimental-test-module-mocks` (wired in the npm test script).
 */

let decisionReply = "";
let decisionCalls = 0;
let decisionFails = false;
let maxTurns = 4;
let agentModeOn = true;
const infos: string[] = [];
const errors: string[] = [];

/** A DOM node that absorbs every call the control bar makes on it. */
function makeNode(): Record<string, unknown> {
  return {
    id: "",
    className: "",
    textContent: "",
    innerHTML: "",
    type: "",
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    appendChild() {},
    append() {},
    insertBefore() {},
    remove() {},
    setAttribute() {},
    addEventListener() {},
  };
}

const fakeState: Record<string, unknown> = {
  agentRun: null,
  conversationHistory: [] as unknown[],
  partyMode: false,
  pendingUploads: [] as unknown[],
  pendingDocuments: [] as unknown[],
};

function mockModule(rel: string, namedExports: Record<string, unknown>): void {
  mock.module(new URL(rel, import.meta.url).href, { namedExports });
}

mockModule("../src/ts/init/state.ts", { state: fakeState, elements: {} });
mockModule("../src/ts/utils/notifications.ts", {
  showInfo: (m: string) => { infos.push(m); },
  showError: (m: string) => { errors.push(m); },
});
mockModule("../src/ts/utils/icons.ts", { icon: () => "" });
mockModule("../src/ts/components/attachments/attachmentPreviews.ts", { showPendingUploadPreviews: () => {} });
mockModule("../src/ts/services/api/requestClient.ts", { buildRequestBody: (opts: unknown) => opts });
mockModule("../src/ts/services/api/requestTransport.ts", {
  executeNonStreamingRequest: async () => {
    decisionCalls += 1;
    if (decisionFails) {
      throw new Error("network down");
    }
    return {};
  },
});
mockModule("../src/ts/services/api/responseNormalization.ts", { extractOutputText: () => decisionReply });
mockModule("../src/ts/services/api/clientConfig.ts", { getActiveModel: () => "fake-model" });
mockModule("../src/ts/services/agent/agentSettings.ts", {
  isAgentModeEnabled: () => agentModeOn,
  agentMaxTurns: () => maxTurns,
});

(globalThis as unknown as { document: unknown }).document = {
  getElementById: () => null,
  createElement: () => makeNode(),
  querySelector: () => null,
};

const { agentRunner } = await import("../src/ts/services/agent/agentRunner.ts");
const { queueFollowup } = await import("../src/ts/services/agent/agentTools.ts");
const { enqueuePrompt, queuedPrompts, queuedPromptCount, clearPromptQueue } =
  await import("../src/ts/components/promptQueue.ts");

function reset(): void {
  agentRunner.reset();
  clearPromptQueue();
  (fakeState.conversationHistory as unknown[]).length = 0;
  decisionReply = "";
  decisionCalls = 0;
  decisionFails = false;
  maxTurns = 4;
  agentModeOn = true;
  infos.length = 0;
  errors.length = 0;
}

/** Records an assistant reply so the continuation check has something to read. */
function recordAssistantTurn(content: string): void {
  (fakeState.conversationHistory as unknown[]).push({ role: "assistant", content });
}

test("starting a run records the goal and the configured budget", () => {
  reset();
  maxTurns = 6;

  const run = agentRunner.start("Draft the launch checklist");

  assert.equal(run?.goal, "Draft the launch checklist");
  assert.equal(run?.status, "running");
  assert.equal(run?.maxTurns, 6);
  assert.equal(run?.turnsUsed, 0);
  assert.ok(agentRunner.isRunning());
});

test("a run lives on the shared state so the prompt builder can read it", () => {
  reset();
  agentRunner.start("goal");

  assert.equal((fakeState.agentRun as { goal: string }).goal, "goal");
  agentRunner.reset();
  assert.equal(fakeState.agentRun, null);
});

test("a run does not start in party mode or without a goal", () => {
  reset();
  assert.equal(agentRunner.start("   "), null);

  fakeState.partyMode = true;
  assert.equal(agentRunner.start("goal"), null);
  fakeState.partyMode = false;
});

test("the budget is spent per turn and closes the drain when it runs out", () => {
  reset();
  maxTurns = 2;
  agentRunner.start("goal");

  assert.ok(agentRunner.mayDrainAgentEntries());
  agentRunner.noteTurnStarted();
  assert.ok(agentRunner.mayDrainAgentEntries());
  agentRunner.noteTurnStarted();
  assert.equal(agentRunner.snapshot()?.turnsUsed, 2);
  assert.equal(agentRunner.mayDrainAgentEntries(), false);
});

test("a failed turn pauses the run instead of queueing more work", async () => {
  reset();
  agentRunner.start("goal");
  agentRunner.noteTurnStarted();

  await agentRunner.afterTurn("failed");

  assert.equal(agentRunner.snapshot()?.status, "paused");
  assert.equal(decisionCalls, 0);
  assert.equal(queuedPromptCount("agent"), 0);
  assert.equal(agentRunner.mayDrainAgentEntries(), false);
});

test("steps the model already queued skip the continuation check", async () => {
  reset();
  agentRunner.start("goal");
  agentRunner.noteTurnStarted();
  agentRunner.queueStep("write the summary");

  await agentRunner.afterTurn("ok");

  assert.equal(decisionCalls, 0, "no need to pay for a decision when work is queued");
  assert.equal(queuedPromptCount("agent"), 1);
});

test("a CONTINUE verdict queues the next step as an agent entry", async () => {
  reset();
  agentRunner.start("Draft the checklist");
  agentRunner.noteTurnStarted();
  recordAssistantTurn("I wrote the intro.");
  decisionReply = "CONTINUE|Write the rollback section.";

  await agentRunner.afterTurn("ok");

  assert.equal(decisionCalls, 1);
  assert.equal(queuedPromptCount("agent"), 1);
  const [step] = queuedPrompts();
  assert.equal(step.text, "Write the rollback section.");
  assert.equal(step.origin, "agent");
  assert.equal(step.label, "Write the rollback section.");
  assert.equal(step.runId, agentRunner.snapshot()?.id);
  assert.ok(agentRunner.isRunning());
});

test("a DONE verdict ends the run and reports what was accomplished", async () => {
  reset();
  agentRunner.start("goal");
  agentRunner.noteTurnStarted();
  decisionReply = "DONE|The checklist is complete.";

  await agentRunner.afterTurn("ok");

  assert.equal(agentRunner.snapshot()?.status, "done");
  assert.equal(agentRunner.snapshot()?.note, "The checklist is complete.");
  assert.equal(agentRunner.mayDrainAgentEntries(), false);
  assert.ok(infos.some(message => message.includes("The checklist is complete.")));
});

test("a BLOCKED verdict ends the run and surfaces what is needed", async () => {
  reset();
  agentRunner.start("goal");
  agentRunner.noteTurnStarted();
  decisionReply = "BLOCKED|Needs the production API key.";

  await agentRunner.afterTurn("ok");

  assert.equal(agentRunner.snapshot()?.status, "blocked");
  assert.ok(errors.some(message => message.includes("Needs the production API key.")));
});

test("a CONTINUE with no instruction ends the run rather than queueing nothing", async () => {
  reset();
  agentRunner.start("goal");
  agentRunner.noteTurnStarted();
  decisionReply = "CONTINUE|";

  await agentRunner.afterTurn("ok");

  assert.equal(agentRunner.snapshot()?.status, "done");
  assert.equal(queuedPromptCount("agent"), 0);
});

test("a failed continuation check pauses rather than ending the run", async () => {
  reset();
  agentRunner.start("goal");
  agentRunner.noteTurnStarted();
  decisionFails = true;

  await agentRunner.afterTurn("ok");

  assert.equal(agentRunner.snapshot()?.status, "paused");
});

test("an exhausted budget pauses for confirmation without asking the model", async () => {
  reset();
  maxTurns = 2;
  agentRunner.start("goal");
  agentRunner.noteTurnStarted();
  agentRunner.noteTurnStarted();

  await agentRunner.afterTurn("ok");

  assert.equal(agentRunner.snapshot()?.status, "exhausted");
  assert.equal(decisionCalls, 0);
});

test("the budget is enforced even when the model already queued more steps", async () => {
  reset();
  maxTurns = 2;
  agentRunner.start("goal");
  agentRunner.noteTurnStarted();
  agentRunner.noteTurnStarted();
  // A `queue_followup` batch can outlast the budget that has to send it.
  queueFollowup({ steps: ["step one", "step two", "step three"] });

  await agentRunner.afterTurn("ok");

  assert.equal(agentRunner.snapshot()?.status, "exhausted", "must not sit running with steps it cannot send");
  assert.equal(decisionCalls, 0);
});

test("an exhausted run keeps its planned steps so continuing resumes them", async () => {
  reset();
  maxTurns = 2;
  agentRunner.start("goal");
  agentRunner.noteTurnStarted();
  agentRunner.noteTurnStarted();
  queueFollowup({ steps: ["step one", "step two"] });
  await agentRunner.afterTurn("ok");

  assert.equal(queuedPromptCount("agent"), 2, "the plan survives the pause");
  assert.equal(agentRunner.mayDrainAgentEntries(), false, "but nothing sends while it waits");

  agentRunner.resume();

  assert.ok(agentRunner.mayDrainAgentEntries());
  assert.equal(queuedPromptCount("agent"), 2);
});

test("continuing an exhausted run grants a fresh budget rather than raising the ceiling", async () => {
  reset();
  maxTurns = 2;
  agentRunner.start("goal");
  agentRunner.noteTurnStarted();
  agentRunner.noteTurnStarted();
  await agentRunner.afterTurn("ok");

  maxTurns = 3;
  agentRunner.resume();

  assert.equal(agentRunner.snapshot()?.status, "running");
  assert.equal(agentRunner.snapshot()?.turnsUsed, 0);
  assert.equal(agentRunner.snapshot()?.maxTurns, 3);
  assert.ok(agentRunner.mayDrainAgentEntries());
});

test("resuming a paused run keeps the turns it already spent", async () => {
  reset();
  agentRunner.start("goal");
  agentRunner.noteTurnStarted();
  await agentRunner.afterTurn("failed");

  agentRunner.resume();

  assert.equal(agentRunner.snapshot()?.status, "running");
  assert.equal(agentRunner.snapshot()?.turnsUsed, 1);
});

test("a finished run cannot be resumed back into working", async () => {
  reset();
  agentRunner.start("goal");
  agentRunner.noteTurnStarted();
  decisionReply = "DONE|Finished.";
  await agentRunner.afterTurn("ok");

  agentRunner.resume();

  assert.equal(agentRunner.snapshot()?.status, "done");
});

test("pausing halts the run and drops the steps it had planned", () => {
  reset();
  agentRunner.start("goal");
  agentRunner.noteTurnStarted();
  agentRunner.queueStep("write the summary");

  agentRunner.pause();

  assert.equal(agentRunner.snapshot()?.status, "paused");
  assert.equal(queuedPromptCount("agent"), 0);
});

test("stopping a run discards its steps but keeps what the user typed", () => {
  reset();
  agentRunner.start("goal");
  agentRunner.noteTurnStarted();
  agentRunner.queueStep("write the summary");
  enqueuePrompt("something I typed");

  agentRunner.stop("");

  assert.equal(agentRunner.snapshot(), null);
  assert.equal(queuedPromptCount("agent"), 0);
  assert.equal(queuedPromptCount("user"), 1);
});

test("a decision that lands after the run was stopped queues nothing", async () => {
  reset();
  agentRunner.start("goal");
  agentRunner.noteTurnStarted();
  decisionReply = "CONTINUE|Keep going.";

  const settling = agentRunner.afterTurn("ok");
  agentRunner.stop("");
  await settling;

  assert.equal(agentRunner.snapshot(), null);
  assert.equal(queuedPromptCount("agent"), 0);
});

test("starting a fresh run clears the previous run's planned steps", () => {
  reset();
  agentRunner.start("first goal");
  agentRunner.noteTurnStarted();
  agentRunner.queueStep("leftover step");

  agentRunner.start("second goal");

  assert.equal(agentRunner.snapshot()?.goal, "second goal");
  assert.equal(agentRunner.snapshot()?.turnsUsed, 0);
  assert.equal(queuedPromptCount("agent"), 0);
});

test("queueStep refuses when no run is in progress", () => {
  reset();
  assert.equal(agentRunner.queueStep("do a thing"), false);
  assert.equal(queuedPromptCount(), 0);
});

test("queue_followup queues the model's steps in order", () => {
  reset();
  agentRunner.start("goal");

  const result = queueFollowup({ steps: ["first step", "second step"] });

  assert.equal(result.queued, 2);
  assert.deepEqual(queuedPrompts().map(entry => entry.text), ["first step", "second step"]);
  assert.ok(queuedPrompts().every(entry => entry.origin === "agent"));
});

test("queue_followup refuses outside a run or with the feature off", () => {
  reset();
  assert.match(queueFollowup({ steps: ["a step"] }).error || "", /no autonomous run/i);

  agentRunner.start("goal");
  agentModeOn = false;
  assert.match(queueFollowup({ steps: ["a step"] }).error || "", /switched off/i);
  assert.equal(queuedPromptCount(), 0);
});

test("queue_followup rejects unusable arguments", () => {
  reset();
  agentRunner.start("goal");

  assert.match(queueFollowup({}).error || "", /no usable steps/i);
  assert.match(queueFollowup({ steps: ["", "   "] }).error || "", /no usable steps/i);
  assert.match(queueFollowup({ steps: "not an array" }).error || "", /no usable steps/i);
});

test("queue_followup tells the model when the queue could not take every step", () => {
  reset();
  agentRunner.start("goal");
  const steps = Array.from({ length: 30 }, (_, i) => `step ${i}`);

  const result = queueFollowup({ steps });

  assert.equal(result.queued, 25);
  assert.equal(result.rejected, 5);
  assert.match(result.note || "", /queue is full/i);
});
