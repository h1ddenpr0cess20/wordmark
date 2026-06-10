/**
 * Browser geolocation service.
 *
 * @remarks
 * Resolves and caches the user's approximate location (reverse-geocoded to a
 * human-readable string) so it can be injected into AI prompts, persisting the
 * enabled state and last-known position to localStorage.
 */

import { state } from "../init/state.ts";
import { STORAGE_KEYS, writeJSON } from "../utils/storage.ts";

/**
 * Structural position type covering both a real `GeolocationPosition` and the
 * lightweight object reconstructed from localStorage. Only coordinates and
 * timestamp are ever read.
 */
interface GeoPositionLike {
  coords: { latitude: number; longitude: number };
  timestamp: number;
}

/** Result of {@link requestLocation}: a success payload or an error message. */
interface LocationResult {
  success?: boolean;
  error?: string;
  position?: GeoPositionLike;
  locationString?: string;
  coordinates?: { lat: number; lng: number };
}

/** In-memory location state, mirrored to localStorage. */
export const locationState: {
  enabled: boolean;
  position: GeoPositionLike | null;
  locationString: string;
  lastFetched: string | null;
  error: string | null;
} = {
  enabled: false,
  position: null,
  locationString: "",
  lastFetched: null,
  error: null,
};

/**
 * Requests geolocation permission and resolves the current position.
 *
 * @returns A success payload with coordinates and a formatted string, or an
 * object with an `error` message. Never rejects.
 */
export async function requestLocation(): Promise<LocationResult> {
  if (!navigator.geolocation) {
    const error = "Geolocation is not supported by this browser";
    locationState.error = error;
    console.warn(error);
    return { error };
  }

  return new Promise<LocationResult>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async(position) => {
        locationState.position = position;
        locationState.error = null;
        locationState.lastFetched = new Date().toISOString();

        try {
          const locationString = await formatLocationString(position);
          locationState.locationString = locationString;
          locationState.enabled = true;

          localStorage.setItem(STORAGE_KEYS.locationEnabled, "true");
          writeJSON(STORAGE_KEYS.lastKnownLocation, {
            coords: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            },
            timestamp: position.timestamp,
            locationString: locationString,
          });

          if (state.verboseLogging) {
            console.info("Location obtained:", locationString);
          }

          resolve({
            success: true,
            position,
            locationString,
            coordinates: {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            },
          });
        } catch {
          const basicLocation = `Location: ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
          locationState.locationString = basicLocation;
          locationState.enabled = true;

          localStorage.setItem(STORAGE_KEYS.locationEnabled, "true");
          writeJSON(STORAGE_KEYS.lastKnownLocation, {
            coords: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            },
            timestamp: position.timestamp,
            locationString: basicLocation,
          });

          resolve({
            success: true,
            position,
            locationString: basicLocation,
            coordinates: {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            },
          });
        }
      },
      (error) => {
        let errorMessage = "Location access denied or unavailable";
        switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = "Location access denied by user";
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = "Location information unavailable";
          break;
        case error.TIMEOUT:
          errorMessage = "Location request timed out";
          break;
        }

        locationState.error = errorMessage;
        locationState.enabled = false;
        localStorage.setItem(STORAGE_KEYS.locationEnabled, "false");

        console.warn("Geolocation error:", errorMessage);
        resolve({ error: errorMessage });
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      },
    );
  });
}

/**
 * Reverse-geocodes a position into a human-readable location string.
 *
 * @remarks
 * Uses BigDataCloud's free reverse-geocoding endpoint with a 5s timeout, and
 * falls back to raw coordinates plus the local timezone if it fails.
 *
 * @param position - The geolocation position to format.
 * @returns A `Location: ...` string including the resolved timezone.
 */
export async function formatLocationString(position: GeoPositionLike) {
  const { latitude, longitude } = position.coords;

  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
      { signal: AbortSignal.timeout(5000) },
    );

    if (response.ok) {
      const data = await response.json();
      const locationParts = [];

      if (data.city) {
        locationParts.push(data.city);
      }
      if (data.principalSubdivision) {
        locationParts.push(data.principalSubdivision);
      }
      if (data.countryName) {
        locationParts.push(data.countryName);
      }

      if (locationParts.length > 0) {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return `Location: ${locationParts.join(", ")} (${latitude.toFixed(4)}, ${longitude.toFixed(4)}, ${timezone})`;
      }
    }
  } catch (error) {
    console.warn("Reverse geocoding failed:", error);
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `Location: ${latitude.toFixed(4)}, ${longitude.toFixed(4)} (${timezone})`;
}

/**
 * Returns the current location as a parenthesized prompt fragment, or `""` when
 * location is disabled or unknown.
 */
export function getLocationForPrompt() {
  if (!locationState.enabled || !locationState.locationString) {
    return "";
  }

  return ` (${locationState.locationString})`;
}

/** Disables location, clears cached state and storage, and refreshes the UI. */
export function disableLocation() {
  locationState.enabled = false;
  locationState.position = null;
  locationState.locationString = "";
  locationState.error = null;

  localStorage.setItem(STORAGE_KEYS.locationEnabled, "false");
  localStorage.removeItem(STORAGE_KEYS.lastKnownLocation);

  updateLocationUI();

  if (state.verboseLogging) {
    console.info("Location services disabled");
  }
}

/**
 * Restores location state from stored preferences on startup.
 *
 * @remarks
 * Reuses the cached position when it is under an hour old; otherwise (or when
 * the cache is missing/corrupt) requests a fresh fix if location was enabled.
 */
export function initializeLocationService() {
  const locationEnabled = localStorage.getItem(STORAGE_KEYS.locationEnabled) === "true";
  const lastKnownLocation = localStorage.getItem(STORAGE_KEYS.lastKnownLocation);

  locationState.enabled = locationEnabled;

  if (locationEnabled && lastKnownLocation) {
    try {
      const stored = JSON.parse(lastKnownLocation);
      const now = Date.now();
      const storedTime = stored.timestamp;

      if (now - storedTime < 3600000) {
        locationState.locationString = stored.locationString;
        locationState.position = {
          coords: stored.coords,
          timestamp: storedTime,
        };

        if (state.verboseLogging) {
          console.info("Using stored location:", stored.locationString);
        }
      } else {
        if (state.verboseLogging) {
          console.info("Stored location expired, requesting fresh location");
        }
        requestLocation();
      }
    } catch (error) {
      console.warn("Failed to parse stored location:", error);
      localStorage.removeItem(STORAGE_KEYS.lastKnownLocation);
      if (locationEnabled) {
        requestLocation();
      }
    }
  } else if (locationEnabled) {
    if (state.verboseLogging) {
      console.info("Location enabled but no stored data, requesting fresh location");
    }
    requestLocation();
  }

  updateLocationUI();
}

/** Syncs the location toggle and status text in the settings UI with state. */
export function updateLocationUI() {
  const locationToggle = document.getElementById("location-toggle") as HTMLInputElement | null;
  const locationStatus = document.getElementById("location-status");

  if (locationToggle) {
    locationToggle.checked = locationState.enabled;
  }

  if (locationStatus) {
    if (locationState.enabled && locationState.locationString) {
      locationStatus.textContent = `Current: ${locationState.locationString}`;
      locationStatus.className = "location-status success";
    } else if (locationState.error) {
      locationStatus.textContent = `Error: ${locationState.error}`;
      locationStatus.className = "location-status error";
    } else {
      locationStatus.textContent = "Location services disabled";
      locationStatus.className = "location-status disabled";
    }
  }
}
