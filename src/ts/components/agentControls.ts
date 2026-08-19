/**
 * Settings controls for autonomous work.
 *
 * @remarks
 * Binds the enable switch and the turn-budget input, and registers the hook
 * that lets conversation teardown clear a run without importing the engine.
 * Turning the switch off ends any run in progress — leaving one live under a
 * switch that says it is off would be the worst of both readings.
 */

import { uiHooks } from "../init/uiHooks.ts";
import { createScopedLogger } from "../utils/logger.ts";
import { showInfo } from "../utils/notifications.ts";
import { isAutoCompactEnabled, setAutoCompactEnabled } from "./compaction.ts";
import { agentRunner } from "../services/agent/agentRunner.ts";
import {
  DEFAULT_AGENT_MAX_TURNS,
  MAX_AGENT_MAX_TURNS,
  MIN_AGENT_MAX_TURNS,
  agentMaxTurns,
  isAgentModeEnabled,
  setAgentMaxTurns,
  setAgentModeEnabled,
} from "../services/agent/agentSettings.ts";

const logAgent = createScopedLogger("agent");

/**
 * Turns auto-compaction on alongside autonomous work, when it is not already.
 *
 * @remarks
 * A run spends many turns on one conversation and will outgrow the history
 * budget partway through; without compaction the oldest turns are dropped
 * outright, which is how a run forgets the goal it was given. Switching it on
 * here rather than forcing it at run time keeps it a visible, revertible
 * setting — the companion checkbox flips where the user can see it, and the
 * notification says why. Switching autonomous work back off leaves it on,
 * since by then it may be wanted for its own sake.
 */
function enableAutoCompactForRuns(): void {
  if (isAutoCompactEnabled()) {
    return;
  }
  setAutoCompactEnabled(true);
  const compactToggle = document.getElementById("auto-compact-toggle") as HTMLInputElement | null;
  if (compactToggle) {
    compactToggle.checked = true;
  }
  logAgent("Enabled auto-compaction to go with autonomous work");
  showInfo?.("Auto-Compact History turned on — long runs outgrow the history budget without it.");
}

/**
 * Turns autonomous work on or off from anywhere in the UI.
 *
 * @remarks
 * The settings switch is not the only control — the header status row toggles
 * the same feature — and the side effects (auto-compaction, ending a live run,
 * keeping the checkbox in step) belong to the feature rather than to whichever
 * control was clicked.
 */
export function setAgentMode(enabled: boolean): void {
  setAgentModeEnabled(enabled);

  const toggle = document.getElementById("agent-mode-toggle") as HTMLInputElement | null;
  if (toggle && toggle.checked !== enabled) {
    toggle.checked = enabled;
  }

  logAgent("Autonomous work", enabled ? "enabled" : "disabled");
  if (enabled) {
    enableAutoCompactForRuns();
  } else {
    agentRunner.stop("");
  }
}

/** Wires the autonomous-work settings and the run-teardown hook. */
export function initAgentControls(): void {
  uiHooks.resetAgentRun = () => agentRunner.reset();

  const toggle = document.getElementById("agent-mode-toggle") as HTMLInputElement | null;
  if (toggle) {
    toggle.checked = isAgentModeEnabled();
    if (!toggle.dataset.bound) {
      toggle.addEventListener("change", () => {
        setAgentMode(toggle.checked);
      });
      toggle.dataset.bound = "true";
    }
  }

  const budget = document.getElementById("agent-max-turns") as HTMLInputElement | null;
  if (budget) {
    budget.min = String(MIN_AGENT_MAX_TURNS);
    budget.max = String(MAX_AGENT_MAX_TURNS);
    budget.placeholder = String(DEFAULT_AGENT_MAX_TURNS);
    budget.value = String(agentMaxTurns());
    if (!budget.dataset.bound) {
      budget.addEventListener("change", () => {
        // Written back so the field always shows the value that will be used,
        // rather than a number the runner silently clamps at run time.
        budget.value = String(setAgentMaxTurns(Number(budget.value)));
      });
      budget.dataset.bound = "true";
    }
  }
}
