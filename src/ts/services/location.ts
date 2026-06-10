import { state } from "../init/state.ts";
import { STORAGE_KEYS, writeJSON } from "../utils/storage.ts";
/**
 * Location service for browser geolocation functionality
 * Provides location awareness for AI prompts
 */

// Structural position type covering both a real GeolocationPosition (from
// getCurrentPosition) and the lightweight object reconstructed from localStorage.
// Only coordinates and timestamp are ever read.
interface GeoPositionLike {
  coords: { latitude: number; longitude: number };
  timestamp: number;
}

// Result returned by requestLocation: a success payload or an error message.
interface LocationResult {
  success?: boolean;
  error?: string;
  position?: GeoPositionLike;
  locationString?: string;
  coordinates?: { lat: number; lng: number };
}

// Location state management
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
 * Request location permission and get current position
 * @returns {Promise<Object>} - Location data or error
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

        // Try to get human-readable location
        try {
          const locationString = await formatLocationString(position);
          locationState.locationString = locationString;
          locationState.enabled = true;

          // Save to localStorage for persistence
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
          // Even if reverse geocoding fails, we have coordinates
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
        maximumAge: 300000, // 5 minutes
      },
    );
  });
}

/**
 * Format location data into a human-readable string
 * @param {Position} position - Geolocation position object
 * @returns {Promise<string>} - Formatted location string
 */
export async function formatLocationString(position: GeoPositionLike) {
  const { latitude, longitude } = position.coords;

  try {
    // Try to get location name via reverse geocoding (using a free service)
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

  // Fallback to coordinates and timezone
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `Location: ${latitude.toFixed(4)}, ${longitude.toFixed(4)} (${timezone})`;
}

/**
 * Get current location string for prompt templates
 * @returns {string} - Formatted location string or empty string
 */
export function getLocationForPrompt() {
  if (!locationState.enabled || !locationState.locationString) {
    return "";
  }

  return ` (${locationState.locationString})`;
}

/**
 * Disable location services
 */
export function disableLocation() {
  locationState.enabled = false;
  locationState.position = null;
  locationState.locationString = "";
  locationState.error = null;

  localStorage.setItem(STORAGE_KEYS.locationEnabled, "false");
  localStorage.removeItem(STORAGE_KEYS.lastKnownLocation);

  // Update UI if available
  updateLocationUI();

  if (state.verboseLogging) {
    console.info("Location services disabled");
  }
}

/**
 * Initialize location service from stored preferences
 */
export function initializeLocationService() {
  const locationEnabled = localStorage.getItem(STORAGE_KEYS.locationEnabled) === "true";
  const lastKnownLocation = localStorage.getItem(STORAGE_KEYS.lastKnownLocation);

  // Always restore the enabled state from localStorage first
  locationState.enabled = locationEnabled;

  if (locationEnabled && lastKnownLocation) {
    try {
      const stored = JSON.parse(lastKnownLocation);
      const now = Date.now();
      const storedTime = stored.timestamp;

      // Use stored location if it's less than 1 hour old
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
        // Stored location is too old, request fresh location
        if (state.verboseLogging) {
          console.info("Stored location expired, requesting fresh location");
        }
        requestLocation();
      }
    } catch (error) {
      console.warn("Failed to parse stored location:", error);
      localStorage.removeItem(STORAGE_KEYS.lastKnownLocation);
      // If enabled but no valid stored location, try to get fresh location
      if (locationEnabled) {
        requestLocation();
      }
    }
  } else if (locationEnabled) {
    // User had enabled location but there's no stored location data
    // Try to get fresh location
    if (state.verboseLogging) {
      console.info("Location enabled but no stored data, requesting fresh location");
    }
    requestLocation();
  }

  // Update UI if available
  updateLocationUI();
}

/**
 * Update location UI elements
 */
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
