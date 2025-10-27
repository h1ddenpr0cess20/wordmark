/**
 * Image Storage Utilities using IndexedDB
 * Provides functions for storing and retrieving images from IndexedDB
 */

// IndexedDB database configuration
const IMAGE_DB_NAME = "wordmark-images";
const IMAGE_DB_VERSION = 1;
const IMAGE_STORE_NAME = "images";
if (typeof window !== "undefined") {
  window.IMAGE_STORE_NAME = IMAGE_STORE_NAME;
}

/**
 * Initialize the IndexedDB database for image storage
 * @returns {Promise} - Promise that resolves when the database is ready
 */
window.initImageDb = function() {
  return new Promise((resolve, reject) => {
    if (window.indexedDB === undefined) {
      console.error("IndexedDB is not supported in this browser");
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const request = window.indexedDB.open(IMAGE_DB_NAME, IMAGE_DB_VERSION);

    request.onerror = (event) => {
      console.error("IndexedDB error:", event.target.error);
      reject(event.target.error);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      // Create an object store for images if it doesn't exist
      if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) {
        db.createObjectStore(IMAGE_STORE_NAME, { keyPath: "filename" });
        console.info("Created image store in IndexedDB");
      }
    };

    request.onsuccess = (event) => {
      window.imageDb = event.target.result;
      console.info("IndexedDB initialized for image storage");
      resolve();
    };
  });
};

/**
 * Save an image to IndexedDB
 * @param {string} base64Data - Base64 image data
 * @param {string} filename - Unique filename to use as the key
 * @param {string} metadata - Any additional metadata about the image
 * @returns {Promise<string>} - Promise that resolves with the filename
 */
