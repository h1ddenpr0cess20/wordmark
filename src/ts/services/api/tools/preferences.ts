/**
 * Tool enable/disable preferences, persisted to localStorage.
 *
 * The preference map is keyed by catalog tool key; reads fall back to each
 * tool's `defaultEnabled`. This module owns the persistence and exposes the
 * catalog-aware enable/disable operations.
 */

import { STORAGE_KEYS, readJSON, writeJSON } from "../../../utils/storage/storage.ts";
import { TOOL_CATALOG } from "./catalog.ts";

const TOOL_STORAGE_KEY = STORAGE_KEYS.toolPreferences;

let toolPreferences = loadToolPreferences();

/** Reads the persisted tool-preference map from localStorage, or `{}`. */
export function loadToolPreferences(): Record<string, boolean> {
  const parsed = readJSON<Record<string, boolean>>(TOOL_STORAGE_KEY, {});
  return parsed && typeof parsed === "object" ? parsed : {};
}

function saveToolPreferences(prefs: Record<string, boolean>) {
  try {
    writeJSON(TOOL_STORAGE_KEY, prefs);
  } catch {
    /* Ignore storage errors */
  }
}

/**
 * Returns the stored preference for `key`, or `defaultEnabled` when the tool
 * has no explicit preference.
 */
export function getToolPreference(key: string, defaultEnabled: boolean): boolean {
  if (Object.prototype.hasOwnProperty.call(toolPreferences, key)) {
    return Boolean(toolPreferences[key]);
  }
  return defaultEnabled;
}

/** Reports whether the catalog tool `key` is currently enabled. */
export function isToolEnabled(key: string): boolean {
  const tool = TOOL_CATALOG.find(item => item.key === key);
  if (!tool) {
    return false;
  }
  return getToolPreference(key, tool.defaultEnabled !== false);
}

/** Enables or disables a single catalog tool and persists the change. */
export function setToolEnabled(key: string, enabled: boolean) {
  const tool = TOOL_CATALOG.find(item => item.key === key);
  if (!tool) {
    return;
  }
  toolPreferences = {
    ...toolPreferences,
    [key]: Boolean(enabled),
  };
  saveToolPreferences(toolPreferences);
}

/** Sets every catalog tool to the same enabled state and persists the change. */
export function setAllToolsEnabled(enabled: boolean) {
  const updated = { ...toolPreferences };
  TOOL_CATALOG.forEach(tool => {
    updated[tool.key] = Boolean(enabled);
  });
  toolPreferences = updated;
  saveToolPreferences(toolPreferences);
}

/** Drop a tool's stored preference (used when an MCP server is unregistered). */
export function removeToolPreference(key: string) {
  if (Object.prototype.hasOwnProperty.call(toolPreferences, key)) {
    delete toolPreferences[key];
    saveToolPreferences(toolPreferences);
  }
}
