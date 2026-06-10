/**
 * UI hook registry — a small indirection that lets low-level modules (such as
 * config.js) trigger UI updates without importing the heavy component graph.
 *
 * Components register their handlers here (e.g. settings.js sets
 * `uiHooks.updateModelsDropdown`), and callers invoke them defensively (the
 * hooks are optional since a handler may not be registered yet).
 */
export interface UiHooks {
  /** Re-render the model dropdown; pass true when the model fetch errored. */
  updateModelsDropdown?: (fetchError?: boolean) => void;
}

export const uiHooks: UiHooks = {};
