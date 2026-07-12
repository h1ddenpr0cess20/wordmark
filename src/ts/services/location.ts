/**
 * Browser geolocation service.
 *
 * @remarks
 * Resolves and caches the user's approximate location (reverse-geocoded to a
 * human-readable string) so it can be injected into AI prompts, persisting the
 * enabled state and last-known position to localStorage.
 */

import { createScopedLogger } from "../utils/logger.ts";
import { STORAGE_KEYS, writeJSON } from "../utils/storage/storage.ts";

const logLocation = createScopedLogger("location");

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
 * Records a successfully resolved location: updates {@link locationState},
 * persists the enabled flag and last-known position, and builds the success
 * result payload. Shared by the geocoded and coordinate-only fallback paths.
 */
function commitLocation(position: GeoPositionLike, locationString: string): LocationResult {
  locationState.locationString = locationString;
  locationState.enabled = true;

  localStorage.setItem(STORAGE_KEYS.locationEnabled, "true");
  writeJSON(STORAGE_KEYS.lastKnownLocation, {
    coords: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    },
    timestamp: position.timestamp,
    locationString,
  });

  return {
    success: true,
    position,
    locationString,
    coordinates: {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    },
  };
}

/**
 * Whether the app is running inside the Electron desktop shell, where the
 * `wordmarkDesktop` preload bridge is exposed.
 */
function isDesktopShell() {
  return typeof window !== "undefined" && "wordmarkDesktop" in window;
}

/**
 * Resolves an approximate position from the client's IP address.
 *
 * @remarks
 * Chromium's `navigator.geolocation` needs Google's network location service
 * (a `GOOGLE_API_KEY`), which the Electron shell doesn't ship, so native
 * geolocation fails there with `POSITION_UNAVAILABLE`. This city-level
 * fallback keeps the feature working on desktop.
 */
export async function requestIpLocation(): Promise<LocationResult> {
  try {
    const response = await fetch("https://ipapi.co/json/", {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`IP geolocation request failed with status ${response.status}`);
    }

    const data = await response.json();
    const latitude = Number(data.latitude);
    const longitude = Number(data.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error("IP geolocation returned no coordinates");
    }

    const position: GeoPositionLike = {
      coords: { latitude, longitude },
      timestamp: Date.now(),
    };

    locationState.position = position;
    locationState.error = null;
    locationState.lastFetched = new Date().toISOString();

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const locationParts = [data.city, data.region, data.country_name].filter(Boolean);
    const locationString = locationParts.length > 0
      ? `Location: ${locationParts.join(", ")} (${latitude.toFixed(4)}, ${longitude.toFixed(4)}, ${timezone})`
      : `Location: ${latitude.toFixed(4)}, ${longitude.toFixed(4)} (${timezone})`;

    logLocation("Location obtained via IP geolocation");

    return commitLocation(position, locationString);
  } catch (error) {
    const errorMessage = "Location information unavailable";

    locationState.error = errorMessage;
    locationState.enabled = false;
    localStorage.setItem(STORAGE_KEYS.locationEnabled, "false");

    console.warn("IP geolocation error:", error);
    return { error: errorMessage };
  }
}

/**
 * Requests geolocation permission and resolves the current position.
 *
 * @remarks
 * In the Electron desktop shell, native geolocation is unavailable (Chromium's
 * location provider requires a Google API key), so failures fall back to
 * {@link requestIpLocation}.
 *
 * @returns A success payload with coordinates and a formatted string, or an
 * object with an `error` message. Never rejects.
 */
export async function requestLocation(): Promise<LocationResult> {
  if (!navigator.geolocation) {
    if (isDesktopShell()) {
      return requestIpLocation();
    }
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
          const result = commitLocation(position, locationString);

          logLocation("Location obtained");

          resolve(result);
        } catch {
          const basicLocation = `Location: ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
          resolve(commitLocation(position, basicLocation));
        }
      },
      (error) => {
        if (isDesktopShell() && error.code !== error.PERMISSION_DENIED) {
          logLocation("Native geolocation failed in desktop shell, falling back to IP geolocation");
          resolve(requestIpLocation());
          return;
        }

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

  logLocation("Location services disabled");
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

        logLocation("Using stored location");
      } else {
        logLocation("Stored location expired, requesting fresh location");
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
    logLocation("Location enabled but no stored data, requesting fresh location");
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
