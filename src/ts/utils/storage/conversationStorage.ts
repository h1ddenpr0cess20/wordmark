/**
 * Conversation storage backed by IndexedDB.
 *
 * @remarks
 * Persists whole conversation records keyed by id, lazily initializing the
 * database on first use.
 */

import type { ConversationRecord } from "../../../types/common.ts";
import { createScopedLogger } from "../logger.ts";
import { openDatabase } from "./idb.ts";

const logConvoStore = createScopedLogger("conversation-storage");

const CONVO_DB_NAME = "wordmark-conversations";
const CONVO_DB_VERSION = 1;
const CONVO_STORE_NAME = "conversations";

let conversationDb: IDBDatabase | null = null;

/** Opens (and upgrades, if needed) the IndexedDB database used for conversations. */
export function initConversationDb() {
  return openDatabase({
    name: CONVO_DB_NAME,
    version: CONVO_DB_VERSION,
    errorLabel: "Conversation IndexedDB error:",
    onUpgrade: (db) => {
      if (!db.objectStoreNames.contains(CONVO_STORE_NAME)) {
        db.createObjectStore(CONVO_STORE_NAME, { keyPath: "id" });
        logConvoStore("Created conversation store in IndexedDB");
      }
    },
  }).then((db) => {
    conversationDb = db;
    logConvoStore("IndexedDB initialized for conversation storage");
  });
}

/**
 * Persists a conversation, assigning a timestamp-based id if it has none.
 *
 * @param conversation - The conversation record to store.
 * @returns The id the conversation was stored under.
 */
export function saveConversationToDb(conversation: ConversationRecord): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (!conversationDb) {
      console.error("Conversation IndexedDB not initialized");
      initConversationDb().then(() => {
        saveConversationToDb(conversation).then(resolve).catch(reject);
      }).catch(reject);
      return;
    }

    const transaction = conversationDb.transaction([CONVO_STORE_NAME], "readwrite");
    const store = transaction.objectStore(CONVO_STORE_NAME);

    if (!conversation.id) {
      conversation.id = Date.now().toString();
    }

    const request = store.put(conversation);

    request.onerror = () => {
      console.error("Error saving conversation to IndexedDB:", request.error);
      reject(request.error);
    };

    transaction.onabort = () => {
      console.error("Conversation save transaction aborted:", transaction.error);
      reject(transaction.error || new Error("Conversation save transaction aborted"));
    };

    transaction.oncomplete = () => {
      logConvoStore("Conversation saved to IndexedDB with ID:", conversation.id);
      resolve(conversation.id!);
    };
  });
}

/**
 * Loads a conversation by id.
 *
 * @param id - The conversation id to retrieve.
 * @returns The stored conversation record.
 * @throws If no conversation exists for `id`.
 */
export function loadConversationFromDb(id: string): Promise<ConversationRecord> {
  return new Promise<ConversationRecord>((resolve, reject) => {
    if (!conversationDb) {
      console.error("Conversation IndexedDB not initialized");
      initConversationDb().then(() => {
        loadConversationFromDb(id).then(resolve).catch(reject);
      }).catch(reject);
      return;
    }

    const transaction = conversationDb.transaction([CONVO_STORE_NAME], "readonly");
    const store = transaction.objectStore(CONVO_STORE_NAME);

    const request = store.get(id);

    request.onerror = () => {
      console.error("Error loading conversation from IndexedDB:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        logConvoStore("Conversation loaded from IndexedDB:", id);
        resolve(result);
      } else {
        const error = new Error("Conversation not found in IndexedDB");
        console.warn(error.message);
        reject(error);
      }
    };
  });
}

/** Returns every stored conversation record. */
export function getAllConversationsFromDb(): Promise<ConversationRecord[]> {
  return new Promise<ConversationRecord[]>((resolve, reject) => {
    if (!conversationDb) {
      console.error("Conversation IndexedDB not initialized");
      initConversationDb().then(() => {
        getAllConversationsFromDb().then(resolve).catch(reject);
      }).catch(reject);
      return;
    }

    const conversations: ConversationRecord[] = [];
    const transaction = conversationDb.transaction([CONVO_STORE_NAME], "readonly");
    const store = transaction.objectStore(CONVO_STORE_NAME);

    const request = store.openCursor();

    request.onerror = () => {
      console.error("Error getting conversations from IndexedDB:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        conversations.push(cursor.value);
        cursor.continue();
      } else {
        logConvoStore(`Retrieved ${conversations.length} conversations from IndexedDB`);
        resolve(conversations);
      }
    };
  });
}

/**
 * Deletes a conversation by id.
 *
 * @param id - The conversation id to delete.
 * @returns `true` once the record is removed.
 */
export function deleteConversationFromDb(id: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    if (!conversationDb) {
      console.error("Conversation IndexedDB not initialized");
      reject(new Error("Conversation IndexedDB not initialized"));
      return;
    }

    const transaction = conversationDb.transaction([CONVO_STORE_NAME], "readwrite");
    const store = transaction.objectStore(CONVO_STORE_NAME);

    const request = store.delete(id);

    request.onerror = () => {
      console.error("Error deleting conversation from IndexedDB:", request.error);
      reject(request.error);
    };

    transaction.onabort = () => {
      console.error("Conversation delete transaction aborted:", transaction.error);
      reject(transaction.error || new Error("Conversation delete transaction aborted"));
    };

    transaction.oncomplete = () => {
      logConvoStore("Conversation deleted from IndexedDB:", id);
      resolve(true);
    };
  });
}

/**
 * Renames a conversation, refreshing its `updated` timestamp.
 *
 * @param id - The conversation id to rename.
 * @param newName - The new conversation name.
 * @returns `true` once the rename is persisted.
 */
export function renameConversationInDb(id: string, newName: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    loadConversationFromDb(id)
      .then(conversation => {
        conversation.name = newName;
        conversation.updated = new Date().toISOString();

        return saveConversationToDb(conversation);
      })
      .then(() => {
        resolve(true);
      })
      .catch(reject);
  });
}

/** Counts the stored conversation records. */
export function countConversationsInDb(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const run = () => {
      const request = conversationDb!.transaction([CONVO_STORE_NAME], "readonly")
        .objectStore(CONVO_STORE_NAME)
        .count();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    };
    if (conversationDb) run();
    else initConversationDb().then(run).catch(reject);
  });
}

/** Deletes every stored conversation record. */
export function clearAllConversationsFromDb(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const run = () => {
      const transaction = conversationDb!.transaction([CONVO_STORE_NAME], "readwrite");
      transaction.objectStore(CONVO_STORE_NAME).clear();
      transaction.onabort = () => reject(transaction.error || new Error("Conversation clear aborted"));
      transaction.oncomplete = () => {
        logConvoStore("Cleared all conversations from IndexedDB");
        resolve();
      };
    };
    if (conversationDb) run();
    else initConversationDb().then(run).catch(reject);
  });
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("DOMContentLoaded", () => {
    initConversationDb().catch(err => {
      console.error("Failed to initialize conversation database:", err);
    });
  });
}
