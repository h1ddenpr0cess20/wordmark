/**
 * Persisted preferences for autonomous work.
 *
 * @remarks
 * Kept in its own module so the low-level pieces that need to read the switch —
 * the tool catalog's availability gate, the developer-message builder — do not
 * have to import the engine or the component graph.
 */

import { STORAGE_KEYS } from "../../utils/storage/storage.ts";
import { createScopedLogger } from "../../utils/logger.ts";

const logAgent = createScopedLogger("agent");

/** Turn budget used when the preference is unset or unreadable. */
export const DEFAULT_AGENT_MAX_TURNS = 8;

/** Lowest budget worth running: one follow-up beyond the opening turn. */
export const MIN_AGENT_MAX_TURNS = 2;

/**
 * Highest budget the UI accepts.
 *
 * @remarks
 * Not a technical limit — a spending one. Every turn is a billed request, so
 * the ceiling is set where an unattended run is still something a person would
 * recognize as the amount of work they asked for.
 */
export const MAX_AGENT_MAX_TURNS = 50;

/** Reports whether autonomous work is enabled (defaults to off). */
export function isAgentModeEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.agentModeEnabled) === "true";
  } catch {
    return false;
  }
}

/** Persists the autonomous-work switch (best-effort). */
export function setAgentModeEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.agentModeEnabled, String(enabled));
  } catch (error) {
    logAgent("Unable to save the autonomous-work preference:", error);
  }
}

/** The configured turn budget, clamped to the accepted range. */
export function agentMaxTurns(): number {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEYS.agentMaxTurns));
    if (!Number.isFinite(stored) || stored <= 0) {
      return DEFAULT_AGENT_MAX_TURNS;
    }
    return clampTurns(stored);
  } catch {
    return DEFAULT_AGENT_MAX_TURNS;
  }
}

/** Persists the turn budget, clamped to the accepted range (best-effort). */
export function setAgentMaxTurns(turns: number): number {
  const clamped = clampTurns(turns);
  try {
    localStorage.setItem(STORAGE_KEYS.agentMaxTurns, String(clamped));
  } catch (error) {
    logAgent("Unable to save the turn budget:", error);
  }
  return clamped;
}

/** Clamps a requested budget into `[MIN, MAX]`, falling back on nonsense. */
export function clampTurns(turns: number): number {
  if (!Number.isFinite(turns)) {
    return DEFAULT_AGENT_MAX_TURNS;
  }
  return Math.min(MAX_AGENT_MAX_TURNS, Math.max(MIN_AGENT_MAX_TURNS, Math.round(turns)));
}
