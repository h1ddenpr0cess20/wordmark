import test from "node:test";
import assert from "node:assert/strict";

// The logger captures the *original* console methods at module-evaluation time
// (originalConsole = { log: console.log, ... }) and routes through them. Install
// recording spies BEFORE importing the module so those captured references are
// our spies, then drive behavior via the shared `state` flags.
const calls: { log: unknown[][]; info: unknown[][]; warn: unknown[][]; error: unknown[][] } = { log: [], info: [], warn: [], error: [] };
console.log = (...a: unknown[]) => calls.log.push(a);
console.info = (...a: unknown[]) => calls.info.push(a);
console.warn = (...a: unknown[]) => calls.warn.push(a);
console.error = (...a: unknown[]) => calls.error.push(a);

// Minimal localStorage stub so the production-mode branch is controllable.
let enableLoggingValue: string | null = null;
globalThis.localStorage = {
  getItem(key: string) { return key === "enableLogging" ? enableLoggingValue : null; },
} as unknown as Storage;
globalThis.window = globalThis.window || { addEventListener() {} };

// Dynamic import so the spies above are in place first.
const { applyConsoleLogging } = await import("../src/ts/utils/logger.ts");
const { state } = await import("../src/ts/init/state.ts");

function reset() {
  calls.log.length = 0;
  calls.info.length = 0;
  calls.warn.length = 0;
  calls.error.length = 0;
}

test("debug on, verbose off: log/info are gated, warn/error pass through", () => {
  reset();
  state.debug = true;
  state.verboseLogging = false;
  applyConsoleLogging();

  console.log("hidden");
  console.info("hidden too");
  console.warn("shown-warn");
  console.error("shown-error");

  assert.equal(calls.log.length, 0, "log gated when verbose off");
  assert.equal(calls.info.length, 0, "info gated when verbose off");
  assert.equal(calls.warn.length, 1, "warn always emits in debug");
  assert.equal(calls.error.length, 1, "error always emits in debug");
  // Output is timestamped/labelled and carries the original args.
  assert.match(calls.warn[0][0] as string, /\[WARN\]$/);
  assert.equal(calls.warn[0][1], "shown-warn");
});

test("debug + verbose on: log emits with timestamp/label prefix", () => {
  reset();
  state.debug = true;
  state.verboseLogging = true;
  applyConsoleLogging();

  console.log("hello", 42);

  assert.equal(calls.log.length, 1);
  assert.match(calls.log[0][0] as string, /^\[\d{4}-\d{2}-\d{2}T.*\] \[LOG\]$/);
  assert.equal(calls.log[0][1], "hello");
  assert.equal(calls.log[0][2], 42);
});

test("identical messages within the dedupe window collapse to one emit", () => {
  reset();
  state.debug = true;
  state.verboseLogging = true;
  applyConsoleLogging();

  console.warn("repeat");
  console.warn("repeat"); // within windowMs -> suppressed
  console.warn("different");

  assert.equal(calls.warn.length, 2, "duplicate suppressed, distinct emits");
  assert.equal(calls.warn[0][1], "repeat");
  assert.equal(calls.warn[1][1], "different");
});

test("production (debug off): log/info suppressed unless enableLogging set", () => {
  reset();
  state.debug = false;
  enableLoggingValue = null;
  applyConsoleLogging();

  console.log("nope");
  console.info("nope");
  console.warn("warn-passes");
  console.error("error-passes");

  assert.equal(calls.log.length, 0, "log suppressed in production by default");
  assert.equal(calls.info.length, 0, "info suppressed in production by default");
  // warn/error are restored to the raw originals (no prefix) and pass through.
  assert.equal(calls.warn.length, 1);
  assert.equal(calls.warn[0][0], "warn-passes");
  assert.equal(calls.error.length, 1);
});

test("production with enableLogging set: log/info pass through raw", () => {
  reset();
  state.debug = false;
  enableLoggingValue = "1";
  applyConsoleLogging();

  console.log("visible");

  assert.equal(calls.log.length, 1);
  assert.equal(calls.log[0][0], "visible", "raw original console, no prefix");
});
