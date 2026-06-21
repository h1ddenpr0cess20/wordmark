/**
 * Location toggle event listeners.
 *
 * @remarks
 * Wires the location switch to request or disable geolocation, reverting the
 * toggle and surfacing an error if the browser denies the request.
 */

import { elements } from "../state.ts";
import { showError } from "../../utils/notifications.ts";
import { updateFeatureStatus } from "../../components/settings.ts";
import { requestLocation, disableLocation, updateLocationUI } from "../../services/location.ts";
import { createScopedLogger } from "../../utils/logger.ts";

const logLocation = createScopedLogger("location");

/** Wires the location toggle to request/disable geolocation and update its UI. */
export function setupLocationEventListeners() {
  const locationToggle = elements.locationToggle;
  if (!locationToggle) {
    return;
  }

  locationToggle.addEventListener("change", async(event) => {
    const isEnabled = (event.target as HTMLInputElement).checked;

    if (isEnabled) {
      const result = await requestLocation();
      if (result.success) {
        updateLocationUI();

        logLocation("Location enabled:", result.locationString);
      } else {
        locationToggle.checked = false;
        updateLocationUI();

        showError(`Location request failed: ${result.error}`);

        console.warn("Location request failed:", result.error);
      }
    } else {
      disableLocation();

      updateLocationUI();

      logLocation("Location services disabled");
    }

    updateFeatureStatus();

  });
}

