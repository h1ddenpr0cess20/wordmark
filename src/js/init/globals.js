/**
 * Backward-compatibility bridge for the window-globals migration.
 *
 * The authoritative storage now lives in state.js (`state` and `elements`).
 * This module mirrors every key onto `window.*` via accessors so modules that
 * have not yet been converted keep reading/writing the same values — including
 * reassignments like `window.conversationHistory = []`. Once all consumers
 * import from state.js directly, this bridge can be deleted.
 */

import { state, elements } from "./state.js";

function bridge(target) {
  for (const key of Object.keys(target)) {
    Object.defineProperty(window, key, {
      configurable: true,
      enumerable: true,
      get: () => target[key],
      set: (value) => { target[key] = value; },
    });
  }
}

bridge(state);
bridge(elements);
