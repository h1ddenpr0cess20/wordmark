/**
 * Importing a Wordmark export bundle back into local storage.
 *
 * @remarks
 * The counterpart to `collectExportData` in `components/storageManager.ts`.
 * Importing **merges** — it never clears what is already stored:
 *
 * - Conversations match on id. An imported record replaces a stored one only
 *   when its `updated` stamp is strictly newer; otherwise it is skipped. An id
 *   that is not present is inserted. Re-importing the same file is therefore a
 *   no-op, and a stale bundle can never overwrite newer local work.
 * - Memories are unioned, de-duplicated by text, preserving the stored order.
 * - Document-index chunks are written only for conversations that have none, so
 *   a live index is never replaced by the export's trimmed copy.
 * - Settings are left alone unless the caller opts in, and credentials are
 *   never part of a bundle in the first place.
 */

import {
  getAllConversationsFromDb,
  saveConversationToDb,
} from "../utils/storage/conversationStorage.ts";
import {
  getAllDocChunkRecords,
  saveDocChunks,
  type StoredDocChunk,
} from "../utils/storage/docChunkStorage.ts";
import { getMemories, addMemory } from "../utils/storage/memoryStorage.ts";
import type { ConversationRecord } from "../../types/common.ts";

/** A parsed export bundle. Every section is optional — older files may omit some. */
export interface ImportBundle {
  app?: string;
  exportedAt?: string;
  conversations?: ConversationRecord[];
  memories?: string[];
  documentIndex?: { conversationId?: string; chunks?: StoredDocChunk[] }[];
  settings?: Record<string, string>;
}

/** What a merge actually changed. */
export interface ImportSummary {
  conversationsAdded: number;
  conversationsUpdated: number;
  conversationsSkipped: number;
  memoriesAdded: number;
  documentIndexesAdded: number;
  settingsApplied: number;
}

/** Options controlling how much of the bundle is applied. */
export interface ImportOptions {
  /** Apply the bundle's non-credential settings over the current ones. */
  applySettings?: boolean;
}

/** Thrown when the file is not a Wordmark export. */
export class ImportFormatError extends Error {}

