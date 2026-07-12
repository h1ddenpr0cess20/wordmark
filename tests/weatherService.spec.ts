import test from 'node:test';
import assert from 'node:assert/strict';

const { weatherToolHandler } = await import('../src/ts/services/weather.js');

test('weatherToolHandler requires city argument', async () => {
  globalThis.fetch = async () => { throw new Error('should not fetch'); };
  const result = await weatherToolHandler({});
  assert.equal(result.error, 'city is required');
});

test('weatherToolHandler reports geocode request failures', async () => {
  globalThis.fetch = (async () => ({
    ok: false,
    status: 503,
    statusText: 'Service Unavailable',
    text: async () => 'maintenance',
  })) as unknown as typeof fetch;

  const result = await weatherToolHandler({ city: 'London' });
  assert.equal(result.error, 'geocoding request failed: 503 Service Unavailable: maintenance');
});

test('weatherToolHandler handles missing geocode results', async () => {
  const fetchCalls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    fetchCalls.push(url);
    return { ok: true, json: async () => ({ results: [] }) };
  }) as unknown as typeof fetch;

  const result = await weatherToolHandler({ city: 'Atlantis' });
  assert.equal(result.error, "City 'Atlantis' not found");
  assert.equal(fetchCalls.length, 1);
});

test('weatherToolHandler normalizes days and returns forecast summary', async () => {
  const fetchCalls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    fetchCalls.push(url);
    if (url.includes('geocoding-api')) {
      return {
        ok: true,
        json: async () => ({ results: [{ latitude: 37.7749, longitude: -122.4194 }] }),
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
  }) as unknown as typeof fetch;

  const result = await weatherToolHandler({ city: 'San Francisco', days: '10' });

  assert.equal(result.city, 'San Francisco');
  assert.equal(result.coords.lat, 37.7749);
  assert.equal(result.coords.lon, -122.4194);
  assert.equal(result.days, 7);
  assert.equal(result.timezone, 'America/Los_Angeles');
  assert.ok(Array.isArray(result.daily.temperature_2m_max));
  assert.equal(fetchCalls.length, 2);
  assert.ok(fetchCalls[1].includes('forecast_days=7'));
});
