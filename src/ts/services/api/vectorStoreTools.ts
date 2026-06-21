/**
 * File-search vector store wiring for request tools.
 *
 * @remarks
 * Resolves the active vector store ids (the persisted active set plus any id
 * passed for the turn) and reconciles them against the request's tool list:
 * stamping `vector_store_ids` onto the `file_search` tool, or dropping that tool
 * when no stores are active. Extracted from {@link ./requestClient.ts}'s
 * `runTurn` so the resolution logic is isolated and self-contained.
 */

import { getActiveVectorStoreIds } from "../vectorStore.ts";
import type { ToolDefinition } from "../../../types/tools.ts";

/**
 * Applies the resolved vector store ids to a turn's enabled tools.
 *
 * @param enabledTools - The tools selected for the request.
 * @param explicitVectorStoreId - A vector store id supplied for this turn, if any.
 * @returns The tools with `file_search` carrying the active `vector_store_ids`,
 * or with `file_search` removed when no stores are active. Returned unchanged
 * when `enabledTools` is absent.
 */
export function applyVectorStoreIds(
  enabledTools: ToolDefinition[],
  explicitVectorStoreId?: string | null,
): ToolDefinition[] {
  if (!enabledTools) {
    return enabledTools;
  }

  const idsSet = new Set<string>();
  try {
    const activeIds = getActiveVectorStoreIds ? getActiveVectorStoreIds() : [];
    if (Array.isArray(activeIds)) {
      activeIds.forEach(id => { if (id) idsSet.add(id); });
    }
  } catch (error) {
    console.warn("Failed to read active vector store IDs:", error);
  }
  if (explicitVectorStoreId) {
    idsSet.add(explicitVectorStoreId);
  }
  const vectorStoreIds = Array.from(idsSet);

  if (vectorStoreIds.length > 0) {
    return enabledTools.map(tool => {
      if (tool && tool.type === "file_search") {
        return {
          ...tool,
          vector_store_ids: vectorStoreIds,
        };
      }
      return tool;
    });
  }
  return enabledTools.filter(tool => tool.type !== "file_search");
}
