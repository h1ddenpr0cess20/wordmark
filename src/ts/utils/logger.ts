/**
 * Centralized console logging setup with de-duplication.
 *
 * Wraps `console.*` to (a) gate `log`/`info` behind the runtime logging flags,
 * (b) timestamp output, and (c) collapse bursts of identical lines. Evaluating
 * this module applies the current behavior and registers the uncaught-error
 * handler once; `applyConsoleLogging()` can be re-invoked when the flags change.
 *
 * Runtime flags live on the shared `state` object (state.debug /
 * state.verboseLogging) so they can be toggled at runtime from anywhere.
 */
import { state } from "../init/state.ts";
import { STORAGE_KEYS } from "./storage/storage.ts";

type ConsoleMethod = "log" | "info" | "warn" | "error";

const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
};

/**
 * Lightweight cache that collapses identical console lines emitted within
 * {@link LOG_DEDUPE.windowMs} of each other.
 */
const LOG_DEDUPE = {
  lastTimes: new Map<string, number>(),
  suppressed: new Map<string, number>(),
  windowMs: 1500,
  maxEntries: 500,
};

function serializeArgs(args: unknown[]): string {
  try {
    return JSON.stringify(args, (k, v) => {
      if (typeof v === "function") return "ƒ";
      if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
      return v;
    });
  } catch {
    return args.map(a => {
      try { return typeof a === "string" ? a : (a && a.toString ? a.toString() : String(a)); } catch { return "[unserializable]"; }
    }).join(" | ");
  }
}

function makeWrapper(method: ConsoleMethod, gateVerbose: boolean) {
  const orig = originalConsole[method] || console[method];
  return function(...args: unknown[]) {
    if (gateVerbose && !state.verboseLogging) return;

    const key = `${method}|${serializeArgs(args)}`;
    const now = Date.now();
    const { lastTimes, suppressed, windowMs, maxEntries } = LOG_DEDUPE;
    const last = lastTimes.get(key) || 0;

    if (now - last < windowMs) {
      suppressed.set(key, (suppressed.get(key) || 0) + 1);
      return;
    }

    const count = suppressed.get(key) || 0;
    suppressed.delete(key);

    const timestamp = new Date().toISOString();
    if (count > 0) {
      orig.call(originalConsole, `[${timestamp}] [${method.toUpperCase()}]`, ...args, `(x${count} duplicates suppressed)`);
    } else {
      orig.call(originalConsole, `[${timestamp}] [${method.toUpperCase()}]`, ...args);
    }

    lastTimes.set(key, now);
    if (lastTimes.size > maxEntries) {
      lastTimes.clear();
    }
  };
}

/**
 * Logs an informational message only when verbose logging is enabled.
 *
 * @remarks
 * Equivalent to the `if (state.verboseLogging) console.info(...)` guard that was
 * hand-written at dozens of call sites. It routes through `console.info`, so the
 * active {@link applyConsoleLogging} wrapping (timestamping, dedupe) still
 * applies. Note this is distinct from relying on the wrapper's own gating, which
 * only suppresses `info` in debug mode — this helper gates on `verboseLogging`
 * in every mode, matching the original inline guards.
 *
 * @param args - Values forwarded to `console.info` when verbose logging is on.
 */
export function logVerbose(...args: unknown[]): void {
  if (state.verboseLogging) {
    console.info(...args);
  }
}

/**
 * (Re)applies console behavior from the current logging flags: timestamped
 * wrappers in debug mode, originals otherwise, with log/info suppressed in
 * production unless explicitly enabled.
 */
export function applyConsoleLogging() {
  if (state.debug) {
    console.log = makeWrapper("log", true);
    console.info = makeWrapper("info", true);
    console.warn = makeWrapper("warn", false);
    console.error = makeWrapper("error", false);
  } else {
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;

    let loggingEnabled = false;
    try { loggingEnabled = Boolean(localStorage.getItem(STORAGE_KEYS.enableLogging)); } catch { /* no localStorage */ }
    if (!loggingEnabled) {
      console.log = function() {};
      console.info = function() {};
    }
  }
}

applyConsoleLogging();

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("error", function(event) {
    if (state.debug) {
      const err = event && (event.error || event.message || "Unknown error");
      console.error("Uncaught error:", err);
    }
  });
}
