/**
 * Location service for browser geolocation functionality
 * Provides location awareness for AI prompts
 */

// Location state management
window.locationState = {
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
window.requestLocation = async function() {
  if (!navigator.geolocation) {
    const error = "Geolocation is not supported by this browser";
    window.locationState.error = error;
    console.warn(error);
    return { error };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async(position) => {
        window.locationState.position = position;
        window.locationState.error = null;
        window.locationState.lastFetched = new Date().toISOString();

        // Try to get human-readable location
        try {
          const locationString = await window.formatLocationString(position);
          window.locationState.locationString = locationString;
          window.locationState.enabled = true;

          // Save to localStorage for persistence
          localStorage.setItem("locationEnabled", "true");
          localStorage.setItem("lastKnownLocation", JSON.stringify({
            coords: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            },
            timestamp: position.timestamp,
            locationString: locationString,
          }));

          if (window.VERBOSE_LOGGING) {
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
          window.locationState.locationString = basicLocation;
          window.locationState.enabled = true;

          localStorage.setItem("locationEnabled", "true");
          localStorage.setItem("lastKnownLocation", JSON.stringify({
            coords: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            },
            timestamp: position.timestamp,
            locationString: basicLocation,
          }));

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

        window.locationState.error = errorMessage;
        window.locationState.enabled = false;
        localStorage.setItem("locationEnabled", "false");

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
};

/**
 * Format location data into a human-readable string
 * @param {Position} position - Geolocation position object
 * @returns {Promise<string>} - Formatted location string
 */
window.formatLocationString = async function(position) {
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
};

/**
 * Get current location string for prompt templates
 * @returns {string} - Formatted location string or empty string
 */
window.getLocationForPrompt = function() {
  if (!window.locationState.enabled || !window.locationState.locationString) {
    return "";
  }

  return ` (${window.locationState.locationString})`;
};

/**
 * Disable location services
 */
window.disableLocation = function() {
  window.locationState.enabled = false;
  window.locationState.position = null;
  window.locationState.locationString = "";
  window.locationState.error = null;

  localStorage.setItem("locationEnabled", "false");
  localStorage.removeItem("lastKnownLocation");

  // Update UI if available
  if (typeof window.updateLocationUI === "function") {
    window.updateLocationUI();
  }

  if (window.VERBOSE_LOGGING) {
    console.info("Location services disabled");
  }
};

/**
 * Initialize location service from stored preferences
 */
window.initializeLocationService = function() {
  const locationEnabled = localStorage.getItem("locationEnabled") === "true";
  const lastKnownLocation = localStorage.getItem("lastKnownLocation");

  // Always restore the enabled state from localStorage first
  window.locationState.enabled = locationEnabled;

  if (locationEnabled && lastKnownLocation) {
    try {
      const stored = JSON.parse(lastKnownLocation);
      const now = Date.now();
      const storedTime = stored.timestamp;

      // Use stored location if it's less than 1 hour old
      if (now - storedTime < 3600000) {
        window.locationState.locationString = stored.locationString;
        window.locationState.position = {
          coords: stored.coords,
          timestamp: storedTime,
        };

        if (window.VERBOSE_LOGGING) {
          console.info("Using stored location:", stored.locationString);
        }
      } else {
        // Stored location is too old, request fresh location
        if (window.VERBOSE_LOGGING) {
          console.info("Stored location expired, requesting fresh location");
        }
        window.requestLocation();
      }
    } catch (error) {
      console.warn("Failed to parse stored location:", error);
      localStorage.removeItem("lastKnownLocation");
      // If enabled but no valid stored location, try to get fresh location
      if (locationEnabled) {
        window.requestLocation();
      }
    }
  } else if (locationEnabled) {
    // User had enabled location but there's no stored location data
    // Try to get fresh location
    if (window.VERBOSE_LOGGING) {
      console.info("Location enabled but no stored data, requesting fresh location");
    }
    window.requestLocation();
  }

  // Update UI if available
  if (typeof window.updateLocationUI === "function") {
    window.updateLocationUI();
  }
};

/**
 * Update location UI elements
 */
window.updateLocationUI = function() {
  const locationToggle = document.getElementById("location-toggle");
  const locationStatus = document.getElementById("location-status");

  if (locationToggle) {
    locationToggle.checked = window.locationState.enabled;
  }

  if (locationStatus) {
    if (window.locationState.enabled && window.locationState.locationString) {
      locationStatus.textContent = `Current: ${window.locationState.locationString}`;
      locationStatus.className = "location-status success";
    } else if (window.locationState.error) {
      locationStatus.textContent = `Error: ${window.locationState.error}`;
      locationStatus.className = "location-status error";
    } else {
      locationStatus.textContent = "Location services disabled";
      locationStatus.className = "location-status disabled";
    }
  }
};
