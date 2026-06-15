/**
 * TTS audio storage backed by IndexedDB.
 *
 * @remarks
 * Caches synthesized speech keyed by message so it can be replayed without
 * re-calling the provider, pruning to the {@link MAX_STORED_AUDIO} most recent
 * clips. Also offers a helper to download a clip as a `.wav` file.
 */

import { openDatabase } from "./idb.ts";
import { triggerAnchorDownload } from "./download.ts";

const AUDIO_DB_NAME = "wordmark-audio";
const AUDIO_DB_VERSION = 1;
const AUDIO_STORE_NAME = "tts-audio";
/** Maximum number of audio clips retained before the oldest are pruned. */
const MAX_STORED_AUDIO = 15;

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
 * Opens (and upgrades, if needed) the IndexedDB database used for TTS audio,
 * creating `messageId` and `timestamp` indexes for lookup and pruning.
 */
export function initAudioDb() {
  return openDatabase({
    name: AUDIO_DB_NAME,
    version: AUDIO_DB_VERSION,
    onUpgrade: (db) => {
      if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        const store = db.createObjectStore(AUDIO_STORE_NAME, { keyPath: "id" });

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
 * Stores a synthesized audio clip and triggers cleanup of older clips.
 *
 * @param audioData - Raw audio bytes.
 * @param messageId - Id of the message the audio belongs to.
 * @param text - Source text that was synthesized.
 * @param voice - Voice the clip was generated with.
 * @returns The stored audio record.
 */
export function saveAudioToDb(audioData: ArrayBuffer, messageId: string, text: string, voice: string): Promise<StoredAudio> {
  return new Promise<StoredAudio>((resolve, reject) => {
    if (!audioDb) {
      console.error("Audio IndexedDB not initialized");
      initAudioDb().then(() => {
        saveAudioToDb(audioData, messageId, text, voice).then(resolve).catch(reject);
      }).catch(reject);
      return;
    }
    const transaction = audioDb.transaction([AUDIO_STORE_NAME], "readwrite");
    const store = transaction.objectStore(AUDIO_STORE_NAME);

    const record = {
      id: `${messageId}_${Date.now()}`,
      messageId: messageId,
      audioData: audioData,
      text: text,
      voice: voice,
      timestamp: Date.now(),
    };

    const request = store.add(record);

    request.onerror = () => {
      console.error("Error saving audio to IndexedDB:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      console.info("Audio saved to IndexedDB for message:", messageId);

      cleanupOldAudio().catch(err => {
        console.warn("Error during audio cleanup:", err);
      });

      resolve(record);
    };
  });
}

/**
 * Loads the most recent audio clip stored for a message.
 *
 * @param messageId - The message id to look up.
 * @returns The newest matching audio record.
 * @throws If no audio is stored for the message.
 */
export function loadAudioForMessage(messageId: string): Promise<StoredAudio> {
  return new Promise<StoredAudio>((resolve, reject) => {
    if (!audioDb) {
      console.error("Audio IndexedDB not initialized");
      initAudioDb().then(() => {
        loadAudioForMessage(messageId).then(resolve).catch(reject);
      }).catch(reject);
      return;
    }
    const transaction = audioDb.transaction([AUDIO_STORE_NAME], "readonly");
    const store = transaction.objectStore(AUDIO_STORE_NAME);
    const index = store.index("messageId");

    const request = index.getAll(messageId);

    request.onerror = () => {
      console.error("Error loading audio from IndexedDB:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      const results = request.result;
      if (results && results.length > 0) {
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
 * Deletes audio clips beyond the {@link MAX_STORED_AUDIO} most recent.
 *
 * @returns The number of clips deleted.
 */
export function cleanupOldAudio(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    if (!audioDb) {
      console.error("Audio IndexedDB not initialized");
      reject(new Error("Audio IndexedDB not initialized"));
      return;
    }
    const transaction = audioDb.transaction([AUDIO_STORE_NAME], "readonly");
    const store = transaction.objectStore(AUDIO_STORE_NAME);

    const index = store.index("timestamp");
    const request = index.openCursor(null, "prev");

    const allAudioRecords: { id: string; timestamp: number }[] = [];

    request.onerror = () => {
      console.error("Error accessing audio records:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        allAudioRecords.push({
          id: cursor.value.id,
          timestamp: cursor.value.timestamp,
        });
        cursor.continue();
      } else {
        if (allAudioRecords.length > MAX_STORED_AUDIO) {
          const recordsToDelete = allAudioRecords.slice(MAX_STORED_AUDIO);

          const deleteTransaction = audioDb!.transaction([AUDIO_STORE_NAME], "readwrite");
          const deleteStore = deleteTransaction.objectStore(AUDIO_STORE_NAME);

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
          resolve(0);
        }
      }
    };
  });
}

/**
 * Triggers a browser download of an audio clip as a `.wav` file.
 *
 * @param audioData - The audio bytes to download.
 * @param filename - Suggested download filename (defaults to `tts-audio.wav`).
 * @returns `true` on success, `false` if the download could not be started.
 */
export function exportAudioForDownload(audioData: ArrayBuffer, filename: string): boolean {
  try {
    const blob = new Blob([audioData], { type: "audio/wav" });

    const objectUrl = URL.createObjectURL(blob);
    triggerAnchorDownload(objectUrl, filename || "tts-audio.wav");

    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 100);

    return true;
  } catch (error) {
    console.error("Error exporting audio for download:", error);
    return false;
  }
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("DOMContentLoaded", () => {
    initAudioDb().catch(err => {
      console.error("Failed to initialize audio database:", err);
    });
  });
}
