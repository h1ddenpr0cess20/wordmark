import test from "node:test";
import assert from "node:assert/strict";

const {
  buildRunInstructions,
  buildContinuationPrompt,
  parseContinuationDecision,
  stepLabel,
} = await import("../src/ts/services/agent/agentPrompts.ts");

test("run instructions state the goal and where the turn sits in the budget", () => {
  const text = buildRunInstructions("Draft the launch checklist", 3, 8, false);

  assert.match(text, /Draft the launch checklist/);
  assert.match(text, /turn 3 of at most 8/);
  assert.match(text, /5 further turns remain after this one/);
});

test("run instructions only advertise queue_followup when it is in the request", () => {
  assert.doesNotMatch(buildRunInstructions("goal", 0, 4, false), /queue_followup/);
  assert.match(buildRunInstructions("goal", 0, 4, true), /queue_followup/);
});

test("run instructions never promise turns past the budget", () => {
  assert.match(buildRunInstructions("goal", 8, 8, false), /0 further turns remain/);
  assert.match(buildRunInstructions("goal", 7, 8, false), /1 further turn remain/);
});

test("run instructions truncate an enormous goal instead of resending it whole", () => {
  const text = buildRunInstructions("x".repeat(5000), 0, 4, false);

  assert.match(text, /\[truncated\]/);
  assert.ok(text.length < 4000);
});

test("the continuation prompt carries the goal, the last output, and the budget", () => {
  const text = buildContinuationPrompt("Ship the docs", "I wrote the intro.", 3, 6);

  assert.match(text, /Ship the docs/);
  assert.match(text, /I wrote the intro\./);
  assert.match(text, /Turns used: 3 of 6/);
});

test("the continuation prompt lists queued steps so the decision does not repeat them", () => {
  const text = buildContinuationPrompt("goal", "output", 1, 6, ["write the summary"]);

  assert.match(text, /do not repeat these/i);
  assert.match(text, /- write the summary/);
});

test("a well-formed decision parses into a verdict and its detail", () => {
  assert.deepEqual(
    parseContinuationDecision("CONTINUE|Write the deployment section."),
    { verdict: "continue", detail: "Write the deployment section." },
  );
  assert.deepEqual(
    parseContinuationDecision("DONE|The checklist is complete."),
    { verdict: "done", detail: "The checklist is complete." },
  );
  assert.deepEqual(
    parseContinuationDecision("BLOCKED|Needs the production API key."),
    { verdict: "blocked", detail: "Needs the production API key." },
  );
});

test("decoration around the verdict and detail is tolerated", () => {
  assert.deepEqual(
    parseContinuationDecision("**continue** | \"Add the rollback steps.\""),
    { verdict: "continue", detail: "Add the rollback steps." },
  );
});

test("a detail containing pipes is kept whole", () => {
  const decision = parseContinuationDecision("CONTINUE|Run `a | b | c` and report the output.");

  assert.equal(decision.verdict, "continue");
  assert.equal(decision.detail, "Run `a | b | c` and report the output.");
});

test("a verdict buried in prose is still recognized", () => {
  assert.equal(parseContinuationDecision("Status: DONE - everything is written").verdict, "done");
});

test("an unreadable or empty decision stops the run rather than continuing it", () => {
  assert.equal(parseContinuationDecision("").verdict, "done");
  assert.equal(parseContinuationDecision("¯\\_(ツ)_/¯").verdict, "done");
});

test("a CONTINUE with no instruction yields an empty detail the runner can reject", () => {
  assert.deepEqual(parseContinuationDecision("CONTINUE|"), { verdict: "continue", detail: "" });
});

test("step labels collapse whitespace and truncate to chip width", () => {
  assert.equal(stepLabel("  write   the\nsummary  "), "write the summary");
  assert.equal(stepLabel("x".repeat(80)).length, 60);
  assert.match(stepLabel("x".repeat(80)), /…$/);
});
