import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadWindowScript } from './helpers/loadWindowScript.js';

function createLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

function loadLocationModule({ storage, navigator, document, fetchImpl, windowOverrides = {}, globals = {} }) {
  const modulePath = path.resolve('src/js/services/location.js');
  return loadWindowScript(modulePath, {
    window: { ...windowOverrides },
    navigator,
    document: document || {
      getElementById() {
        return null;
      },
    },
    globals: {
      localStorage: storage,
      fetch: fetchImpl,
      AbortSignal,
      ...globals,
    },
  });
}

test('requestLocation returns error when geolocation unsupported', async () => {
  const storage = createLocalStorage();
  const navigatorStub = {};

  const windowObj = loadLocationModule({
    storage,
    navigator: navigatorStub,
  });

  const result = await windowObj.requestLocation();
  assert.equal(result.error, 'Geolocation is not supported by this browser');
  assert.equal(windowObj.locationState.enabled, false);
  assert.equal(storage.getItem('locationEnabled'), null);
});

test('requestLocation stores formatted location on success', async () => {
  const storage = createLocalStorage();
  const position = {
    coords: { latitude: 51.5, longitude: -0.12 },
    timestamp: Date.now(),
  };

  const navigatorStub = {
    geolocation: {
      getCurrentPosition(success) {
        setImmediate(() => success(position));
      },
    },
  };

  const windowObj = loadLocationModule({
    storage,
    navigator: navigatorStub,
  });

  const formatted = 'Location: London, UK (51.5000, -0.1200, Europe/London)';
  windowObj.formatLocationString = async () => formatted;

  const result = await windowObj.requestLocation();
  assert.equal(result.success, true);
  assert.equal(result.locationString, formatted);
  assert.equal(windowObj.locationState.enabled, true);
  assert.equal(windowObj.locationState.locationString, formatted);
  assert.equal(storage.getItem('locationEnabled'), 'true');

  const stored = JSON.parse(storage.getItem('lastKnownLocation'));
  assert.equal(stored.locationString, formatted);
  assert.equal(stored.coords.latitude, position.coords.latitude);
});

test('requestLocation falls back to coordinates when formatter fails', async () => {
  const storage = createLocalStorage();
  const position = {
    coords: { latitude: 40.7128, longitude: -74.006 },
    timestamp: Date.now(),
  };

  const navigatorStub = {
    geolocation: {
      getCurrentPosition(success) {
        setImmediate(() => success(position));
      },
    },
  };

  const windowObj = loadLocationModule({
    storage,
    navigator: navigatorStub,
  });

  windowObj.formatLocationString = async () => {
    throw new Error('reverse geocode failed');
  };

  const result = await windowObj.requestLocation();
  assert.equal(result.success, true);
  assert.ok(result.locationString.includes('40.7128'));
  assert.ok(result.locationString.includes('-74.0060'));
  assert.equal(windowObj.locationState.enabled, true);
});

test('requestLocation maps geolocation errors to friendly message', async () => {
  const storage = createLocalStorage();
  const errorObj = {
    code: 1,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  };

  const navigatorStub = {
    geolocation: {
      getCurrentPosition(_success, failure) {
        setImmediate(() => failure(errorObj));
      },
    },
  };

  const windowObj = loadLocationModule({
    storage,
    navigator: navigatorStub,
  });

  const result = await windowObj.requestLocation();
  assert.equal(result.error, 'Location access denied by user');
  assert.equal(windowObj.locationState.enabled, false);
  assert.equal(storage.getItem('locationEnabled'), 'false');
});

