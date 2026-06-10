/**
 * Tool-calling event listeners.
 *
 * @remarks
 * Wires the master tool-calling toggle, persisting the choice and lazily
 * loading the tool scripts the first time it is enabled.
 */

import { elements } from "../state.ts";
import { showInfo } from "../../utils/notifications.ts";
import { STORAGE_KEYS } from "../../utils/storage.ts";
import { loadToolScripts } from "../../utils/toolLoader.ts";
import { updateFeatureStatus } from "../../components/settings.ts";
import { updateMasterToolCallingStatus } from "../../components/tools.ts";
import { config } from "../../../config/config.ts";

/** Wires the master tool-calling toggle and loads tool scripts when enabled. */
export function setupToolCallingEventListeners() {
  if (!elements.toolCallingToggle) {
    return;
  }

  elements.toolCallingToggle.addEventListener("change", (event) => {
    const enabled = (event.target as HTMLInputElement).checked;
    config.enableFunctionCalling = enabled;
    localStorage.setItem(STORAGE_KEYS.enableFunctionCalling, enabled ? "true" : "false");

    updateMasterToolCallingStatus(enabled);

    if (enabled) {
      loadToolScripts().catch((error) => {
        console.error("Failed to load tool scripts:", error);
      });
    }

    updateFeatureStatus();

    showInfo(enabled ? "Tool calling enabled." : "Tool calling disabled.");

  });
}

