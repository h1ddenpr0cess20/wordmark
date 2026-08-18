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

/** Wires the autonomous-work settings and the run-teardown hook. */
export function initAgentControls(): void {
  uiHooks.resetAgentRun = () => agentRunner.reset();

  const toggle = document.getElementById("agent-mode-toggle") as HTMLInputElement | null;
  if (toggle) {
    toggle.checked = isAgentModeEnabled();
    if (!toggle.dataset.bound) {
      toggle.addEventListener("change", () => {
        setAgentModeEnabled(toggle.checked);
        logAgent("Autonomous work", toggle.checked ? "enabled" : "disabled");
        if (!toggle.checked) {
          agentRunner.stop("");
        }
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