test('formatLocationString uses reverse geocoding when available', async () => {
  const storage = createLocalStorage();
  const navigatorStub = {
    geolocation: {
      getCurrentPosition() {},
    },
  };

  const fetchCalls = [];
  const fetchImpl = async (url) => {
    fetchCalls.push(url);
    return {
      ok: true,
      json: async () => ({
        city: 'Paris',
        principalSubdivision: 'Île-de-France',
        countryName: 'France',
      }),
    };
  };

  const windowObj = loadLocationModule({
    storage,
    navigator: navigatorStub,
    fetchImpl,
  });

  const position = {
    coords: { latitude: 48.8566, longitude: 2.3522 },
  };

  const result = await windowObj.formatLocationString(position);
  assert.ok(fetchCalls[0].includes('latitude=48.8566'));
  assert.ok(result.includes('Paris'));
  assert.ok(result.includes('Île-de-France'));
  assert.ok(result.includes('France'));
});

test('formatLocationString falls back when fetch fails', async () => {
  const storage = createLocalStorage();
  const navigatorStub = {
    geolocation: {
      getCurrentPosition() {},
    },
  };

  const fetchImpl = async () => {
    throw new Error('network down');
  };

  const windowObj = loadLocationModule({
    storage,
    navigator: navigatorStub,
    fetchImpl,
  });

  const position = {
    coords: { latitude: 34.05, longitude: -118.25 },
  };

  const result = await windowObj.formatLocationString(position);
  assert.ok(result.includes('34.0500'));
  assert.ok(result.includes('-118.2500'));
});

test('initializeLocationService restores recent stored location', () => {
  const recentTimestamp = Date.now() - 30 * 60 * 1000;
  const storage = createLocalStorage({
    locationEnabled: 'true',
    lastKnownLocation: JSON.stringify({
      coords: { latitude: 10, longitude: 20 },
      timestamp: recentTimestamp,
      locationString: 'Stored Place',
    }),
  });

  let updateCount = 0;
  const windowObj = loadLocationModule({
    storage,
    navigator: {
      geolocation: {
        getCurrentPosition() {},
      },
    },
  });

  windowObj.updateLocationUI = () => {
    updateCount += 1;
  };

  windowObj.initializeLocationService();
  assert.equal(windowObj.locationState.enabled, true);
  assert.equal(windowObj.locationState.locationString, 'Stored Place');
  assert.equal(updateCount, 1);
});

test('initializeLocationService requests fresh location when stored expires', () => {
  const oldTimestamp = Date.now() - 2 * 3600000;
  const storage = createLocalStorage({
    locationEnabled: 'true',
    lastKnownLocation: JSON.stringify({
      coords: { latitude: 1, longitude: 2 },
      timestamp: oldTimestamp,
      locationString: 'Old Place',
    }),
  });

  let requestCount = 0;
  const windowObj = loadLocationModule({
    storage,
    navigator: {
      geolocation: {
        getCurrentPosition() {},
      },
    },
  });

  windowObj.updateLocationUI = () => {};
  windowObj.requestLocation = () => {
    requestCount += 1;
  };

  windowObj.initializeLocationService();
  assert.equal(requestCount, 1);
});

test('disableLocation clears state and updates UI', () => {
  const storage = createLocalStorage({
    locationEnabled: 'true',
    lastKnownLocation: JSON.stringify({}),
  });

  const statusNode = { textContent: '', className: '' };
  const toggleNode = { checked: true };
  const documentStub = {
    getElementById(id) {
      if (id === 'location-toggle') {
        return toggleNode;
      }
      if (id === 'location-status') {
        return statusNode;
      }
      return null;
    },
  };

  const windowObj = loadLocationModule({
    storage,
    document: documentStub,
    navigator: {
      geolocation: {
        getCurrentPosition() {},
      },
    },
  });

  windowObj.locationState.enabled = true;
  windowObj.locationState.locationString = 'Somewhere';

  windowObj.disableLocation();
  assert.equal(windowObj.locationState.enabled, false);
  assert.equal(storage.getItem('locationEnabled'), 'false');
  assert.equal(toggleNode.checked, false);
  assert.equal(statusNode.textContent, 'Location services disabled');
  assert.equal(statusNode.className, 'location-status disabled');
});
