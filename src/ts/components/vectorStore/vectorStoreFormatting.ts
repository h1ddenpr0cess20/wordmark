/**
 * Vector store display formatting.
 *
 * @remarks
 * Pure, DOM-free helpers used by {@link ./vectorStoreManager.ts} to turn raw
 * store records and metadata into human-friendly names and byte sizes for the
 * vector store list/details UI.
 */

import { isRecord } from "../../utils/utils.ts";

/** Collapses underscores/hyphens and runs of whitespace into single spaces. */
function normalizeVectorStoreLabel(str: unknown) {
  return String(str || "").replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Title-cases each word in `str`. */
function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

/**
 * Derives a readable name for a vector store from its own fields: recognizing
 * `Chat-<timestamp>` names, title-casing normalized labels, and otherwise
 * falling back to a date- or id-suffixed "Document Set".
 */
export function deriveFriendlyVectorStoreName(store: unknown) {
  if (!isRecord(store)) {
    return "Document Set";
  }
  const originalName = (typeof store.name === "string" ? store.name : "").trim();
  if (originalName) {
    const chatMatch = originalName.match(/^Chat-(\d{10,})$/i);
    if (chatMatch) {
      const timestamp = Number(chatMatch[1]);
      if (!Number.isNaN(timestamp)) {
        return `Chat ${new Date(timestamp).toLocaleString()}`;
      }
    }
    const normalized = normalizeVectorStoreLabel(originalName);
    if (normalized) {
      return toTitleCase(normalized);
    }
    return originalName;
  }
  if (store.created_at) {
    return `Document Set ${new Date(Number(store.created_at) * 1000).toLocaleDateString()}`;
  }
  if (typeof store.id === "string") {
    return `Document Set ${store.id.slice(-6).toUpperCase()}`;
  }
  return "Document Set";
}

/**
 * Chooses the best display name for a store, preferring its saved metadata
 * (`friendlyName`, then `name`) before deriving one from the store record,
 * with an index-numbered "Document Set" fallback.
 */
export function buildFriendlyVectorStoreName(store: unknown, meta: unknown, index: number) {
  if (isRecord(meta) && typeof meta.friendlyName === "string" && meta.friendlyName.trim()) {
    return meta.friendlyName.trim();
  }
  if (isRecord(meta) && typeof meta.name === "string" && meta.name.trim()) {
    return deriveFriendlyVectorStoreName({
      ...(isRecord(store) ? store : {}),
      name: meta.name,
    });
  }
  const derived = deriveFriendlyVectorStoreName(store);
  if (derived && derived.trim() && derived !== "Document Set") {
    return derived;
  }
  if (isRecord(store) && typeof store.id === "string") {
    return `Document Set ${index + 1} (${store.id.slice(-6).toUpperCase()})`;
  }
  return `Document Set ${index + 1}`;
}

/** Formats a byte count as a human-readable size (e.g. `1.5 MB`). */
export function formatBytes(bytes: number) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
}
