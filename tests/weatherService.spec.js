import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadWindowScript } from './helpers/loadWindowScript.js';

function loadWeatherModule(fetchImpl) {
  const modulePath = path.resolve('src/js/services/weather.js');
  return loadWindowScript(modulePath, {
    globals: {
      fetch: fetchImpl,
      URL,
      URLSearchParams,
    },
  });
}

test('weatherToolHandler requires city argument', async () => {
  const fetchImpl = async () => {
    throw new Error('should not fetch');
  };
  const windowObj = loadWeatherModule(fetchImpl);

  const result = await windowObj.weatherToolHandler({});
  assert.equal(result.error, 'city is required');
});

test('weatherToolHandler reports geocode request failures', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 503,
    statusText: 'Service Unavailable',
    text: async () => 'maintenance',
  });

  const windowObj = loadWeatherModule(fetchImpl);
  const result = await windowObj.weatherToolHandler({ city: 'London' });
  assert.equal(result.error, 'geocoding request failed: 503 Service Unavailable: maintenance');
});

test('weatherToolHandler handles missing geocode results', async () => {
  const fetchCalls = [];
  const fetchImpl = async (url) => {
    fetchCalls.push(url);
    return {
      ok: true,
      json: async () => ({ results: [] }),
    };
  };

  const windowObj = loadWeatherModule(fetchImpl);
  const result = await windowObj.weatherToolHandler({ city: 'Atlantis' });
  assert.equal(result.error, "City 'Atlantis' not found");
  assert.equal(fetchCalls.length, 1);
});

test('weatherToolHandler normalizes days and returns forecast summary', async () => {
  const fetchCalls = [];
  const fetchImpl = async (url) => {
    fetchCalls.push(url);
    if (url.includes('geocoding-api')) {
      return {
        ok: true,
        json: async () => ({
          results: [
            {
              latitude: 37.7749,
              longitude: -122.4194,
            },
          ],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        timezone: 'America/Los_Angeles',
        daily: {
          temperature_2m_max: [20],
          temperature_2m_min: [12],
          precipitation_probability_max: [5],
        },
      }),
    };
  };

  const windowObj = loadWeatherModule(fetchImpl);
  const result = await windowObj.weatherToolHandler({ city: 'San Francisco', days: '10' });

  assert.equal(result.city, 'San Francisco');
  assert.equal(result.coords.lat, 37.7749);
  assert.equal(result.coords.lon, -122.4194);
  assert.equal(result.days, 7);
  assert.equal(result.timezone, 'America/Los_Angeles');
  assert.ok(Array.isArray(result.daily.temperature_2m_max));
  assert.equal(fetchCalls.length, 2);
  assert.ok(fetchCalls[1].includes('forecast_days=7'));
});
