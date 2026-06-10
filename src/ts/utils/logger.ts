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
import { STORAGE_KEYS } from "./storage.ts";

type ConsoleMethod = "log" | "info" | "warn" | "error";

const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
};

// Lightweight dedupe cache to prevent duplicate console entries.
const LOG_DEDUPE = {
  lastTimes: new Map<string, number>(), // key -> timestamp
  suppressed: new Map<string, number>(), // key -> count
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
    // Fallback: join string representations
    return args.map(a => {
      try { return typeof a === "string" ? a : (a && a.toString ? a.toString() : String(a)); } catch { return "[unserializable]"; }
    }).join(" | ");
  }
}

function makeWrapper(method: ConsoleMethod, gateVerbose: boolean) {
  const orig = originalConsole[method] || console[method];
  return function(...args: unknown[]) {
    // Apply verbose gating for log/info
    if (gateVerbose && !state.verboseLogging) return;

    // Build dedupe key
    const key = `${method}|${serializeArgs(args)}`;
    const now = Date.now();
    const { lastTimes, suppressed, windowMs, maxEntries } = LOG_DEDUPE;
    const last = lastTimes.get(key) || 0;

    if (now - last < windowMs) {
      suppressed.set(key, (suppressed.get(key) || 0) + 1);
      return;
    }

    // If there were suppressed duplicates, append a note to the previous log
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
      // Simple pruning to keep memory bounded
      lastTimes.clear();
    }
  };
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
    // Restore to original first
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;

    // In production mode, suppress log/info unless explicitly enabled
    let loggingEnabled = false;
    try { loggingEnabled = Boolean(localStorage.getItem(STORAGE_KEYS.enableLogging)); } catch { /* no localStorage */ }
    if (!loggingEnabled) {
      console.log = function() {};
      console.info = function() {};
    }
  }
}

// Initial application of console behavior
applyConsoleLogging();

// Handle uncaught errors. This module evaluates once, so the listener is
// registered once — no idempotency flag needed.
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("error", function(event) {
    if (state.debug) {
      const err = event && (event.error || event.message || "Unknown error");
      console.error("Uncaught error:", err);
    }
  });
}
