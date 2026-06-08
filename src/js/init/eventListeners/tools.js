import { showInfo } from "../../utils/notifications.js";
import { loadToolScripts } from "../../utils/toolLoader.js";
import { updateFeatureStatus } from "../../components/settings.js";
import { updateMasterToolCallingStatus } from "../../components/tools.js";
export function setupToolCallingEventListeners() {
  if (!window.toolCallingToggle) {
    return;
  }

  window.toolCallingToggle.addEventListener('change', (event) => {
    const enabled = event.target.checked;
    window.config.enableFunctionCalling = enabled;
    localStorage.setItem('enableFunctionCalling', enabled ? 'true' : 'false');

            updateMasterToolCallingStatus(enabled);
  

    if (enabled) {
      loadToolScripts().catch((error) => {
        console.error('Failed to load tool scripts:', error);
      });
    }

            updateFeatureStatus();
  

            showInfo(enabled ? 'Tool calling enabled.' : 'Tool calling disabled.');
  
  });
}

