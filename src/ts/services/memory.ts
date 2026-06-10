import { getMemories, addMemory, removeMemoryAt, getMemoryConfig } from "../utils/memoryStorage.ts";
import { toolImplementations } from "./toolImplementations.ts";
/**
 * Memory function-call tools.
 *
 * @remarks
 * Defines and registers the `remember` and `forget` tools, which let the model
 * persist and remove brief user memories via {@link toolImplementations}.
 */

/** Tool definition for `remember`: stores a brief memory. */
export const memoryToolDefinition = {
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

toolImplementations.remember = async function(args) {
  try {
    const cfg = getMemoryConfig ? getMemoryConfig() : { enabled: false, limit: 25 };
    if (!cfg.enabled) {
      return { ok: false, message: "Memory feature disabled" };
    }
    const text = (args && typeof args.memory === "string") ? args.memory : "";
    const res = addMemory ? addMemory(text) : { ok: false, message: "Storage not available" };
    return {
      ok: Boolean(res.ok),
      stored: Boolean(res.ok) ? text : undefined,
      total: ("count" in res ? res.count : undefined) || getMemories()?.length || 0,
    };
  } catch (e) {
    console.error("remember tool error:", e);
    return { ok: false, message: (e instanceof Error ? e.message : "") || "Unknown error" };
  }
};

/** Tool definition for `forget`: removes a stored memory by keyword. */
export const forgetToolDefinition = {
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

toolImplementations.forget = async function(args) {
  try {
    const cfg = getMemoryConfig ? getMemoryConfig() : { enabled: false };
    if (!cfg.enabled) return { ok: false, message: "Memory feature disabled" };

    const keyword = (args && typeof args.keyword === "string") ? args.keyword.trim() : "";
    if (!keyword) return { ok: false, message: "Missing keyword" };

    const mems = getMemories ? getMemories() : [];
    const matches: { index: number; memory: string }[] = [];
    const lower = keyword.toLowerCase();
    mems.forEach((m, i) => {
      if (typeof m === "string" && m.toLowerCase().includes(lower)) {
        matches.push({ index: i, memory: m });
      }
    });
    if (matches.length === 0) {
      return { ok: false, message: "No matching memory found", keyword, matches: [] };
    }
    const removedIndex = matches[0].index;
    const removed = matches[0].memory;
    if (removeMemoryAt) removeMemoryAt(removedIndex);
    const remaining = (getMemories ? getMemories() : []).length;
    return { ok: true, keyword, removed, removed_index: removedIndex, matches, remaining };
  } catch (e) {
    console.error("forget tool error:", e);
    return { ok: false, message: (e instanceof Error ? e.message : "") || "Unknown error" };
  }
};