const timeOf = (value?: string): number => {
  const ms = new Date(value || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

/**
 * Parses and validates raw file text as an export bundle.
 *
 * @param text - The file's contents.
 * @returns The parsed bundle.
 * @throws {@link ImportFormatError} when the text is not JSON, or is JSON that
 *   carries none of the sections an export is made of.
 */
export function parseImportBundle(text: string): ImportBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ImportFormatError("That file is not valid JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ImportFormatError("That file is not a Wordmark export.");
  }

  const bundle = parsed as ImportBundle;
  const hasSection = Array.isArray(bundle.conversations)
    || Array.isArray(bundle.memories)
    || Array.isArray(bundle.documentIndex)
    || (bundle.settings && typeof bundle.settings === "object");

  if (bundle.app && bundle.app !== "wordmark") {
    throw new ImportFormatError(`That export came from "${bundle.app}", not Wordmark.`);
  }
  if (!hasSection) {
    throw new ImportFormatError("That file has no Wordmark data in it.");
  }

  return bundle;
}

/** Merges the bundle's conversations into the store. */
async function mergeConversations(bundle: ImportBundle, summary: ImportSummary) {
  const incoming = Array.isArray(bundle.conversations) ? bundle.conversations : [];
  if (incoming.length === 0) {
    return;
  }

  const existing = await getAllConversationsFromDb().catch(() => [] as ConversationRecord[]);
  const byId = new Map(existing.filter(c => c.id).map(c => [c.id as string, c]));

  for (const convo of incoming) {
    if (!convo || typeof convo !== "object" || !convo.id) {
      summary.conversationsSkipped += 1;
      continue;
    }

    const current = byId.get(convo.id);
    if (current && timeOf(convo.updated) <= timeOf(current.updated)) {
      summary.conversationsSkipped += 1;
      continue;
    }

    try {
      await saveConversationToDb(convo);
      if (current) {
        summary.conversationsUpdated += 1;
      } else {
        summary.conversationsAdded += 1;
      }
    } catch (error) {
      console.error(`Failed to import conversation ${convo.id}:`, error);
      summary.conversationsSkipped += 1;
    }
  }
}

/** Adds any memories the bundle has that are not already stored. */
function mergeMemories(bundle: ImportBundle, summary: ImportSummary) {
  const incoming = Array.isArray(bundle.memories) ? bundle.memories : [];
  if (incoming.length === 0) {
    return;
  }

  const known = new Set(getMemories().map(m => m.trim()));
  for (const memory of incoming) {
    if (typeof memory !== "string") {
      continue;
    }
    const trimmed = memory.trim();
    if (!trimmed || known.has(trimmed)) {
      continue;
    }
    if (addMemory(trimmed).ok) {
      known.add(trimmed);
      summary.memoriesAdded += 1;
    }
  }
}

/** Writes document chunks only for conversations that have no index yet. */
async function mergeDocumentIndex(bundle: ImportBundle, summary: ImportSummary) {
  const incoming = Array.isArray(bundle.documentIndex) ? bundle.documentIndex : [];
  if (incoming.length === 0) {
    return;
  }

  const records = await getAllDocChunkRecords().catch(() => []);
  const indexed = new Set(records.map(r => r.conversationId));

  for (const entry of incoming) {
    const id = entry?.conversationId;
    const chunks = Array.isArray(entry?.chunks) ? entry.chunks : [];
    if (!id || chunks.length === 0 || indexed.has(id)) {
      continue;
    }
    try {
      await saveDocChunks(id, chunks);
      indexed.add(id);
      summary.documentIndexesAdded += 1;
    } catch (error) {
      console.error(`Failed to import document index for ${id}:`, error);
    }
  }
}

/** Applies the bundle's settings when the caller opted in. */
function mergeSettings(bundle: ImportBundle, options: ImportOptions, summary: ImportSummary) {
  if (!options.applySettings || !bundle.settings || typeof bundle.settings !== "object") {
    return;
  }

  for (const [key, value] of Object.entries(bundle.settings)) {
    if (typeof key !== "string" || typeof value !== "string") {
      continue;
    }
    try {
      localStorage.setItem(key, value);
      summary.settingsApplied += 1;
    } catch (error) {
      console.error(`Failed to apply imported setting ${key}:`, error);
    }
  }
}

/**
 * Merges an export bundle into local storage.
 *
 * @param bundle - A bundle from {@link parseImportBundle}.
 * @param options - Whether to also apply the bundle's settings.
 * @returns A summary of what changed.
 */
export async function importBundle(
  bundle: ImportBundle,
  options: ImportOptions = {},
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    conversationsAdded: 0,
    conversationsUpdated: 0,
    conversationsSkipped: 0,
    memoriesAdded: 0,
    documentIndexesAdded: 0,
    settingsApplied: 0,
  };

  await mergeConversations(bundle, summary);
  mergeMemories(bundle, summary);
  await mergeDocumentIndex(bundle, summary);
  mergeSettings(bundle, options, summary);

  return summary;
}

/**
 * A one-line, human-readable account of a merge.
 *
 * @param summary - The result of {@link importBundle}.
 * @returns Text suitable for a notification.
 */
export function describeImport(summary: ImportSummary): string {
  const parts: string[] = [];
  if (summary.conversationsAdded) {
    parts.push(`${summary.conversationsAdded} conversation${summary.conversationsAdded === 1 ? "" : "s"} added`);
  }
  if (summary.conversationsUpdated) {
    parts.push(`${summary.conversationsUpdated} updated`);
  }
  if (summary.memoriesAdded) {
    parts.push(`${summary.memoriesAdded} memor${summary.memoriesAdded === 1 ? "y" : "ies"}`);
  }
  if (summary.documentIndexesAdded) {
    parts.push(`${summary.documentIndexesAdded} document index${summary.documentIndexesAdded === 1 ? "" : "es"}`);
  }
  if (summary.settingsApplied) {
    parts.push(`${summary.settingsApplied} settings`);
  }
  if (parts.length === 0) {
    return summary.conversationsSkipped
      ? "Nothing new to import — everything in that file is already here."
      : "Nothing to import from that file.";
  }
  const skipped = summary.conversationsSkipped
    ? ` (${summary.conversationsSkipped} already current)`
    : "";
  return `Imported ${parts.join(", ")}${skipped}.`;
}
