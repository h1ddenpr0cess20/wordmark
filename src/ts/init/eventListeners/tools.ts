import { elements } from "../state.ts";
import { showInfo } from "../../utils/notifications.ts";
import { loadToolScripts } from "../../utils/toolLoader.ts";
import { updateFeatureStatus } from "../../components/settings.ts";
import { updateMasterToolCallingStatus } from "../../components/tools.ts";
import { config } from "../../../config/config.ts";
export function setupToolCallingEventListeners() {
  if (!elements.toolCallingToggle) {
    return;
  }

  elements.toolCallingToggle.addEventListener("change", (event) => {
    const enabled = (event.target as HTMLInputElement).checked;
    config.enableFunctionCalling = enabled;
    localStorage.setItem("enableFunctionCalling", enabled ? "true" : "false");

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

