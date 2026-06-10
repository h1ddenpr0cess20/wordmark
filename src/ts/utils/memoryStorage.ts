/**
 * Memory Storage Utilities using localStorage (JSON)
 * Stores brief user-provided memories as an array of strings.
 */

import { STORAGE_KEYS, writeJSON } from "./storage.ts";

const MEMORY_ENABLED_KEY = STORAGE_KEYS.memoryEnabled;
const MEMORY_LIMIT_KEY = STORAGE_KEYS.memoryLimit;
const MEMORIES_KEY = STORAGE_KEYS.memories;

/** Seeds the enabled/limit/memories keys with defaults when absent. */
function ensureMemoryDefaults() {
  if (localStorage.getItem(MEMORY_ENABLED_KEY) === null) {
    localStorage.setItem(MEMORY_ENABLED_KEY, "false");
  }
  if (localStorage.getItem(MEMORY_LIMIT_KEY) === null) {
    localStorage.setItem(MEMORY_LIMIT_KEY, "25");
  }
  if (localStorage.getItem(MEMORIES_KEY) === null) {
    writeJSON(MEMORIES_KEY, []);
  }
}

/** Returns the memory feature config: `{ enabled, limit }` (limit ≥ 1). */
export function getMemoryConfig() {
  ensureMemoryDefaults();
  return {
    enabled: localStorage.getItem(MEMORY_ENABLED_KEY) === "true",
    limit: Math.max(1, parseInt(localStorage.getItem(MEMORY_LIMIT_KEY) || "25", 10)),
  };
}

/** Enables or disables the memory feature and emits a `memories:config` event. */
export function setMemoryEnabled(enabled: boolean) {
  localStorage.setItem(MEMORY_ENABLED_KEY, enabled ? "true" : "false");
  try { window.dispatchEvent(new CustomEvent("memories:config", { detail: { key: "enabled", value: Boolean(enabled) } })); } catch {}
}

/** Sets the maximum stored memories (≥ 1), trimming the oldest beyond the limit. */
export function setMemoryLimit(limit: string | number) {
  const newLimit = Math.max(1, parseInt(String(limit), 10) || 25);
  localStorage.setItem(MEMORY_LIMIT_KEY, String(newLimit));
  const mems = getMemories();
  if (mems.length > newLimit) {
    const trimmed = mems.slice(-newLimit);
    writeJSON(MEMORIES_KEY, trimmed);
    try { window.dispatchEvent(new CustomEvent("memories:changed", { detail: { type: "trim", count: trimmed.length } })); } catch {}
  }
  try { window.dispatchEvent(new CustomEvent("memories:config", { detail: { key: "limit", value: newLimit } })); } catch {}
}

/** Returns the stored memory strings, or `[]` if none/parse fails. */
export function getMemories(): string[] {
  ensureMemoryDefaults();
  try {
    const raw = localStorage.getItem(MEMORIES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch (e) {
    console.warn("Failed to parse memories:", e);
    return [];
  }
}

/**
 * Adds a memory (trimmed to 600 chars), evicting the oldest past the limit.
 *
 * @returns `{ ok, count }` on success, or `{ ok: false, reason }`.
 */
export function addMemory(text: string) {
  if (!text || typeof text !== "string") return { ok: false, reason: "invalid" };
  const trimmed = text.trim().slice(0, 600);
  if (!trimmed) return { ok: false, reason: "empty" };
  const { limit } = getMemoryConfig();
  const mems = getMemories();
  mems.push(trimmed);
  const final = mems.length > limit ? mems.slice(-limit) : mems;
  writeJSON(MEMORIES_KEY, final);
  try { window.dispatchEvent(new CustomEvent("memories:changed", { detail: { type: "add", value: trimmed } })); } catch {}
  return { ok: true, count: final.length };
}

/** Removes all stored memories and emits a `memories:changed` clear event. */
export function clearAllMemories() {
  writeJSON(MEMORIES_KEY, []);
  try { window.dispatchEvent(new CustomEvent("memories:changed", { detail: { type: "clear" } })); } catch {}
  return { ok: true };
}

/**
 * Removes the memory at `index`.
 *
 * @returns `{ ok, count }` on success, or `{ ok: false, reason: "range" }`.
 */
export function removeMemoryAt(index: number) {
  const mems = getMemories();
  if (index < 0 || index >= mems.length) return { ok: false, reason: "range" };
  mems.splice(index, 1);
  writeJSON(MEMORIES_KEY, mems);
  try { window.dispatchEvent(new CustomEvent("memories:changed", { detail: { type: "remove", index } })); } catch {}
  return { ok: true, count: mems.length };
}

/**
 * Returns the stored memories formatted as a system-prompt block, or `""` when
 * the feature is disabled or there are none.
 */
export function getMemoriesForPrompt() {
  const cfg = getMemoryConfig();
  if (!cfg.enabled) return "";
  const mems = getMemories();
  if (!mems.length) return "";
  const bullets = mems.map(m => `  - ${m}`).join("\n");
  return `\nDetails remembered about the user (use these only if relevant to the conversation):\n${bullets}\n`;
}
