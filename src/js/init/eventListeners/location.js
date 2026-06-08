import { elements } from "../state.js";
import { showError } from "../../utils/notifications.js";
import { updateFeatureStatus } from "../../components/settings.js";
import { requestLocation, disableLocation, updateLocationUI } from "../../services/location.js";
export function setupLocationEventListeners() {
  if (!elements.locationToggle) {
    return;
  }

  elements.locationToggle.addEventListener('change', async(event) => {
    const isEnabled = event.target.checked;

    if (isEnabled) {
      const result = await requestLocation();
      if (result.success) {
                        updateLocationUI();
      
        if (window.VERBOSE_LOGGING) {
          console.info('Location enabled:', result.locationString);
        }
      } else {
        elements.locationToggle.checked = false;
                        updateLocationUI();
      
                        showError(`Location request failed: ${result.error}`);
      
        console.warn('Location request failed:', result.error);
      }
    } else {
                  disableLocation();
    
                  updateLocationUI();
    
      if (window.VERBOSE_LOGGING) {
        console.info('Location services disabled');
      }
    }

            updateFeatureStatus();
  
  });
}

