/**
 * Storage settings panel.
 *
 * @remarks
 * Shows every category of locally stored data (IndexedDB stores and
 * localStorage groups) with per-category clear buttons, a clear-everything
 * action, and a JSON export of the user's data. API keys and binary image/audio
 * payloads are deliberately excluded from the export.
 */

import { state } from "../init/state.ts";
import {
  getAllConversationsFromDb,
  countConversationsInDb,
  clearAllConversationsFromDb,
} from "../utils/storage/conversationStorage.ts";
import { countImagesInDb, clearAllImagesFromDb } from "../utils/storage/imageStorage.ts";
import { countAudioInDb, clearAllAudioFromDb } from "../utils/storage/audioStorage.ts";
import { getAllDocChunkRecords, loadDocChunks, clearAllDocChunks, countCachedFiles } from "../utils/storage/docChunkStorage.ts";
import { getMemories, clearAllMemories } from "../utils/storage/memoryStorage.ts";
import { STORAGE_KEYS } from "../utils/storage/storage.ts";
import { EMBEDDING_MODEL_STORAGE_KEY } from "../services/embeddings.ts";
import { clearLocalDocIndex } from "../services/localDocRetrieval.ts";
import { renderChatHistoryList } from "../services/history/list.ts";
import { triggerAnchorDownload } from "../utils/dom/download.ts";
import { showInfo, showError } from "../utils/notifications.ts";

const CREDENTIAL_KEY_PREFIXES = [
  STORAGE_KEYS.apiKeyPrefix,
  STORAGE_KEYS.toolApiKeyPrefix,
];

const CREDENTIAL_KEYS: string[] = [
  STORAGE_KEYS.lmStudioServerUrl,
  STORAGE_KEYS.ollamaServerUrl,
];

const SETTINGS_KEYS = [
  ...Object.values(STORAGE_KEYS).filter(
    (key) =>
      key !== STORAGE_KEYS.apiKeyPrefix &&
      key !== STORAGE_KEYS.toolApiKeyPrefix &&
      key !== STORAGE_KEYS.lmStudioServerUrl &&
      key !== STORAGE_KEYS.ollamaServerUrl &&
      key !== STORAGE_KEYS.memories,
  ),
  EMBEDDING_MODEL_STORAGE_KEY,
];

function isCredentialKey(key: string): boolean {
  return CREDENTIAL_KEYS.includes(key) || CREDENTIAL_KEY_PREFIXES.some((p) => key.startsWith(p));
}

function presentLocalStorageKeys(keys: string[]): string[] {
  return keys.filter((key) => localStorage.getItem(key) !== null);
}

function credentialKeysInStorage(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && isCredentialKey(key)) keys.push(key);
  }
  return keys;
}

interface StorageCategory {
  label: string;
  describe: () => Promise<string>;
  clear: () => Promise<void>;
}

const CATEGORIES: StorageCategory[] = [
  {
    label: "Conversations",
    describe: async () => `${await countConversationsInDb()} saved`,
    clear: async () => {
      await clearAllConversationsFromDb();
      state.currentConversationId = null;
      state.currentConversationName = null;
      renderChatHistoryList();
    },
  },
  {
    label: "Generated images",
    describe: async () => `${await countImagesInDb()} stored`,
    clear: () => clearAllImagesFromDb(),
  },
  {
    label: "TTS audio clips",
    describe: async () => `${await countAudioInDb()} stored`,
    clear: () => clearAllAudioFromDb(),
  },
  {
    label: "Document search index",
    describe: async () => {
      const records = await getAllDocChunkRecords();
      const inline = records.reduce(
        (sum, r) => sum + (r.files?.filter((f) => !f.cacheKey).length ?? 0),
        0,
      );
      const total = await countCachedFiles() + inline;
      return `${total} file${total === 1 ? "" : "s"} stored`;
    },
    clear: async () => {
      await clearAllDocChunks();
      clearLocalDocIndex();
    },
  },
  {
    label: "Memories",
    describe: async () => `${getMemories().length} saved`,
    clear: async () => { clearAllMemories(); },
  },
  {
    label: "Settings & preferences",
    describe: async () => `${presentLocalStorageKeys(SETTINGS_KEYS).length} entries`,
    clear: async () => {
      presentLocalStorageKeys(SETTINGS_KEYS).forEach((key) => localStorage.removeItem(key));
    },
  },
  {
    label: "API keys & server URLs",
    describe: async () => `${credentialKeysInStorage().length} entries`,
    clear: async () => {
      credentialKeysInStorage().forEach((key) => localStorage.removeItem(key));
    },
  },
];

