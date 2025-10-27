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

window.getMemoryConfig = function() {
  ensureMemoryDefaults();
  return {
    enabled: localStorage.getItem(MEMORY_ENABLED_KEY) === "true",
    limit: Math.max(1, parseInt(localStorage.getItem(MEMORY_LIMIT_KEY) || "25", 10)),
  };
};

window.setMemoryEnabled = function(enabled) {
  localStorage.setItem(MEMORY_ENABLED_KEY, enabled ? "true" : "false");
  window.memoryConfig = window.getMemoryConfig();
  try { window.dispatchEvent(new CustomEvent("memories:config", { detail: { key: "enabled", value: Boolean(enabled) } })); } catch {}
};

window.setMemoryLimit = function(limit) {
  const newLimit = Math.max(1, parseInt(limit, 10) || 25);
  localStorage.setItem(MEMORY_LIMIT_KEY, String(newLimit));
  // Trim existing memories if needed
  const mems = window.getMemories();
  if (mems.length > newLimit) {
    const trimmed = mems.slice(-newLimit);
    localStorage.setItem(MEMORIES_KEY, JSON.stringify(trimmed));
    try { window.dispatchEvent(new CustomEvent("memories:changed", { detail: { type: "trim", count: trimmed.length } })); } catch {}
  }
  window.memoryConfig = window.getMemoryConfig();
  try { window.dispatchEvent(new CustomEvent("memories:config", { detail: { key: "limit", value: newLimit } })); } catch {}
};

window.getMemories = function() {
  ensureMemoryDefaults();
  try {
    const raw = localStorage.getItem(MEMORIES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch (e) {
    console.warn("Failed to parse memories:", e);
    return [];
  }
};

window.addMemory = function(text) {
  if (!text || typeof text !== "string") return { ok: false, reason: "invalid" };
  const trimmed = text.trim().slice(0, 600); // guardrail length ~ three long sentences
  if (!trimmed) return { ok: false, reason: "empty" };
  const { limit } = window.getMemoryConfig();
  const mems = window.getMemories();
  mems.push(trimmed);
  const final = mems.length > limit ? mems.slice(-limit) : mems;
  localStorage.setItem(MEMORIES_KEY, JSON.stringify(final));
  try { window.dispatchEvent(new CustomEvent("memories:changed", { detail: { type: "add", value: trimmed } })); } catch {}
  return { ok: true, count: final.length };
};

window.clearAllMemories = function() {
  localStorage.setItem(MEMORIES_KEY, JSON.stringify([]));
  try { window.dispatchEvent(new CustomEvent("memories:changed", { detail: { type: "clear" } })); } catch {}
  return { ok: true };
};

window.removeMemoryAt = function(index) {
  const mems = window.getMemories();
  if (index < 0 || index >= mems.length) return { ok: false, reason: "range" };
  mems.splice(index, 1);
  localStorage.setItem(MEMORIES_KEY, JSON.stringify(mems));
  try { window.dispatchEvent(new CustomEvent("memories:changed", { detail: { type: "remove", index } })); } catch {}
  return { ok: true, count: mems.length };
};

window.getMemoriesForPrompt = function() {
  const cfg = window.getMemoryConfig();
  if (!cfg.enabled) return "";
  const mems = window.getMemories();
  if (!mems.length) return "";
  const bullets = mems.map(m => `  - ${m}`).join("\n");
  return `\nDetails remembered about the user (use these only if relevant to the conversation):\n${bullets}\n`;
};

// Initialize a runtime cache/config
if (typeof window !== "undefined") {
  window.memoryConfig = window.getMemoryConfig();
}
