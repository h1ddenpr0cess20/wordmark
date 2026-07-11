/**
 * UI hook registry.
 *
 * @remarks
 * A small indirection that lets low-level modules (such as `config.ts`) trigger
 * UI updates without importing the heavy component graph. Components register
 * their handlers here (e.g. `settings.ts` sets `uiHooks.updateModelsDropdown`),
 * and callers invoke them defensively since a handler may not be registered yet.
 */
export interface UiHooks {
  /** Re-render the model dropdown; pass `true` when the model fetch errored. */
  updateModelsDropdown?: (fetchError?: boolean) => void;
  /** Rebuild the embedding-model dropdown for the active provider. */
  refreshEmbeddingModelUI?: () => void;
  /** Stop the party engine (abort in-flight turn, remove the control bar). */
  stopParty?: () => void;
}

/** The shared UI hook registry instance. */
export const uiHooks: UiHooks = {};
