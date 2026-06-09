/**
 * Image Storage Utilities using IndexedDB
 * Provides functions for storing and retrieving images from IndexedDB
 */

// IndexedDB database configuration
const IMAGE_DB_NAME = "wordmark-images";
const IMAGE_DB_VERSION = 1;
export const IMAGE_STORE_NAME = "images";

// Module-level handle to the open database (was window.imageDb)
let imageDb: IDBDatabase | null = null;

/** An image/media record as persisted in the IndexedDB image store. */
export interface StoredImage {
  filename: string;
  data: string | Blob;
  timestamp: string;
  [key: string]: unknown;
}

/**
 * Accessor for the open image database handle (used by the gallery to run its
 * own cursor queries).
 * @returns {IDBDatabase|null}
 */
export function getImageDb() {
  return imageDb;
}

/**
 * Initialize the IndexedDB database for image storage
 * @returns {Promise} - Promise that resolves when the database is ready
 */
export function initImageDb() {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined" || window.indexedDB === undefined) {
      console.error("IndexedDB is not supported in this browser");
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const request = window.indexedDB.open(IMAGE_DB_NAME, IMAGE_DB_VERSION);

    request.onerror = () => {
      console.error("IndexedDB error:", request.error);
      reject(request.error);
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      // Create an object store for images if it doesn't exist
      if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) {
        db.createObjectStore(IMAGE_STORE_NAME, { keyPath: "filename" });
        console.info("Created image store in IndexedDB");
      }
    };

    request.onsuccess = () => {
      imageDb = request.result;
      console.info("IndexedDB initialized for image storage");
      resolve();
    };
  });
}

/**
 * Save an image to IndexedDB
 * @param {string} base64Data - Base64 image data
 * @param {string} filename - Unique filename to use as the key
 * @param {string} metadata - Any additional metadata about the image
 * @returns {Promise<string>} - Promise that resolves with the filename
 */
export function saveImageToDb(base64Data: string | Blob, filename: string, metadata: Record<string, unknown> = {}): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (!imageDb) {
      console.error("IndexedDB not initialized");
      // Try to initialize it now
      initImageDb().then(() => {
        // Retry after initialization
        saveImageToDb(base64Data, filename, metadata).then(resolve).catch(reject);
      }).catch(reject);
      return;
    }
    // Start a transaction
    const transaction = imageDb.transaction([IMAGE_STORE_NAME], "readwrite");
    const store = transaction.objectStore(IMAGE_STORE_NAME);

    // Create a record with the image data
    const record = {
      filename: filename,
      data: base64Data,
      timestamp: new Date().toISOString(),
      ...metadata,
    };

    // Add to the store
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
 * Load an image from IndexedDB
 * @param {string} filename - The filename key to retrieve
 * @returns {Promise<Object>} - Promise that resolves with the image record
 */
export function loadImageFromDb(filename: string): Promise<StoredImage> {
  return new Promise<StoredImage>((resolve, reject) => {
    if (!imageDb) {
      console.error("IndexedDB not initialized");
      // Try to initialize it now
      initImageDb().then(() => {
        // Retry after initialization
        loadImageFromDb(filename).then(resolve).catch(reject);
      }).catch(reject);
      return;
    }
    // Start a transaction
    const transaction = imageDb.transaction([IMAGE_STORE_NAME], "readonly");
    const store = transaction.objectStore(IMAGE_STORE_NAME);

    // Get the record
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
 * Delete an image from IndexedDB
 * @param {string} filename - The filename key to delete
 * @returns {Promise<boolean>} - Promise that resolves when deleted
 */
export function deleteImageFromDb(filename: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    if (!imageDb) {
      console.error("IndexedDB not initialized");
      reject(new Error("IndexedDB not initialized"));
      return;
    }
    // Start a transaction
    const transaction = imageDb.transaction([IMAGE_STORE_NAME], "readwrite");
    const store = transaction.objectStore(IMAGE_STORE_NAME);

    // Delete the record
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

// Initialize the image database when this script loads
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("DOMContentLoaded", () => {
    initImageDb().catch(err => {
      console.error("Failed to initialize image database:", err);
    });
  });
}

/**
 * Get an image from storage as a Blob for API upload
 * @param {string} imageId - The image ID or filename in storage
 * @returns {Promise<Blob>} - Promise that resolves with the image as a Blob
 */
export async function getImageBlobForUpload(imageId: string): Promise<Blob> {
  try {
    // Load the image from database
    const imageRecord = await loadImageFromDb(imageId);

    if (!imageRecord || !imageRecord.data) {
      throw new Error(`Image not found or has no data: ${imageId}`);
    }

    // If the data is already a Blob, return it directly
    if (imageRecord.data instanceof Blob) {
      return imageRecord.data;
    }

    // Handle base64 data
    if (typeof imageRecord.data === "string") {
      // Check if it's a data URL or just base64 string
      if (imageRecord.data.startsWith("data:")) {
        // Extract base64 part from data URL
        const base64Data = imageRecord.data.split(",")[1];
        if (!base64Data) {
          throw new Error("Invalid data URL format");
        }

        // Get the MIME type from data URL
        const mimeMatch = imageRecord.data.match(/^data:([^;]+);/);
        const mimeType = mimeMatch ? mimeMatch[1] : "image/png"; // Default to PNG

        // Convert to Blob
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
      }
      // Handle plain base64 string (no data URL prefix)
      else {
        try {
          const byteCharacters = atob(imageRecord.data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          return new Blob([byteArray], { type: "image/png" });
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
 * Get image data URL for upload/processing (for APIs that need data URLs like Gemini)
 * @param {string} imageId - The image ID to retrieve
 * @returns {Promise<string>} - Promise that resolves with the data URL
 */
export async function getImageDataForUpload(imageId: string): Promise<string | ArrayBuffer | null> {
  try {
    // Load the image from database
    const imageRecord = await loadImageFromDb(imageId);

    if (!imageRecord || !imageRecord.data) {
      throw new Error(`Image not found or has no data: ${imageId}`);
    }

    // If the data is already a data URL, return it directly
    if (typeof imageRecord.data === "string" && imageRecord.data.startsWith("data:")) {
      return imageRecord.data;
    }

    // If it's a Blob, convert it to data URL
    if (imageRecord.data instanceof Blob) {
      const blob = imageRecord.data;
      return new Promise<string | ArrayBuffer | null>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    // Handle plain base64 string (convert to data URL)
    if (typeof imageRecord.data === "string") {
      try {
        // Assume PNG format if not specified
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

