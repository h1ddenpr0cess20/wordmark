/**
 * Conversation Storage Utilities using IndexedDB
 * Provides functions for storing and retrieving conversations from IndexedDB
 */

// IndexedDB database configuration
const CONVO_DB_NAME = "wordmark-conversations";
const CONVO_DB_VERSION = 1;
const CONVO_STORE_NAME = "conversations";

// Module-level handle to the open database (was window.conversationDb)
let conversationDb: IDBDatabase | null = null;

/**
 * Initialize the IndexedDB database for conversation storage
 * @returns {Promise} - Promise that resolves when the database is ready
 */
export function initConversationDb() {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined" || window.indexedDB === undefined) {
      console.error("IndexedDB is not supported in this browser");
      reject(new Error("IndexedDB not supported"));
      return;
    }

    const request = window.indexedDB.open(CONVO_DB_NAME, CONVO_DB_VERSION);

    request.onerror = (event) => {
      console.error("Conversation IndexedDB error:", (event.target as any).error);
      reject((event.target as any).error);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as any).result;
      // Create an object store for conversations if it doesn't exist
      if (!db.objectStoreNames.contains(CONVO_STORE_NAME)) {
        db.createObjectStore(CONVO_STORE_NAME, { keyPath: "id" });
        console.info("Created conversation store in IndexedDB");
      }
    };

    request.onsuccess = (event) => {
      conversationDb = (event.target as any).result;
      console.info("IndexedDB initialized for conversation storage");
      resolve();
    };
  });
}

/**
 * Save a conversation to IndexedDB
 * @param {Object} conversation - The conversation object to save
 * @returns {Promise<string>} - Promise that resolves with the conversation id
 */
export function saveConversationToDb(conversation) {
  return new Promise((resolve, reject) => {
    if (!conversationDb) {
      console.error("Conversation IndexedDB not initialized");
      // Try to initialize it now
      initConversationDb().then(() => {
        // Retry after initialization
        saveConversationToDb(conversation).then(resolve).catch(reject);
      }).catch(reject);
      return;
    }

    // Start a transaction
    const transaction = conversationDb.transaction([CONVO_STORE_NAME], "readwrite");
    const store = transaction.objectStore(CONVO_STORE_NAME);

    // Make sure the conversation has an id
    if (!conversation.id) {
      conversation.id = Date.now().toString();
    }

    // Add to the store
    const request = store.put(conversation);

    request.onerror = (event) => {
      console.error("Error saving conversation to IndexedDB:", (event.target as any).error);
      reject((event.target as any).error);
    };

    request.onsuccess = () => {
      console.info("Conversation saved to IndexedDB with ID:", conversation.id);
      resolve(conversation.id);
    };
  });
}

/**
 * Load a conversation from IndexedDB
 * @param {string} id - The conversation ID to retrieve
 * @returns {Promise<Object>} - Promise that resolves with the conversation object
 */
export function loadConversationFromDb(id): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!conversationDb) {
      console.error("Conversation IndexedDB not initialized");
      // Try to initialize it now
      initConversationDb().then(() => {
        // Retry after initialization
        loadConversationFromDb(id).then(resolve).catch(reject);
      }).catch(reject);
      return;
    }

    // Start a transaction
    const transaction = conversationDb.transaction([CONVO_STORE_NAME], "readonly");
    const store = transaction.objectStore(CONVO_STORE_NAME);

    // Get the conversation
    const request = store.get(id);

    request.onerror = (event) => {
      console.error("Error loading conversation from IndexedDB:", (event.target as any).error);
      reject((event.target as any).error);
    };

    request.onsuccess = (event) => {
      const result = (event.target as any).result;
      if (result) {
        console.info("Conversation loaded from IndexedDB:", id);
        resolve(result);
      } else {
        const error = new Error("Conversation not found in IndexedDB");
        console.warn(error.message);
        reject(error);
      }
    };
  });
}

/**
 * Get all conversations from IndexedDB
 * @returns {Promise<Array>} - Promise that resolves with an array of conversation objects
 */
export function getAllConversationsFromDb(): Promise<any[]> {
  return new Promise((resolve, reject) => {
    if (!conversationDb) {
      console.error("Conversation IndexedDB not initialized");
      // Try to initialize it now
      initConversationDb().then(() => {
        // Retry after initialization
        getAllConversationsFromDb().then(resolve).catch(reject);
      }).catch(reject);
      return;
    }

    const conversations = [];
    const transaction = conversationDb.transaction([CONVO_STORE_NAME], "readonly");
    const store = transaction.objectStore(CONVO_STORE_NAME);

    const request = store.openCursor();

    request.onerror = (event) => {
      console.error("Error getting conversations from IndexedDB:", (event.target as any).error);
      reject((event.target as any).error);
    };

    request.onsuccess = (event) => {
      const cursor = (event.target as any).result;
      if (cursor) {
        conversations.push(cursor.value);
        cursor.continue();
      } else {
        console.info(`Retrieved ${conversations.length} conversations from IndexedDB`);
        resolve(conversations);
      }
    };
  });
}

/**
 * Delete a conversation from IndexedDB
 * @param {string} id - The conversation ID to delete
 * @returns {Promise<boolean>} - Promise that resolves when deleted
 */
export function deleteConversationFromDb(id) {
  return new Promise((resolve, reject) => {
    if (!conversationDb) {
      console.error("Conversation IndexedDB not initialized");
      reject(new Error("Conversation IndexedDB not initialized"));
      return;
    }

    // Start a transaction
    const transaction = conversationDb.transaction([CONVO_STORE_NAME], "readwrite");
    const store = transaction.objectStore(CONVO_STORE_NAME);

    // Delete the conversation
    const request = store.delete(id);

    request.onerror = (event) => {
      console.error("Error deleting conversation from IndexedDB:", (event.target as any).error);
      reject((event.target as any).error);
    };

    request.onsuccess = () => {
      console.info("Conversation deleted from IndexedDB:", id);
      resolve(true);
    };
  });
}

/**
 * Rename a conversation in IndexedDB
 * @param {string} id - The conversation ID to rename
 * @param {string} newName - The new name for the conversation
 * @returns {Promise<boolean>} - Promise that resolves when renamed
 */
export function renameConversationInDb(id, newName) {
  return new Promise((resolve, reject) => {
    // First load the conversation
    loadConversationFromDb(id)
      .then(conversation => {
        // Update the name
        conversation.name = newName;
        conversation.updated = new Date().toISOString();

        // Save it back
        return saveConversationToDb(conversation);
      })
      .then(() => {
        resolve(true);
      })
      .catch(reject);
  });
}

// Initialize the conversation database when this script loads
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("DOMContentLoaded", () => {
    initConversationDb().catch(err => {
      console.error("Failed to initialize conversation database:", err);
    });
  });
}
