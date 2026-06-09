import { elements, state } from "../state.ts";
import { showError } from "../../utils/notifications.ts";
import { updateFeatureStatus } from "../../components/settings.ts";
import { requestLocation, disableLocation, updateLocationUI } from "../../services/location.ts";
export function setupLocationEventListeners() {
  const locationToggle = elements.locationToggle;
  if (!locationToggle) {
    return;
  }

  locationToggle.addEventListener("change", async(event) => {
    const isEnabled = (event.target as any).checked;

    if (isEnabled) {
      const result = await requestLocation();
      if (result.success) {
        updateLocationUI();

        if (state.verboseLogging) {
          console.info("Location enabled:", result.locationString);
        }
      } else {
        locationToggle.checked = false;
        updateLocationUI();

        showError(`Location request failed: ${result.error}`);

        console.warn("Location request failed:", result.error);
      }
    } else {
      disableLocation();

      updateLocationUI();

      if (state.verboseLogging) {
        console.info("Location services disabled");
      }
    }

    updateFeatureStatus();

  });
}

