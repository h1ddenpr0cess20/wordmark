/**
 * Weather tool implementation using Open-Meteo API
 */

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText}${text ? `: ${text}` : ""}`);
  }
  return response.json();
}

async function openMeteoForecast(args = {}) {
  const city = (args.city || "").trim();
  if (!city) {
    return { error: "city is required" };
  }

  let normalizedDays = Number.parseInt(args.days, 10);
  if (!Number.isFinite(normalizedDays)) {
    normalizedDays = 1;
  }
  normalizedDays = Math.max(1, Math.min(7, normalizedDays));

  let geocode;
  try {
    const params = new URLSearchParams({
      name: city,
      count: "1",
      language: "en",
      format: "json",
    });
    geocode = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`);
  } catch (error) {
    return { error: `geocoding request failed: ${error.message}` };
  }

  if (!geocode || !Array.isArray(geocode.results) || geocode.results.length === 0) {
    return { error: `City '${city}' not found` };
  }

  const loc = geocode.results[0];
  const lat = loc.latitude;
  const lon = loc.longitude;
  if (lat == null || lon == null) {
    return { error: "geocoding response missing coordinates" };
  }

  let forecast;
  try {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      forecast_days: String(normalizedDays),
      daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      timezone: "auto",
    });
    forecast = await fetchJson(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  } catch (error) {
    return { error: `forecast request failed: ${error.message}` };
  }

  return {
    city,
    coords: { lat, lon },
    timezone: forecast.timezone,
    daily: forecast.daily || {},
    days: normalizedDays,
  };
}

// Export the handler
window.weatherToolHandler = openMeteoForecast;
