/**
 * Vector Store and File Management Service
 */

import { ensureApiKey, getBaseUrl } from "./api/clientConfig.js";

/**
 * Supported file extensions for vector store uploads
 */
const SUPPORTED_FILE_EXTENSIONS = [
  "c", "cpp", "css", "csv", "doc", "docx", "gif", "go", "html", "java",
  "jpeg", "jpg", "js", "json", "md", "pdf", "php", "pkl", "png", "pptx",
  "py", "rb", "tar", "tex", "ts", "txt", "webp", "xlsx", "xml", "zip",
];

/**
 * Check if a file has a supported extension
 */
function isSupportedFileType(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  return SUPPORTED_FILE_EXTENSIONS.includes(ext);
}

/**
 * Filter files to only include supported types
 */
export function filterSupportedFiles(files) {
  const supported = [];
  const unsupported = [];

  files.forEach(file => {
    if (isSupportedFileType(file.name)) {
      supported.push(file);
    } else {
      unsupported.push(file);
    }
  });

  return { supported, unsupported };
}

/**
 * Upload a file to the selected service
 */
export async function uploadFile(file) {
  const apiKey = ensureApiKey();
  const baseUrl = getBaseUrl();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("purpose", "assistants");

  const response = await fetch(`${baseUrl}/files`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Access-Control-Allow-Origin": "*",
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`File upload failed: ${error}`);
  }

  return response.json();
}

/**
 * Create a vector store
 */
export async function createVectorStore(name) {
  const apiKey = ensureApiKey();
  const baseUrl = getBaseUrl();

  const response = await fetch(`${baseUrl}/vector_stores`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Vector store creation failed: ${error}`);
  }

  return response.json();
}

/**
 * Attach file to vector store
 */
export async function attachFileToVectorStore(vectorStoreId, fileId) {
  const apiKey = ensureApiKey();
  const baseUrl = getBaseUrl();

  const response = await fetch(`${baseUrl}/vector_stores/${vectorStoreId}/files`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({ file_id: fileId }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to attach file to vector store: ${error}`);
  }

  return response.json();
}

/**
 * Get vector store file status
 */
export async function getVectorStoreFileStatus(vectorStoreId, fileId) {
  const apiKey = ensureApiKey();
  const baseUrl = getBaseUrl();

  const response = await fetch(`${baseUrl}/vector_stores/${vectorStoreId}/files/${fileId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Access-Control-Allow-Origin": "*",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get file status: ${error}`);
  }

  return response.json();
}

/**
 * Batch upload and attach files to vector store
 */
export async function uploadAndAttachFiles(files, vectorStoreName = "Chat Documents") {
  try {
    // Filter files to only include supported types
    const { supported, unsupported } = filterSupportedFiles(files);

    // Warn about unsupported files
    if (unsupported.length > 0) {
      const unsupportedNames = unsupported.map(f => f.name).join(", ");
      console.warn(`Skipping ${unsupported.length} unsupported file(s): ${unsupportedNames}`);

      if (window.showInfo) {
        window.showInfo(`Skipped ${unsupported.length} unsupported file(s). Supported formats: ${SUPPORTED_FILE_EXTENSIONS.join(", ")}`);
      }
    }

    // If no supported files, throw error
    if (supported.length === 0) {
      throw new Error("No supported files to upload. Supported formats: " + SUPPORTED_FILE_EXTENSIONS.join(", "));
    }

    // Create vector store
    const vectorStore = await createVectorStore(vectorStoreName);

    // Upload files and attach to vector store
    const attachments = [];
    for (const file of supported) {
      const uploadedFile = await uploadFile(file);
      const attachment = await attachFileToVectorStore(vectorStore.id, uploadedFile.id);
      attachments.push({
        fileId: uploadedFile.id,
        fileName: file.name,
        vectorStoreId: vectorStore.id,
        status: attachment.status,
      });
    }

    return {
      vectorStoreId: vectorStore.id,
      attachments,
      skipped: unsupported.length,
    };
  } catch (error) {
    console.error("Error uploading and attaching files:", error);
    throw error;
  }
}

/**
 * Poll for file processing completion
 */
export async function waitForFileProcessing(vectorStoreId, fileId, maxAttempts = 30, interval = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await getVectorStoreFileStatus(vectorStoreId, fileId);

    if (status.status === "completed") {
      return status;
    }

    if (status.status === "failed") {
      throw new Error(`File processing failed: ${JSON.stringify(status.last_error)}`);
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error("File processing timeout");
}

/**
 * List all vector stores
 */
export async function listVectorStores(limit = 20) {
  const apiKey = ensureApiKey();
  const baseUrl = getBaseUrl();

  const response = await fetch(`${baseUrl}/vector_stores?limit=${limit}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list vector stores: ${error}`);
  }

  return response.json();
}

/**
 * Get vector store details
 */
export async function getVectorStore(vectorStoreId) {
  const apiKey = ensureApiKey();
  const baseUrl = getBaseUrl();

  const response = await fetch(`${baseUrl}/vector_stores/${vectorStoreId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Access-Control-Allow-Origin": "*",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get vector store: ${error}`);
  }

  return response.json();
}

/**
 * Delete a vector store
 */
