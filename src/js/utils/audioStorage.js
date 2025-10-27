/**
 * Audio Storage Utilities using IndexedDB
 * Provides functions for storing and retrieving TTS audio from IndexedDB
 */

// IndexedDB database configuration
const AUDIO_DB_NAME = "wordmark-audio";
const AUDIO_DB_VERSION = 1;
const AUDIO_STORE_NAME = "tts-audio";
const MAX_STORED_AUDIO = 15;

/**
 * Initialize the IndexedDB database for audio storage
 * @returns {Promise} - Promise that resolves when the database is ready
 */
window.initAudioDb = function() {
  return new Promise((resolve, reject) => {
    if (window.indexedDB === undefined) {
      console.error("IndexedDB is not supported in this browser");
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const request = window.indexedDB.open(AUDIO_DB_NAME, AUDIO_DB_VERSION);

    request.onerror = (event) => {
      console.error("IndexedDB error:", event.target.error);
      reject(event.target.error);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      // Create an object store for audio files if it doesn't exist
      if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        // Use autoIncrement to generate unique IDs
        const store = db.createObjectStore(AUDIO_STORE_NAME, { keyPath: "id" });

        // Create indexes for fast lookup
        store.createIndex("messageId", "messageId", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });

        console.info("Created TTS audio store in IndexedDB");
      }
    };

    request.onsuccess = (event) => {
      window.audioDb = event.target.result;
      console.info("IndexedDB initialized for TTS audio storage");
      resolve();
    };
  });
};

/**
 * Save TTS audio to IndexedDB
 * @param {ArrayBuffer} audioData - Raw audio data
 * @param {string} messageId - ID of the message the audio is associated with
 * @param {string} text - Original text that was converted to speech
 * @param {string} voice - Voice used for TTS
 * @returns {Promise<Object>} - Promise that resolves with the stored audio record
 */
