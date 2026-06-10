/**
 * Audio Storage Utilities using IndexedDB
 * Provides functions for storing and retrieving TTS audio from IndexedDB
 */

import { openDatabase } from "./idb.ts";

// IndexedDB database configuration
const AUDIO_DB_NAME = "wordmark-audio";
const AUDIO_DB_VERSION = 1;
const AUDIO_STORE_NAME = "tts-audio";
const MAX_STORED_AUDIO = 15;

// Module-level handle to the open database (was window.audioDb)
let audioDb: IDBDatabase | null = null;

/** A TTS audio clip as persisted in the IndexedDB audio store. */
export interface StoredAudio {
  id: string;
  messageId: string;
  audioData: ArrayBuffer;
  text: string;
  voice: string;
  timestamp: number;
}

/**
 * Initialize the IndexedDB database for audio storage
 * @returns {Promise} - Promise that resolves when the database is ready
 */
export function initAudioDb() {
  return openDatabase({
    name: AUDIO_DB_NAME,
    version: AUDIO_DB_VERSION,
    onUpgrade: (db) => {
      // Create an object store for audio files if it doesn't exist
      if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        // Use autoIncrement to generate unique IDs
        const store = db.createObjectStore(AUDIO_STORE_NAME, { keyPath: "id" });

        // Create indexes for fast lookup
        store.createIndex("messageId", "messageId", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });

        console.info("Created TTS audio store in IndexedDB");
      }
    },
  }).then((db) => {
    audioDb = db;
    console.info("IndexedDB initialized for TTS audio storage");
  });
}

/**
 * Save TTS audio to IndexedDB
 * @param {ArrayBuffer} audioData - Raw audio data
 * @param {string} messageId - ID of the message the audio is associated with
 * @param {string} text - Original text that was converted to speech
 * @param {string} voice - Voice used for TTS
 * @returns {Promise<Object>} - Promise that resolves with the stored audio record
 */
export function saveAudioToDb(audioData: ArrayBuffer, messageId: string, text: string, voice: string): Promise<StoredAudio> {
  return new Promise<StoredAudio>((resolve, reject) => {
    if (!audioDb) {
      console.error("Audio IndexedDB not initialized");
      // Try to initialize it now
      initAudioDb().then(() => {
        // Retry after initialization
        saveAudioToDb(audioData, messageId, text, voice).then(resolve).catch(reject);
      }).catch(reject);
      return;
    }
    // Start a transaction
    const transaction = audioDb.transaction([AUDIO_STORE_NAME], "readwrite");
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

    request.onerror = () => {
      console.error("Error saving audio to IndexedDB:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      console.info("Audio saved to IndexedDB for message:", messageId);

      // Check if we need to clean up old audio files
      cleanupOldAudio().catch(err => {
        console.warn("Error during audio cleanup:", err);
      });

      resolve(record);
    };
  });
}

/**
 * Load audio for a specific message from IndexedDB
 * @param {string} messageId - The message ID to retrieve audio for
 * @returns {Promise<Object>} - Promise that resolves with the audio record
 */
export function loadAudioForMessage(messageId: string): Promise<StoredAudio> {
  return new Promise<StoredAudio>((resolve, reject) => {
    if (!audioDb) {
      console.error("Audio IndexedDB not initialized");
      // Try to initialize it now
      initAudioDb().then(() => {
        // Retry after initialization
        loadAudioForMessage(messageId).then(resolve).catch(reject);
      }).catch(reject);
      return;
    }
    // Start a transaction
    const transaction = audioDb.transaction([AUDIO_STORE_NAME], "readonly");
    const store = transaction.objectStore(AUDIO_STORE_NAME);
    const index = store.index("messageId");

    // Get all records matching the messageId
    const request = index.getAll(messageId);

    request.onerror = () => {
      console.error("Error loading audio from IndexedDB:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      const results = request.result;
      if (results && results.length > 0) {
        // Get the most recent audio for this message
        results.sort((a: { timestamp: number }, b: { timestamp: number }) => b.timestamp - a.timestamp);
        console.info("Audio loaded from IndexedDB for message:", messageId);
        resolve(results[0]);
      } else {
        const error = new Error("Audio not found for this message");
        console.warn(error.message);
        reject(error);
      }
    };
  });
}

/**
 * Clean up old audio files, keeping only the most recent MAX_STORED_AUDIO files
 * @returns {Promise<number>} - Promise that resolves with the number of deleted files
 */
export function cleanupOldAudio(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    if (!audioDb) {
      console.error("Audio IndexedDB not initialized");
      reject(new Error("Audio IndexedDB not initialized"));
      return;
    }
    // Start a transaction
    const transaction = audioDb.transaction([AUDIO_STORE_NAME], "readonly");
    const store = transaction.objectStore(AUDIO_STORE_NAME);

    // Get all audio records sorted by timestamp
    const index = store.index("timestamp");
    const request = index.openCursor(null, "prev"); // Descending order (newest first)

    const allAudioRecords: { id: string; timestamp: number }[] = [];

    request.onerror = () => {
      console.error("Error accessing audio records:", request.error);
      reject(request.error);
    };

    // Collect all records
    request.onsuccess = () => {
      const cursor = request.result;
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

          // Start a delete transaction
          const deleteTransaction = audioDb!.transaction([AUDIO_STORE_NAME], "readwrite");
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

            deleteRequest.onerror = () => {
              console.error(`Error deleting audio record ${record.id}:`, deleteRequest.error);
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
}

/**
 * Exports an audio file for download
 * @param {ArrayBuffer} audioData - The audio data to download
 * @param {string} filename - Suggested filename for the download
 */
export function exportAudioForDownload(audioData: ArrayBuffer, filename: string): boolean {
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
}

// Initialize the audio database when this script loads
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("DOMContentLoaded", () => {
    initAudioDb().catch(err => {
      console.error("Failed to initialize audio database:", err);
    });
  });
}
