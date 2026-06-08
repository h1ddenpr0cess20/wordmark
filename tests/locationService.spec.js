import test from 'node:test';
import assert from 'node:assert/strict';

function createLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
  };
}

const nullDocument = { getElementById() { return null; } };

// globalThis.navigator is a read-only getter in Node; make it writable for stubbing.
Object.defineProperty(globalThis, "navigator", { value: undefined, configurable: true, writable: true });

globalThis.window = {};
globalThis.document = nullDocument;
globalThis.localStorage = createLocalStorage();

const {
  locationState,
  requestLocation,
  formatLocationString,
  initializeLocationService,
  disableLocation,
} = await import('../src/js/services/location.js');

function resetLocationState() {
  locationState.enabled = false;
  locationState.position = null;
  locationState.locationString = "";
  locationState.lastFetched = null;
  locationState.error = null;
}

test('requestLocation returns error when geolocation unsupported', async () => {
  resetLocationState();
  const storage = createLocalStorage();
  globalThis.localStorage = storage;
  globalThis.navigator = {};
  globalThis.document = nullDocument;

  const result = await requestLocation();
  assert.equal(result.error, 'Geolocation is not supported by this browser');
  assert.equal(locationState.enabled, false);
  assert.equal(storage.getItem('locationEnabled'), null);
});

test('requestLocation stores formatted location on success (via reverse geocode)', async () => {
  resetLocationState();
  const storage = createLocalStorage();
  globalThis.localStorage = storage;
  globalThis.document = nullDocument;
  const position = { coords: { latitude: 51.5, longitude: -0.12 }, timestamp: Date.now() };
  globalThis.navigator = {
    geolocation: { getCurrentPosition(success) { setImmediate(() => success(position)); } },
  };
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ city: 'London', principalSubdivision: 'England', countryName: 'UK' }),
  });

  const result = await requestLocation();
  assert.equal(result.success, true);
  assert.ok(result.locationString.includes('London'));
  assert.equal(locationState.enabled, true);
  assert.ok(locationState.locationString.includes('London'));
  assert.equal(storage.getItem('locationEnabled'), 'true');

  const stored = JSON.parse(storage.getItem('lastKnownLocation'));
  assert.ok(stored.locationString.includes('London'));
  assert.equal(stored.coords.latitude, position.coords.latitude);
});

test('requestLocation falls back to coordinates when reverse geocode fails', async () => {
  resetLocationState();
  const storage = createLocalStorage();
  globalThis.localStorage = storage;
  globalThis.document = nullDocument;
  const position = { coords: { latitude: 40.7128, longitude: -74.006 }, timestamp: Date.now() };
  globalThis.navigator = {
    geolocation: { getCurrentPosition(success) { setImmediate(() => success(position)); } },
  };
  globalThis.fetch = async () => { throw new Error('network down'); };

  const result = await requestLocation();
  assert.equal(result.success, true);
  assert.ok(result.locationString.includes('40.7128'));
  assert.ok(result.locationString.includes('-74.0060'));
  assert.equal(locationState.enabled, true);
});

test('requestLocation maps geolocation errors to friendly message', async () => {
  resetLocationState();
  const storage = createLocalStorage();
  globalThis.localStorage = storage;
  globalThis.document = nullDocument;
  const errorObj = { code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
  globalThis.navigator = {
    geolocation: { getCurrentPosition(_success, failure) { setImmediate(() => failure(errorObj)); } },
  };

  const result = await requestLocation();
  assert.equal(result.error, 'Location access denied by user');
  assert.equal(locationState.enabled, false);
  assert.equal(storage.getItem('locationEnabled'), 'false');
});

test('formatLocationString uses reverse geocoding when available', async () => {
  const fetchCalls = [];
  globalThis.fetch = async (url) => {
    fetchCalls.push(url);
    return {
      ok: true,
      json: async () => ({ city: 'Paris', principalSubdivision: 'Île-de-France', countryName: 'France' }),
    };
  };

  const result = await formatLocationString({ coords: { latitude: 48.8566, longitude: 2.3522 } });
  assert.ok(fetchCalls[0].includes('latitude=48.8566'));
  assert.ok(result.includes('Paris'));
  assert.ok(result.includes('Île-de-France'));
  assert.ok(result.includes('France'));
});

test('formatLocationString falls back when fetch fails', async () => {
  globalThis.fetch = async () => { throw new Error('network down'); };

  const result = await formatLocationString({ coords: { latitude: 34.05, longitude: -118.25 } });
  assert.ok(result.includes('34.0500'));
  assert.ok(result.includes('-118.2500'));
});

test('initializeLocationService restores recent stored location', () => {
  resetLocationState();
  const recentTimestamp = Date.now() - 30 * 60 * 1000;
  globalThis.localStorage = createLocalStorage({
    locationEnabled: 'true',
    lastKnownLocation: JSON.stringify({
      coords: { latitude: 10, longitude: 20 },
      timestamp: recentTimestamp,
      locationString: 'Stored Place',
    }),
  });
  globalThis.document = nullDocument;
  let geoCalls = 0;
  globalThis.navigator = { geolocation: { getCurrentPosition() { geoCalls += 1; } } };

  initializeLocationService();
  assert.equal(locationState.enabled, true);
  assert.equal(locationState.locationString, 'Stored Place');
  assert.equal(geoCalls, 0); // recent location => no fresh request
});

test('initializeLocationService requests fresh location when stored expires', () => {
  resetLocationState();
  const oldTimestamp = Date.now() - 2 * 3600000;
  globalThis.localStorage = createLocalStorage({
    locationEnabled: 'true',
    lastKnownLocation: JSON.stringify({
      coords: { latitude: 1, longitude: 2 },
      timestamp: oldTimestamp,
      locationString: 'Old Place',
    }),
  });
  globalThis.document = nullDocument;
  let geoCalls = 0;
  globalThis.navigator = { geolocation: { getCurrentPosition() { geoCalls += 1; } } };

  initializeLocationService();
  assert.equal(geoCalls, 1); // expired => requestLocation() triggers getCurrentPosition
});

test('disableLocation clears state and updates UI', () => {
  resetLocationState();
  const storage = createLocalStorage({ locationEnabled: 'true', lastKnownLocation: JSON.stringify({}) });
  globalThis.localStorage = storage;
  const statusNode = { textContent: '', className: '' };
  const toggleNode = { checked: true };
  globalThis.document = {
    getElementById(id) {
      if (id === 'location-toggle') return toggleNode;
      if (id === 'location-status') return statusNode;
      return null;
    },
  };
  globalThis.navigator = { geolocation: { getCurrentPosition() {} } };

  locationState.enabled = true;
  locationState.locationString = 'Somewhere';

  disableLocation();
  assert.equal(locationState.enabled, false);
  assert.equal(storage.getItem('locationEnabled'), 'false');
  assert.equal(toggleNode.checked, false);
  assert.equal(statusNode.textContent, 'Location services disabled');
  assert.equal(statusNode.className, 'location-status disabled');
});