async function renderUsageSummary() {
  const summary = document.getElementById("storage-usage-summary");
  if (!summary) return;
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.usage !== undefined) {
      const usedMb = (estimate.usage / (1024 * 1024)).toFixed(1);
      summary.textContent = `Total browser storage used by this app: ~${usedMb} MB`;
      return;
    }
  } catch {}
  summary.textContent = "";
}

function renderCategoryRow(category: StorageCategory): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "memory-row";

  const text = document.createElement("span");
  text.className = "memory-text";
  text.textContent = `${category.label} — ...`;
  category.describe()
    .then((detail) => { text.textContent = `${category.label} — ${detail}`; })
    .catch(() => { text.textContent = `${category.label} — unavailable`; });

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "tool-action-button";
  clearButton.textContent = "Clear";
  clearButton.setAttribute("aria-label", `Clear ${category.label}`);
  clearButton.addEventListener("click", async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!confirm(`Clear ${category.label.toLowerCase()}? This cannot be undone.`)) return;
    try {
      await category.clear();
      showInfo?.(`${category.label} cleared`);
    } catch (error) {
      console.error(`Failed to clear ${category.label}:`, error);
      showError?.(`Failed to clear ${category.label.toLowerCase()}`);
    }
    renderCategoryList();
  });

  row.appendChild(text);
  row.appendChild(clearButton);
  return row;
}

function renderCategoryList() {
  const list = document.getElementById("storage-category-list");
  if (!list) return;
  list.innerHTML = "";
  CATEGORIES.forEach((category) => list.appendChild(renderCategoryRow(category)));
  renderUsageSummary();
}

/**
 * Collects all exportable stored data as a single JSON-serializable object.
 * Excludes credentials (API keys, server URLs) and binary image/audio data;
 * document-index vectors are dropped so the export stays small and portable.
 */
export async function collectExportData() {
  const [conversations, docRecords] = await Promise.all([
    getAllConversationsFromDb().catch(() => []),
    getAllDocChunkRecords().catch(() => []),
  ]);

  const settings: Record<string, string> = {};
  presentLocalStorageKeys(SETTINGS_KEYS).forEach((key) => {
    settings[key] = localStorage.getItem(key) ?? "";
  });

  return {
    app: "wordmark",
    exportedAt: new Date().toISOString(),
    conversations,
    memories: getMemories(),
    documentIndex: await Promise.all(docRecords.map(async (record) => ({
      conversationId: record.conversationId,
      updated: record.updated,
      chunks: (await loadDocChunks(record.conversationId).catch(() => []))
        .map(({ name, text }) => ({ name, text })),
    }))),
    settings,
  };
}

async function exportAllData() {
  try {
    const data = await collectExportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    triggerAnchorDownload(url, `wordmark-export-${stamp}.json`);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    showInfo?.("Export downloaded");
  } catch (error) {
    console.error("Failed to export data:", error);
    showError?.("Failed to export data");
  }
}

async function clearAllStorage() {
  if (!confirm("Delete ALL locally stored data (conversations, images, audio, memories, settings, API keys)? This cannot be undone.")) {
    return;
  }
  for (const category of CATEGORIES) {
    try {
      await category.clear();
    } catch (error) {
      console.error(`Failed to clear ${category.label}:`, error);
    }
  }
  showInfo?.("All local data cleared");
  renderCategoryList();
}

/** Initializes the storage settings panel and binds its controls. */
export function initStorageSettings() {
  const list = document.getElementById("storage-category-list");
  const refreshButton = document.getElementById("refresh-storage-usage");
  const clearAllButton = document.getElementById("clear-all-storage");
  const exportButton = document.getElementById("export-all-data");

  if (!list) {
    return;
  }

  refreshButton?.addEventListener("click", () => renderCategoryList());
  clearAllButton?.addEventListener("click", () => { clearAllStorage(); });
  exportButton?.addEventListener("click", () => { exportAllData(); });

  renderCategoryList();
}
