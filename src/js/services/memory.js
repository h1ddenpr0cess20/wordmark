/**
 * Memory function definition and implementation
 * Exposes a separate function-call tool: `remember`
 */

// Define the memory tool separately from normal tool definitions
window.memoryToolDefinition = {
  type: "function",
  name: "remember",
  description: "Store a brief memory to personalize future responses. Use when the user specifically asks to remember a detail, or implies they want it to be remembered.  do not overuse.",
  parameters: {
    type: "object",
    properties: {
      memory: {
        type: "string",
        description: "A concise summary of the memory (few words to one or two sentences at maximum).",
      },
    },
    required: ["memory"],
    additionalProperties: false,
  },
  strict: false,
};

// Implementation registered in the same global map used by other tools
window.toolImplementations = window.toolImplementations || {};
window.toolImplementations.remember = async function(args) {
  try {
    const cfg = window.getMemoryConfig ? window.getMemoryConfig() : { enabled: false, limit: 25 };
    if (!cfg.enabled) {
      return { ok: false, message: "Memory feature disabled" };
    }
    const text = (args && typeof args.memory === "string") ? args.memory : "";
    const res = window.addMemory ? window.addMemory(text) : { ok: false, message: "Storage not available" };
    return {
      ok: Boolean(res.ok),
      stored: Boolean(res.ok) ? text : undefined,
      total: res.count || window.getMemories()?.length || 0,
    };
  } catch (e) {
    console.error("remember tool error:", e);
    return { ok: false, message: e.message || "Unknown error" };
  }
};

// Define a companion tool for forgetting a memory by keyword
window.forgetToolDefinition = {
  type: "function",
  name: "forget",
  description: "Forget a stored memory that matches a given keyword (case-insensitive substring). Use when the user asks to forget something.",
  parameters: {
    type: "object",
    properties: {
      keyword: {
        type: "string",
        description: "Keyword to match against saved memories (case-insensitive substring).",
      },
    },
    required: ["keyword"],
    additionalProperties: false,
  },
  strict: false,
};

window.toolImplementations.forget = async function(args) {
  try {
    const cfg = window.getMemoryConfig ? window.getMemoryConfig() : { enabled: false };
    if (!cfg.enabled) return { ok: false, message: "Memory feature disabled" };

    const keyword = (args && typeof args.keyword === "string") ? args.keyword.trim() : "";
    if (!keyword) return { ok: false, message: "Missing keyword" };

    const mems = window.getMemories ? window.getMemories() : [];
    const matches = [];
    const lower = keyword.toLowerCase();
    mems.forEach((m, i) => {
      if (typeof m === "string" && m.toLowerCase().includes(lower)) {
        matches.push({ index: i, memory: m });
      }
    });
    if (matches.length === 0) {
      return { ok: false, message: "No matching memory found", keyword, matches: [] };
    }
    // Remove the first match by default
    const removedIndex = matches[0].index;
    const removed = matches[0].memory;
    if (window.removeMemoryAt) window.removeMemoryAt(removedIndex);
    const remaining = (window.getMemories ? window.getMemories() : []).length;
    return { ok: true, keyword, removed, removed_index: removedIndex, matches, remaining };
  } catch (e) {
    console.error("forget tool error:", e);
    return { ok: false, message: e.message || "Unknown error" };
  }
};
