/**
 * Vector store and file-management service.
 *
 * @remarks
 * Wraps the provider's `/files` and `/vector_stores` endpoints. Per-store
 * metadata and active-store state live in {@link ./vectorStoreMetadata.ts} and
 * are re-exported here so callers keep a single entry point.
 */

import { showInfo } from "../utils/notifications.ts";
import { ensureApiKey, getActiveServiceKey, getBaseUrl } from "./api/clientConfig.ts";
import { SUPPORTED_FILE_EXTENSIONS, isSupportedFileType, toUploadableFile } from "./fileSupport.ts";

export { SUPPORTED_FILE_EXTENSIONS, filterSupportedFiles } from "./fileSupport.ts";

export {
  MAX_ACTIVE_VECTOR_STORES,
  saveVectorStoreMetadata,
  getVectorStoreMetadata,
  getActiveVectorStoreIds,
  removeVectorStoreMetadata,
  getActiveVectorStoreId,
  setActiveVectorStoreId,
  clearActiveVectorStore,
  initializeVectorStore,
} from "./vectorStoreMetadata.ts";

/**
 * Upload a file to the selected service.
 *
 * @param file - The file to upload.
 * @param purpose - The Files API purpose. Vector store ingestion uses
 * `assistants`; direct `input_file` attachments pass the provider's
 * model-input purpose instead.
 */
export async function uploadFile(file: File, purpose = "assistants") {
  const apiKey = ensureApiKey();
  const baseUrl = getBaseUrl();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("purpose", purpose);

  const response = await fetch(`${baseUrl}/files`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
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
export async function createVectorStore(name: string) {
  const apiKey = ensureApiKey();
  const baseUrl = getBaseUrl();

  const response = await fetch(`${baseUrl}/vector_stores`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
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
export async function attachFileToVectorStore(vectorStoreId: string, fileId: string) {
  const apiKey = ensureApiKey();
  const baseUrl = getBaseUrl();

  const response = await fetch(`${baseUrl}/vector_stores/${vectorStoreId}/files`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
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
export async function getVectorStoreFileStatus(vectorStoreId: string, fileId: string) {
  const apiKey = ensureApiKey();
  const baseUrl = getBaseUrl();

  const response = await fetch(`${baseUrl}/vector_stores/${vectorStoreId}/files/${fileId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
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
export async function uploadAndAttachFiles(files: File[], vectorStoreName = "Chat Documents") {
  try {
    const serviceKey = getActiveServiceKey();
    const uploads: { source: File; upload: File }[] = [];
    const unsupported: File[] = [];

    for (const file of files) {
      // A textual file outside File Search's native set uploads as `.txt`;
      // only binaries a vector store cannot index at all are skipped.
      const upload = toUploadableFile(file, serviceKey);
      if (isSupportedFileType(upload.name)) {
        uploads.push({ source: file, upload });
      } else {
        unsupported.push(file);
      }
    }

    if (unsupported.length > 0) {
      const unsupportedNames = unsupported.map(f => f.name).join(", ");
      console.warn(`Skipping ${unsupported.length} unsupported file(s): ${unsupportedNames}`);

      if (showInfo) {
        showInfo(`Skipped ${unsupported.length} unsupported file(s). Supported formats: ${SUPPORTED_FILE_EXTENSIONS.join(", ")}`);
      }
    }

    if (uploads.length === 0) {
      throw new Error("No supported files to upload. Supported formats: " + SUPPORTED_FILE_EXTENSIONS.join(", "));
    }

    const vectorStore = await createVectorStore(vectorStoreName);

    const attachments: { fileId: string; fileName: string; vectorStoreId: string; status: unknown }[] = [];
    for (const { source, upload } of uploads) {
      const uploadedFile = await uploadFile(upload);
      const attachment = await attachFileToVectorStore(vectorStore.id, uploadedFile.id);
      attachments.push({
        fileId: uploadedFile.id,
        fileName: source.name,
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
export async function waitForFileProcessing(vectorStoreId: string, fileId: string, maxAttempts = 30, interval = 1000) {
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
export async function getVectorStore(vectorStoreId: string) {
  const apiKey = ensureApiKey();
  const baseUrl = getBaseUrl();

  const response = await fetch(`${baseUrl}/vector_stores/${vectorStoreId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
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
export async function deleteVectorStore(vectorStoreId: string) {
  const apiKey = ensureApiKey();
  const baseUrl = getBaseUrl();

  const response = await fetch(`${baseUrl}/vector_stores/${vectorStoreId}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
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
export async function listVectorStoreFiles(vectorStoreId: string, limit = 20) {
  const apiKey = ensureApiKey();
  const baseUrl = getBaseUrl();

  const response = await fetch(`${baseUrl}/vector_stores/${vectorStoreId}/files?limit=${limit}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list vector store files: ${error}`);
  }

  return response.json();
}