window.saveAudioToDb = function(audioData, messageId, text, voice) {
  return new Promise((resolve, reject) => {
    if (!window.audioDb) {
      console.error("Audio IndexedDB not initialized");
      // Try to initialize it now
      window.initAudioDb().then(() => {
        // Retry after initialization
        window.saveAudioToDb(audioData, messageId, text, voice).then(resolve).catch(reject);
      }).catch(reject);
      return;
    }
    // Start a transaction
    const transaction = window.audioDb.transaction([AUDIO_STORE_NAME], "readwrite");
    const store = transaction.objectStore(AUDIO_STORE_NAME);

    // Create a record with the audio data
    const record = {
      id: `${messageId}_${Date.now()}`, // Unique ID
      messageId: messageId,
      audioData: audioData,
      text: text,
      voice: voice,
      timestamp: Date.now(),
    };

    // Add to the store
    const request = store.add(record);

    request.onerror = (event) => {
      console.error("Error saving audio to IndexedDB:", event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = () => {
      console.info("Audio saved to IndexedDB for message:", messageId);

      // Check if we need to clean up old audio files
      window.cleanupOldAudio().catch(err => {
        console.warn("Error during audio cleanup:", err);
      });

      resolve(record);
    };
  });
};

/**
 * Load audio for a specific message from IndexedDB
 * @param {string} messageId - The message ID to retrieve audio for
 * @returns {Promise<Object>} - Promise that resolves with the audio record
 */
window.loadAudioForMessage = function(messageId) {
  return new Promise((resolve, reject) => {
    if (!window.audioDb) {
      console.error("Audio IndexedDB not initialized");
      // Try to initialize it now
      window.initAudioDb().then(() => {
        // Retry after initialization
        window.loadAudioForMessage(messageId).then(resolve).catch(reject);
      }).catch(reject);
      return;
    }
    // Start a transaction
    const transaction = window.audioDb.transaction([AUDIO_STORE_NAME], "readonly");
    const store = transaction.objectStore(AUDIO_STORE_NAME);
    const index = store.index("messageId");

    // Get all records matching the messageId
    const request = index.getAll(messageId);

    request.onerror = (event) => {
      console.error("Error loading audio from IndexedDB:", event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      const results = event.target.result;
      if (results && results.length > 0) {
        // Get the most recent audio for this message
        results.sort((a, b) => b.timestamp - a.timestamp);
        console.info("Audio loaded from IndexedDB for message:", messageId);
        resolve(results[0]);
      } else {
        const error = new Error("Audio not found for this message");
        console.warn(error.message);
        reject(error);
      }
    };
  });
};

/**
 * Delete audio from IndexedDB
 * @param {string} id - The ID of the audio record to delete
 * @returns {Promise<boolean>} - Promise that resolves when deleted
 */
window.deleteAudioFromDb = function(id) {
  return new Promise((resolve, reject) => {
    if (!window.audioDb) {
      console.error("Audio IndexedDB not initialized");
      reject(new Error("Audio IndexedDB not initialized"));
      return;
    }
    // Start a transaction
    const transaction = window.audioDb.transaction([AUDIO_STORE_NAME], "readwrite");
    const store = transaction.objectStore(AUDIO_STORE_NAME);

    // Delete the record
    const request = store.delete(id);

    request.onerror = (event) => {
      console.error("Error deleting audio from IndexedDB:", event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = () => {
      console.info("Audio deleted from IndexedDB:", id);
      resolve(true);
    };
  });
};

/**
 * Clean up old audio files, keeping only the most recent MAX_STORED_AUDIO files
 * @returns {Promise<number>} - Promise that resolves with the number of deleted files
 */
window.cleanupOldAudio = function() {
  return new Promise((resolve, reject) => {
    if (!window.audioDb) {
      console.error("Audio IndexedDB not initialized");
      reject(new Error("Audio IndexedDB not initialized"));
      return;
    }
    // Start a transaction
    const transaction = window.audioDb.transaction([AUDIO_STORE_NAME], "readonly");
    const store = transaction.objectStore(AUDIO_STORE_NAME);

    // Get all audio records sorted by timestamp
    const index = store.index("timestamp");
    const request = index.openCursor(null, "prev"); // Descending order (newest first)

    const allAudioRecords = [];

    request.onerror = (event) => {
      console.error("Error accessing audio records:", event.target.error);
      reject(event.target.error);
    };

    // Collect all records
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        allAudioRecords.push({
          id: cursor.value.id,
          timestamp: cursor.value.timestamp,
        });
        cursor.continue();
      } else {
        // If we have more than the maximum, delete the oldest
        if (allAudioRecords.length > MAX_STORED_AUDIO) {
          const recordsToDelete = allAudioRecords.slice(MAX_STORED_AUDIO);

          // Start a delete transaction          const deleteTransaction = window.audioDb.transaction([AUDIO_STORE_NAME], 'readwrite');
          const deleteStore = deleteTransaction.objectStore(AUDIO_STORE_NAME);

          // Track deletions
          let deletedCount = 0;
          let errorCount = 0;

          recordsToDelete.forEach(record => {
            const deleteRequest = deleteStore.delete(record.id);

            deleteRequest.onsuccess = () => {
              deletedCount++;
              if (deletedCount + errorCount === recordsToDelete.length) {
                console.info(`Cleaned up ${deletedCount} old audio records`);
                resolve(deletedCount);
              }
            };

            deleteRequest.onerror = (event) => {
              console.error(`Error deleting audio record ${record.id}:`, event.target.error);
              errorCount++;
              if (deletedCount + errorCount === recordsToDelete.length) {
                if (deletedCount > 0) {
                  resolve(deletedCount);
                } else {
                  reject(new Error("Failed to delete any audio records"));
                }
              }
            };
          });
        } else {
          // Nothing to delete
          resolve(0);
        }
      }
    };
  });
};

/**
 * Exports an audio file for download
 * @param {ArrayBuffer} audioData - The audio data to download
 * @param {string} filename - Suggested filename for the download
 */
window.exportAudioForDownload = function(audioData, filename) {
  try {
    // Create a blob from the audio data
    const blob = new Blob([audioData], { type: "audio/wav" });

    // Create a download link
    const downloadLink = document.createElement("a");
    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = filename || "tts-audio.wav";

    // Append to the document, click, and remove
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    // Clean up the object URL
    setTimeout(() => {
      URL.revokeObjectURL(downloadLink.href);
    }, 100);

    return true;
  } catch (error) {
    console.error("Error exporting audio for download:", error);
    return false;
  }
};

// Initialize the audio database when this script loads
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    window.initAudioDb().catch(err => {
      console.error("Failed to initialize audio database:", err);
    });
  });
}
