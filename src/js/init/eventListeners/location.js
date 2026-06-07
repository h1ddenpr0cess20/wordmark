import { showError } from "../../utils/notifications.js";
import { loadLocationModule, lazyModulesLoaded } from "../../utils/lazyLoader.js";
import { updateFeatureStatus } from "../../components/settings.js";
import { requestLocation, disableLocation, updateLocationUI } from "../../services/location.js";
export function setupLocationEventListeners() {
  if (!window.locationToggle) {
    return;
  }

  window.locationToggle.addEventListener('change', async(event) => {
    const isEnabled = event.target.checked;

    if (isEnabled) {
      if (typeof loadLocationModule === 'function' && !lazyModulesLoaded?.location) {
        await loadLocationModule();
      }

      const result = await requestLocation();
      if (result.success) {
        if (typeof updateLocationUI === 'function') {
          updateLocationUI();
        }
        if (window.VERBOSE_LOGGING) {
          console.info('Location enabled:', result.locationString);
        }
      } else {
        window.locationToggle.checked = false;
        if (typeof updateLocationUI === 'function') {
          updateLocationUI();
        }
        if (typeof showError === 'function') {
          showError(`Location request failed: ${result.error}`);
        }
        console.warn('Location request failed:', result.error);
      }
    } else {
      if (typeof disableLocation === 'function') {
        disableLocation();
      }
      if (typeof updateLocationUI === 'function') {
        updateLocationUI();
      }
      if (window.VERBOSE_LOGGING) {
        console.info('Location services disabled');
      }
    }

    if (typeof updateFeatureStatus === 'function') {
      updateFeatureStatus();
    }
  });
}