window.saveImageToDb = function(base64Data, filename, metadata = {}) {
  return new Promise((resolve, reject) => {
    if (!window.imageDb) {
      console.error("IndexedDB not initialized");
      // Try to initialize it now
      window.initImageDb().then(() => {
        // Retry after initialization
        window.saveImageToDb(base64Data, filename, metadata).then(resolve).catch(reject);
      }).catch(reject);
      return;
    }
    // Start a transaction
    const transaction = window.imageDb.transaction([IMAGE_STORE_NAME], "readwrite");
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

    request.onerror = (event) => {
      console.error("Error saving image to IndexedDB:", event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = () => {
      console.info("Image saved to IndexedDB:", filename);
      resolve(filename);
    };
  });
};

/**
 * Load an image from IndexedDB
 * @param {string} filename - The filename key to retrieve
 * @returns {Promise<Object>} - Promise that resolves with the image record
 */
window.loadImageFromDb = function(filename) {
  return new Promise((resolve, reject) => {
    if (!window.imageDb) {
      console.error("IndexedDB not initialized");
      // Try to initialize it now
      window.initImageDb().then(() => {
        // Retry after initialization
        window.loadImageFromDb(filename).then(resolve).catch(reject);
      }).catch(reject);
      return;
    }
    // Start a transaction
    const transaction = window.imageDb.transaction([IMAGE_STORE_NAME], "readonly");
    const store = transaction.objectStore(IMAGE_STORE_NAME);

    // Get the record
    const request = store.get(filename);

    request.onerror = (event) => {
      console.error("Error loading image from IndexedDB:", event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      const result = event.target.result;
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
};

/**
 * Delete an image from IndexedDB
 * @param {string} filename - The filename key to delete
 * @returns {Promise<boolean>} - Promise that resolves when deleted
 */
window.deleteImageFromDb = function(filename) {
  return new Promise((resolve, reject) => {
    if (!window.imageDb) {
      console.error("IndexedDB not initialized");
      reject(new Error("IndexedDB not initialized"));
      return;
    }
    // Start a transaction
    const transaction = window.imageDb.transaction([IMAGE_STORE_NAME], "readwrite");
    const store = transaction.objectStore(IMAGE_STORE_NAME);

    // Delete the record
    const request = store.delete(filename);

    request.onerror = (event) => {
      console.error("Error deleting image from IndexedDB:", event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = () => {
      console.info("Image deleted from IndexedDB:", filename);
      resolve(true);
    };
  });
};

/**
 * Debug helper for diagnosing image loading issues
 * @param {boolean} verbose - Whether to print detailed information for each image
 * @returns {Object} - Object containing diagnostic information
 */
window.debugImageLoading = function(verbose = false) {
  console.group("Image Loading Diagnostics");
  console.log("Running image diagnostics...");

  // Check if conversation history exists
  if (!window.conversationHistory || window.conversationHistory.length === 0) {
    console.warn("No conversation history found.");
    console.groupEnd();
    return { error: "No conversation history found" };
  }

  // Results to return
  const diagnostics = {
    messagesWithImages: 0,
    totalImagePlaceholders: 0,
    filenameSpecificPlaceholders: 0,
    genericPlaceholders: 0,
    imagesFoundInDb: 0,
    imagesMissingFromDb: 0,
    imagesWithoutAssociatedMessage: 0,
    details: [],
  };

  // Check each message for image references
  window.conversationHistory.forEach((message, index) => {
    if (message.role !== "assistant" || !message.content) {
      return;
    }
    // Look for image placeholders
    const filenameMatches = message.content.match(/\[\[IMAGE: ([^\]]+)\]\]/g) || [];
    const filenameSpecificPlaceholders = filenameMatches.length;

    if (filenameSpecificPlaceholders > 0) {
      diagnostics.messagesWithImages++;
      diagnostics.totalImagePlaceholders += filenameSpecificPlaceholders;
      diagnostics.genericPlaceholders = 0;
      diagnostics.filenameSpecificPlaceholders += filenameSpecificPlaceholders;

      if (verbose) {
        const messageDetail = {
          messageIndex: index,
          messageId: message.id || "unknown",
          genericPlaceholders,
          filenameSpecificPlaceholders,
          filenames: [],
        };

        // Extract filenames for checking against DB
        filenameMatches.forEach(match => {
          const filename = match.replace(/\[\[IMAGE: |\]\]/g, "").trim();
          messageDetail.filenames.push(filename);

          // Check if this image exists in DB
          window.loadImageFromDb(filename)
            .then(() => {
              diagnostics.imagesFoundInDb++;
              console.log(`✅ Image found in DB: ${filename}`);
            })
            .catch(() => {
              diagnostics.imagesMissingFromDb++;
              console.error(`❌ Image not found in DB: ${filename}`);
            });
        });

        diagnostics.details.push(messageDetail);
      }
    }
  });

  // Check for generated images without message associations
  if (window.generatedImages && window.generatedImages.length > 0) {
    const unassociated = window.generatedImages.filter(img => !img.associatedMessageId).length;
    diagnostics.imagesWithoutAssociatedMessage = unassociated;

    if (verbose && unassociated > 0) {
      console.warn(`${unassociated} images don't have associated message IDs`);
      window.generatedImages
        .filter(img => !img.associatedMessageId)
        .forEach(img => {
          console.log("Unassociated image:", img.filename, img.timestamp);
        });
    }
  }
  // Print summary
  console.log("Image Loading Diagnostics Summary:");
  console.log(`- Messages with images: ${diagnostics.messagesWithImages}`);
  console.log(`- Total image placeholders: ${diagnostics.totalImagePlaceholders}`);
  console.log(`- Image placeholders: ${diagnostics.filenameSpecificPlaceholders}`);
  console.log(`- Images with missing message associations: ${diagnostics.imagesWithoutAssociatedMessage}`);

  console.groupEnd();
  return diagnostics;
};

// Initialize the image database when this script loads
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    window.initImageDb().catch(err => {
      console.error("Failed to initialize image database:", err);
    });
  });
}

/**
 * Get an image from storage as a Blob for API upload
 * @param {string} imageId - The image ID or filename in storage
 * @returns {Promise<Blob>} - Promise that resolves with the image as a Blob
 */
window.getImageBlobForUpload = async function(imageId) {
  try {
    // Load the image from database
    const imageRecord = await window.loadImageFromDb(imageId);

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
          throw new Error(`Failed to convert base64 to Blob: ${error.message}`);
        }
      }
    }

    throw new Error(`Unsupported image data format for ${imageId}`);
  } catch (error) {
    console.error("Error getting image blob for upload:", error);
    throw error;
  }
};

/**
 * Get image data URL for upload/processing (for APIs that need data URLs like Gemini)
 * @param {string} imageId - The image ID to retrieve
 * @returns {Promise<string>} - Promise that resolves with the data URL
 */
window.getImageDataForUpload = async function(imageId) {
  try {
    // Load the image from database
    const imageRecord = await window.loadImageFromDb(imageId);

    if (!imageRecord || !imageRecord.data) {
      throw new Error(`Image not found or has no data: ${imageId}`);
    }

    // If the data is already a data URL, return it directly
    if (typeof imageRecord.data === "string" && imageRecord.data.startsWith("data:")) {
      return imageRecord.data;
    }

    // If it's a Blob, convert it to data URL
    if (imageRecord.data instanceof Blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(imageRecord.data);
      });
    }

    // Handle plain base64 string (convert to data URL)
    if (typeof imageRecord.data === "string") {
      try {
        // Assume PNG format if not specified
        return `data:image/png;base64,${imageRecord.data}`;
      } catch (error) {
        throw new Error(`Failed to format image data as data URL: ${error.message}`);
      }
    }

    throw new Error(`Unsupported image data format for ${imageId}`);
  } catch (error) {
    console.error("Error getting image data URL for upload:", error);
    throw error;
  }
};
