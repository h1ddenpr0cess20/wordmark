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
  /**
   * Clear any autonomous run and its planned steps. Registered by the agent
   * controls; called from persistence so starting or loading a conversation
   * never inherits the previous one's run.
   */
  resetAgentRun?: () => void;
  /** Re-render the rail's recent-conversation list from the store. */
  refreshRailConversations?: () => void;
  /** Refresh the provider/endpoint line at the foot of the rail. */
  updateRailServiceLine?: () => void;
  /** Show or hide the transcript's empty state to match the chat box. */
  refreshEmptyState?: () => void;
  /**
   * Redraw the composer's history-usage meter. Registered by the compaction
   * component; called from persistence so loading or starting a conversation
   * repoints the meter at the new transcript without persistence having to
   * import the component graph.
   */
  refreshHistoryMeter?: () => void;
}

/** The shared UI hook registry instance. */
export const uiHooks: UiHooks = {};