export async function deleteVectorStore(vectorStoreId) {
  const apiKey = ensureApiKey();
  const baseUrl = getBaseUrl();

  const response = await fetch(`${baseUrl}/vector_stores/${vectorStoreId}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Access-Control-Allow-Origin": "*",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete vector store: ${error}`);
  }

  return response.json();
}

/**
 * List files in a vector store
 */
export async function listVectorStoreFiles(vectorStoreId, limit = 20) {
  const apiKey = ensureApiKey();
  const baseUrl = getBaseUrl();

  const response = await fetch(`${baseUrl}/vector_stores/${vectorStoreId}/files?limit=${limit}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Access-Control-Allow-Origin": "*",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list vector store files: ${error}`);
  }

  return response.json();
}

/**
 * Local storage key for vector store metadata
 */
const VECTOR_STORE_STORAGE_KEY = "wordmark_vector_stores";
export const MAX_ACTIVE_VECTOR_STORES = 2;

/**
 * Save vector store metadata to local storage
 */
export function saveVectorStoreMetadata(vectorStoreId, metadata) {
  try {
    const stored = localStorage.getItem(VECTOR_STORE_STORAGE_KEY);
    const stores = stored ? JSON.parse(stored) : {};
    stores[vectorStoreId] = {
      ...metadata,
      lastUsed: Date.now(),
    };
    const entries = Object.entries(stores);
    if (entries.length > MAX_ACTIVE_VECTOR_STORES) {
      const activeId = typeof getActiveVectorStoreId === "function" ? getActiveVectorStoreId() : null;
      const sorted = entries.sort((a, b) => {
        const aTime = a[1]?.lastUsed || 0;
        const bTime = b[1]?.lastUsed || 0;
        return bTime - aTime;
      });
      const limited = [];
      if (activeId) {
        const activeEntry = sorted.find(([id]) => id === activeId);
        if (activeEntry) {
          limited.push(activeEntry);
        }
      }
      for (const entry of sorted) {
        if (limited.length >= MAX_ACTIVE_VECTOR_STORES) break;
        if (entry[0] === activeId) continue;
        limited.push(entry);
      }
      const limitedStores = Object.fromEntries(limited.slice(0, MAX_ACTIVE_VECTOR_STORES));
      localStorage.setItem(VECTOR_STORE_STORAGE_KEY, JSON.stringify(limitedStores));
    } else {
      localStorage.setItem(VECTOR_STORE_STORAGE_KEY, JSON.stringify(stores));
    }
  } catch (error) {
    console.error("Failed to save vector store metadata:", error);
  }
}

/**
 * Get all vector store metadata from local storage
 */
export function getVectorStoreMetadata() {
  try {
    const stored = localStorage.getItem(VECTOR_STORE_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error("Failed to get vector store metadata:", error);
    return {};
  }
}

/**
 * Get a list of active vector store IDs.
 * "Active" includes the explicitly active store and any stores with saved metadata.
 */
export function getActiveVectorStoreIds() {
  try {
    const orderedIds = [];
    const active = typeof getActiveVectorStoreId === "function" ? getActiveVectorStoreId() : null;
    if (active) {
      orderedIds.push(active);
    }
    const metadata = typeof getVectorStoreMetadata === "function" ? getVectorStoreMetadata() : {};
    if (metadata && typeof metadata === "object") {
      const entries = Object.entries(metadata).sort((a, b) => {
        const aTime = a[1]?.lastUsed || 0;
        const bTime = b[1]?.lastUsed || 0;
        return bTime - aTime;
      });
      for (const [id] of entries) {
        if (orderedIds.length >= MAX_ACTIVE_VECTOR_STORES) {
          break;
        }
        if (!orderedIds.includes(id)) {
          orderedIds.push(id);
        }
      }
    }
    return orderedIds.slice(0, MAX_ACTIVE_VECTOR_STORES);
  } catch (error) {
    console.error("Failed to get active vector store IDs:", error);
    return [];
  }
}

/**
 * Remove vector store metadata from local storage
 */
export function removeVectorStoreMetadata(vectorStoreId) {
  try {
    const stored = localStorage.getItem(VECTOR_STORE_STORAGE_KEY);
    if (!stored) return;
    const stores = JSON.parse(stored);
    delete stores[vectorStoreId];
    localStorage.setItem(VECTOR_STORE_STORAGE_KEY, JSON.stringify(stores));
  } catch (error) {
    console.error("Failed to remove vector store metadata:", error);
  }
}

/**
 * Get the active vector store ID
 */
export function getActiveVectorStoreId() {
  try {
    return window.activeVectorStore || localStorage.getItem("active_vector_store") || null;
  } catch (_) {
    // Fallback if localStorage is unavailable (e.g., restricted environments)
    return window.activeVectorStore || null;
  }
}

/**
 * Set the active vector store ID
 */
export function setActiveVectorStoreId(vectorStoreId) {
  window.activeVectorStore = vectorStoreId;
  if (vectorStoreId) {
    localStorage.setItem("active_vector_store", vectorStoreId);
  } else {
    localStorage.removeItem("active_vector_store");
  }
}

/**
 * Clear the active vector store
 */
export function clearActiveVectorStore() {
  window.activeVectorStore = null;
  localStorage.removeItem("active_vector_store");
}

/**
 * Initialize vector store on app load
 */
export function initializeVectorStore() {
  const stored = localStorage.getItem("active_vector_store");
  if (stored) {
    window.activeVectorStore = stored;
  }
}
