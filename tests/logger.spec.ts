import test from "node:test";
import assert from "node:assert/strict";

const calls: { log: unknown[][]; info: unknown[][]; warn: unknown[][]; error: unknown[][] } = { log: [], info: [], warn: [], error: [] };
console.log = (...a: unknown[]) => calls.log.push(a);
console.info = (...a: unknown[]) => calls.info.push(a);
console.warn = (...a: unknown[]) => calls.warn.push(a);
console.error = (...a: unknown[]) => calls.error.push(a);

let enableLoggingValue: string | null = null;
globalThis.localStorage = {
  getItem(key: string) { return key === "enableLogging" ? enableLoggingValue : null; },
} as unknown as Storage;
const windowHandlers: Record<string, ((event: unknown) => void)[]> = {};
globalThis.window = {
  addEventListener(type: string, handler: (event: unknown) => void) {
    (windowHandlers[type] ??= []).push(handler);
  },
} as unknown as Window & typeof globalThis;

const { applyConsoleLogging, createScopedLogger } = await import("../src/ts/utils/logger.ts");
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
  console.warn("repeat");
  console.warn("different");

  assert.equal(calls.warn.length, 2, "duplicate suppressed, distinct emits");
  assert.equal(calls.warn[0][1], "repeat");
  assert.equal(calls.warn[1][1], "different");
});

test("flooding more than maxEntries distinct lines stays correct (cache reset path)", () => {
  reset();
  state.debug = true;
  state.verboseLogging = true;
  applyConsoleLogging();

  const total = 600;
  for (let i = 0; i < total; i++) {
    console.warn(`distinct-${i}`);
  }

  assert.equal(calls.warn.length, total, "every distinct line emits exactly once");
  for (const call of calls.warn) {
    assert.equal(call.length, 2, "no trailing duplicate-count argument on distinct lines");
  }
});

test("uncaught error handler appends source location when present", () => {
  reset();
  state.debug = true;
  state.verboseLogging = true;
  applyConsoleLogging();
  const onError = (windowHandlers["error"] ?? [])[0];
  assert.ok(onError, "an error handler is registered");

  const err = new Error("boom");
  onError({ error: err, filename: "app.js", lineno: 12, colno: 5 });
  assert.equal(calls.error.length, 1);
  assert.match(calls.error[0][1] as string, /^Uncaught error \(app\.js:12:5\):$/);
  assert.equal(calls.error[0][2], err);
});

test("uncaught error handler omits location when filename is absent", () => {
  reset();
  state.debug = true;
  applyConsoleLogging();
  const onError = (windowHandlers["error"] ?? [])[0];

  onError({ message: "no location" });
  assert.equal(calls.error.length, 1);
  assert.match(calls.error[0][1] as string, /^Uncaught error:$/);
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
  assert.equal(calls.warn.length, 1);
  assert.equal(calls.warn[0][0], "warn-passes");
  assert.equal(calls.error.length, 1);
});

test("unhandledrejection handler logs the reason in debug mode only", () => {
  reset();
  const handlers = windowHandlers["unhandledrejection"] ?? [];
  assert.equal(handlers.length, 1, "exactly one rejection handler registered");
  const onRejection = handlers[0];

  state.debug = false;
  onRejection({ reason: new Error("ignored when not debugging") });
  assert.equal(calls.error.length, 0, "no log when debug off");

  state.debug = true;
  applyConsoleLogging();
  onRejection({ reason: new Error("boom async") });
  assert.equal(calls.error.length, 1, "logged once in debug mode");
  assert.equal(calls.error[0][1], "Unhandled promise rejection:");
  assert.equal((calls.error[0][2] as Error).message, "boom async");
});

test("unhandledrejection handler falls back when reason is absent", () => {
  reset();
  state.debug = true;
  applyConsoleLogging();
  const onRejection = (windowHandlers["unhandledrejection"] ?? [])[0];

  onRejection({ reason: undefined });
  assert.equal(calls.error.length, 1);
  assert.equal(calls.error[0][2], "Unknown reason");
});

test("createScopedLogger gates on verboseLogging and prefixes the scope", () => {
  reset();
  state.debug = true;
  state.verboseLogging = false;
  applyConsoleLogging();
  const log = createScopedLogger("image-debug");

  log("hidden while verbose off");
  assert.equal(calls.info.length, 0, "scoped logger suppressed when verbose off");

  state.verboseLogging = true;
  applyConsoleLogging();
  log("now visible", 7);

  assert.equal(calls.info.length, 1);
  assert.equal(calls.info[0][1], "[image-debug]");
  assert.equal(calls.info[0][2], "now visible");
  assert.equal(calls.info[0][3], 7);
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
