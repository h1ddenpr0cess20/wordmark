/**
 * Memory Storage Utilities using localStorage (JSON)
 * Stores brief user-provided memories as an array of strings.
 */

const MEMORY_ENABLED_KEY = "memoryEnabled";
const MEMORY_LIMIT_KEY = "memoryLimit";
const MEMORIES_KEY = "memories";

// Initialize defaults if missing
function ensureMemoryDefaults() {
  if (localStorage.getItem(MEMORY_ENABLED_KEY) === null) {
    localStorage.setItem(MEMORY_ENABLED_KEY, "false");
  }
  if (localStorage.getItem(MEMORY_LIMIT_KEY) === null) {
    localStorage.setItem(MEMORY_LIMIT_KEY, "25");
  }
  if (localStorage.getItem(MEMORIES_KEY) === null) {
    localStorage.setItem(MEMORIES_KEY, JSON.stringify([]));
  }
}

export function getMemoryConfig() {
  ensureMemoryDefaults();
  return {
    enabled: localStorage.getItem(MEMORY_ENABLED_KEY) === "true",
    limit: Math.max(1, parseInt(localStorage.getItem(MEMORY_LIMIT_KEY) || "25", 10)),
  };
}

export function setMemoryEnabled(enabled: boolean) {
  localStorage.setItem(MEMORY_ENABLED_KEY, enabled ? "true" : "false");
  try { window.dispatchEvent(new CustomEvent("memories:config", { detail: { key: "enabled", value: Boolean(enabled) } })); } catch {}
}

export function setMemoryLimit(limit: string | number) {
  const newLimit = Math.max(1, parseInt(String(limit), 10) || 25);
  localStorage.setItem(MEMORY_LIMIT_KEY, String(newLimit));
  // Trim existing memories if needed
  const mems = getMemories();
  if (mems.length > newLimit) {
    const trimmed = mems.slice(-newLimit);
    localStorage.setItem(MEMORIES_KEY, JSON.stringify(trimmed));
    try { window.dispatchEvent(new CustomEvent("memories:changed", { detail: { type: "trim", count: trimmed.length } })); } catch {}
  }
  try { window.dispatchEvent(new CustomEvent("memories:config", { detail: { key: "limit", value: newLimit } })); } catch {}
}

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

export function addMemory(text: string) {
  if (!text || typeof text !== "string") return { ok: false, reason: "invalid" };
  const trimmed = text.trim().slice(0, 600); // guardrail length ~ three long sentences
  if (!trimmed) return { ok: false, reason: "empty" };
  const { limit } = getMemoryConfig();
  const mems = getMemories();
  mems.push(trimmed);
  const final = mems.length > limit ? mems.slice(-limit) : mems;
  localStorage.setItem(MEMORIES_KEY, JSON.stringify(final));
  try { window.dispatchEvent(new CustomEvent("memories:changed", { detail: { type: "add", value: trimmed } })); } catch {}
  return { ok: true, count: final.length };
}

export function clearAllMemories() {
  localStorage.setItem(MEMORIES_KEY, JSON.stringify([]));
  try { window.dispatchEvent(new CustomEvent("memories:changed", { detail: { type: "clear" } })); } catch {}
  return { ok: true };
}

export function removeMemoryAt(index: number) {
  const mems = getMemories();
  if (index < 0 || index >= mems.length) return { ok: false, reason: "range" };
  mems.splice(index, 1);
  localStorage.setItem(MEMORIES_KEY, JSON.stringify(mems));
  try { window.dispatchEvent(new CustomEvent("memories:changed", { detail: { type: "remove", index } })); } catch {}
  return { ok: true, count: mems.length };
}

export function getMemoriesForPrompt() {
  const cfg = getMemoryConfig();
  if (!cfg.enabled) return "";
  const mems = getMemories();
  if (!mems.length) return "";
  const bullets = mems.map(m => `  - ${m}`).join("\n");
  return `\nDetails remembered about the user (use these only if relevant to the conversation):\n${bullets}\n`;
}
