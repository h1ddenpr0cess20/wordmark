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

    if (typeof updateMasterToolCallingStatus === 'function') {
      updateMasterToolCallingStatus(enabled);
    } else if (window.individualToolsContainer) {
      const toggles = window.individualToolsContainer.querySelectorAll('input[type="checkbox"]');
      toggles.forEach((toggle) => {
        toggle.disabled = !enabled;
      });
    }

    if (enabled && typeof loadToolScripts === 'function') {
      loadToolScripts().catch((error) => {
        console.error('Failed to load tool scripts:', error);
      });
    }

    if (typeof updateFeatureStatus === 'function') {
      updateFeatureStatus();
    }

    if (typeof showInfo === 'function') {
      showInfo(enabled ? 'Tool calling enabled.' : 'Tool calling disabled.');
    }
  });
}

