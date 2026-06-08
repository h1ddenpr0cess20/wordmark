/**
 * UI hook registry — a small indirection that lets low-level modules (such as
 * config.js) trigger UI updates without importing the heavy component graph.
 *
 * Components register their handlers here (e.g. settings.js sets
 * `uiHooks.updateModelsDropdown`), and callers invoke them defensively with
 * optional chaining since a hook may not be registered yet.
 */
export const uiHooks = {};
