/**
 * Vector store metadata and active-store state.
 *
 * @remarks
 * Persists per-store metadata in localStorage and tracks which stores are
 * "active", capping the count at {@link MAX_ACTIVE_VECTOR_STORES} and evicting
 * least-recently-used entries. Kept separate from the provider API calls in
 * {@link ./vectorStore.ts}; this half is pure local state with no network I/O.
 */

import { state } from "../init/state.ts";
import { STORAGE_KEYS, writeJSON } from "../utils/storage/storage.ts";

/**
 * Per-store metadata persisted in localStorage. Extra caller-supplied fields
 * are allowed; `lastUsed` is what stores are sorted and evicted on.
 */
interface VectorStoreMetadataEntry {
  lastUsed?: number;
  name?: string;
  createdAt?: number;
  fileCount?: number;
  [key: string]: unknown;
}

/**
 * Local storage key for vector store metadata
 */
const VECTOR_STORE_STORAGE_KEY = STORAGE_KEYS.vectorStores;

/** Maximum number of vector stores that may be active at once. */
export const MAX_ACTIVE_VECTOR_STORES = 2;

/**
 * Save vector store metadata to local storage
 */
export function saveVectorStoreMetadata(vectorStoreId: string, metadata: Partial<VectorStoreMetadataEntry>) {
  try {
    const stored = localStorage.getItem(VECTOR_STORE_STORAGE_KEY);
    const stores: Record<string, VectorStoreMetadataEntry> = stored ? JSON.parse(stored) : {};
    stores[vectorStoreId] = {
      ...metadata,
      lastUsed: Date.now(),
    };
    const entries = Object.entries(stores);
    if (entries.length > MAX_ACTIVE_VECTOR_STORES) {
      const activeId = typeof getActiveVectorStoreId === "function" ? getActiveVectorStoreId() : null;
      const sorted = entries.sort((a, b) => {
        const aTime = a[1]?.lastUsed || 0;
        const bTime = b[1]?.lastUsed || 0;
        return bTime - aTime;
      });
      const limited: [string, VectorStoreMetadataEntry][] = [];
      if (activeId) {
        const activeEntry = sorted.find(([id]) => id === activeId);
        if (activeEntry) {
          limited.push(activeEntry);
        }
      }
      for (const entry of sorted) {
        if (limited.length >= MAX_ACTIVE_VECTOR_STORES) break;
        if (entry[0] === activeId) continue;
        limited.push(entry);
      }
      const limitedStores = Object.fromEntries(limited.slice(0, MAX_ACTIVE_VECTOR_STORES));
      writeJSON(VECTOR_STORE_STORAGE_KEY, limitedStores);
    } else {
      writeJSON(VECTOR_STORE_STORAGE_KEY, stores);
    }
  } catch (error) {
    console.error("Failed to save vector store metadata:", error);
  }
}

/**
 * Get all vector store metadata from local storage
 */
export function getVectorStoreMetadata() {
  try {
    const stored = localStorage.getItem(VECTOR_STORE_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error("Failed to get vector store metadata:", error);
    return {};
  }
}

/**
 * Get a list of active vector store IDs.
 * "Active" includes the explicitly active store and any stores with saved metadata.
 */
export function getActiveVectorStoreIds() {
  try {
    const orderedIds: string[] = [];
    const active = typeof getActiveVectorStoreId === "function" ? getActiveVectorStoreId() : null;
    if (active) {
      orderedIds.push(active);
    }
    const metadata = typeof getVectorStoreMetadata === "function" ? getVectorStoreMetadata() : {};
    if (metadata && typeof metadata === "object") {
      const entries = Object.entries(metadata as Record<string, VectorStoreMetadataEntry>).sort((a, b) => {
        const aTime = a[1]?.lastUsed || 0;
        const bTime = b[1]?.lastUsed || 0;
        return bTime - aTime;
      });
      for (const [id] of entries) {
        if (orderedIds.length >= MAX_ACTIVE_VECTOR_STORES) {
          break;
        }
        if (!orderedIds.includes(id)) {
          orderedIds.push(id);
        }
      }
    }
    return orderedIds.slice(0, MAX_ACTIVE_VECTOR_STORES);
  } catch (error) {
    console.error("Failed to get active vector store IDs:", error);
    return [];
  }
}

/**
 * Remove vector store metadata from local storage
 */
export function removeVectorStoreMetadata(vectorStoreId: string) {
  try {
    const stored = localStorage.getItem(VECTOR_STORE_STORAGE_KEY);
    if (!stored) return;
    const stores = JSON.parse(stored);
    delete stores[vectorStoreId];
    writeJSON(VECTOR_STORE_STORAGE_KEY, stores);
  } catch (error) {
    console.error("Failed to remove vector store metadata:", error);
  }
}

/**
 * Get the active vector store ID
 */
export function getActiveVectorStoreId() {
  try {
    return state.activeVectorStore || localStorage.getItem(STORAGE_KEYS.activeVectorStore) || null;
  } catch {
    return state.activeVectorStore || null;
  }
}

/**
 * Set the active vector store ID
 */
export function setActiveVectorStoreId(vectorStoreId: string | null) {
  state.activeVectorStore = vectorStoreId;
  if (vectorStoreId) {
    localStorage.setItem(STORAGE_KEYS.activeVectorStore, vectorStoreId);
  } else {
    localStorage.removeItem(STORAGE_KEYS.activeVectorStore);
  }
}

/**
 * Clear the active vector store
 */
export function clearActiveVectorStore() {
  state.activeVectorStore = null;
  localStorage.removeItem(STORAGE_KEYS.activeVectorStore);
}

/**
 * Initialize vector store on app load
 */
export function initializeVectorStore() {
  const stored = localStorage.getItem(STORAGE_KEYS.activeVectorStore);
  if (stored) {
    state.activeVectorStore = stored;
  }
}
