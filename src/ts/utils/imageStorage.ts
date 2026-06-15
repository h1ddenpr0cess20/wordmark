/**
 * Image storage backed by IndexedDB.
 *
 * @remarks
 * Persists generated and uploaded images keyed by filename, and exposes helpers
 * to read them back as `Blob`s or data URLs for upload to provider APIs.
 */

import { openDatabase } from "./idb.ts";

const IMAGE_DB_NAME = "wordmark-images";
const IMAGE_DB_VERSION = 1;

/** Name of the IndexedDB object store that holds image records. */
export const IMAGE_STORE_NAME = "images";

let imageDb: IDBDatabase | null = null;

/** An image/media record as persisted in the IndexedDB image store. */
export interface StoredImage {
  filename: string;
  data: string | Blob;
  timestamp: string;
  [key: string]: unknown;
}

/** Decodes a base64 string into a `Blob` of the given MIME type. */
export function base64ToBlob(base64Data: string, mimeType: string): Blob {
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * Returns the open image database handle, or `null` before initialization.
 *
 * @remarks
 * Used by the gallery to run its own cursor queries against the store.
 */
export function getImageDb() {
  return imageDb;
}

/** Opens (and upgrades, if needed) the IndexedDB database used for image storage. */
export function initImageDb() {
  return openDatabase({
    name: IMAGE_DB_NAME,
    version: IMAGE_DB_VERSION,
    onUpgrade: (db) => {
      if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) {
        db.createObjectStore(IMAGE_STORE_NAME, { keyPath: "filename" });
        console.info("Created image store in IndexedDB");
      }
    },
  }).then((db) => {
    imageDb = db;
    console.info("IndexedDB initialized for image storage");
  });
}

/**
 * Persists an image record, initializing the database first if necessary.
 *
 * @param base64Data - Image data as a base64 string, data URL, or `Blob`.
 * @param filename - Unique key for the record.
 * @param metadata - Extra fields merged into the stored record.
 * @returns The filename the record was stored under.
 */
export function saveImageToDb(base64Data: string | Blob, filename: string, metadata: Record<string, unknown> = {}): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (!imageDb) {
      console.error("IndexedDB not initialized");
      initImageDb().then(() => {
        saveImageToDb(base64Data, filename, metadata).then(resolve).catch(reject);
      }).catch(reject);
      return;
    }
    const transaction = imageDb.transaction([IMAGE_STORE_NAME], "readwrite");
    const store = transaction.objectStore(IMAGE_STORE_NAME);

    const record = {
      filename: filename,
      data: base64Data,
      timestamp: new Date().toISOString(),
      ...metadata,
    };

    const request = store.put(record);

    request.onerror = () => {
      console.error("Error saving image to IndexedDB:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      console.info("Image saved to IndexedDB:", filename);
      resolve(filename);
    };
  });
}

/**
 * Loads an image record by filename, initializing the database first if needed.
 *
 * @param filename - The record key to retrieve.
 * @returns The stored image record.
 * @throws If no record exists for `filename`.
 */
export function loadImageFromDb(filename: string): Promise<StoredImage> {
  return new Promise<StoredImage>((resolve, reject) => {
    if (!imageDb) {
      console.error("IndexedDB not initialized");
      initImageDb().then(() => {
        loadImageFromDb(filename).then(resolve).catch(reject);
      }).catch(reject);
      return;
    }
    const transaction = imageDb.transaction([IMAGE_STORE_NAME], "readonly");
    const store = transaction.objectStore(IMAGE_STORE_NAME);

    const request = store.get(filename);

    request.onerror = () => {
      console.error("Error loading image from IndexedDB:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        console.info("Image loaded from IndexedDB:", filename);
        resolve(result);
      } else {
        const error = new Error("Image not found in IndexedDB");
        console.warn(error.message);
        reject(error);
      }
    };
  });
}

/**
 * Deletes an image record by filename.
 *
 * @param filename - The record key to delete.
 * @returns `true` once the record is removed.
 */
export function deleteImageFromDb(filename: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    if (!imageDb) {
      console.error("IndexedDB not initialized");
      reject(new Error("IndexedDB not initialized"));
      return;
    }
    const transaction = imageDb.transaction([IMAGE_STORE_NAME], "readwrite");
    const store = transaction.objectStore(IMAGE_STORE_NAME);

    const request = store.delete(filename);

    request.onerror = () => {
      console.error("Error deleting image from IndexedDB:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      console.info("Image deleted from IndexedDB:", filename);
      resolve(true);
    };
  });
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("DOMContentLoaded", () => {
    initImageDb().catch(err => {
      console.error("Failed to initialize image database:", err);
    });
  });
}

/**
 * Loads a stored image and returns it as a `Blob` suitable for API upload.
 *
 * @param imageId - The image filename/key in storage.
 * @returns The image as a `Blob`.
 * @throws If the image is missing, empty, or in an unsupported format.
 */
export async function getImageBlobForUpload(imageId: string): Promise<Blob> {
  try {
    const imageRecord = await loadImageFromDb(imageId);

    if (!imageRecord || !imageRecord.data) {
      throw new Error(`Image not found or has no data: ${imageId}`);
    }

    if (imageRecord.data instanceof Blob) {
      return imageRecord.data;
    }

    if (typeof imageRecord.data === "string") {
      if (imageRecord.data.startsWith("data:")) {
        const base64Data = imageRecord.data.split(",")[1];
        if (!base64Data) {
          throw new Error("Invalid data URL format");
        }

        const mimeMatch = imageRecord.data.match(/^data:([^;]+);/);
        const mimeType = mimeMatch ? mimeMatch[1] : "image/png";

        return base64ToBlob(base64Data, mimeType);
      }
      else {
        try {
          return base64ToBlob(imageRecord.data, "image/png");
        } catch (error) {
          throw new Error(`Failed to convert base64 to Blob: ${(error as Error).message}`);
        }
      }
    }

    throw new Error(`Unsupported image data format for ${imageId}`);
  } catch (error) {
    console.error("Error getting image blob for upload:", error);
    throw error;
  }
}

/**
 * Loads a stored image and returns it as a data URL.
 *
 * @remarks
 * Intended for APIs that expect data URLs rather than binary uploads. Plain
 * base64 data with no prefix is assumed to be PNG.
 *
 * @param imageId - The image filename/key to retrieve.
 * @returns The image as a data URL.
 * @throws If the image is missing, empty, or in an unsupported format.
 */
export async function getImageDataForUpload(imageId: string): Promise<string | ArrayBuffer | null> {
  try {
    const imageRecord = await loadImageFromDb(imageId);

    if (!imageRecord || !imageRecord.data) {
      throw new Error(`Image not found or has no data: ${imageId}`);
    }

    if (typeof imageRecord.data === "string" && imageRecord.data.startsWith("data:")) {
      return imageRecord.data;
    }

    if (imageRecord.data instanceof Blob) {
      const blob = imageRecord.data;
      return new Promise<string | ArrayBuffer | null>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    if (typeof imageRecord.data === "string") {
      try {
        return `data:image/png;base64,${imageRecord.data}`;
      } catch (error) {
        throw new Error(`Failed to format image data as data URL: ${(error as Error).message}`);
      }
    }

    throw new Error(`Unsupported image data format for ${imageId}`);
  } catch (error) {
    console.error("Error getting image data URL for upload:", error);
    throw error;
  }
}
