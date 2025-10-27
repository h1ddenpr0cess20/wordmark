/**
 * Assistants Files Service
 * Mirrors the Python utility (upload/list/delete/delete-all) for browser usage.
 * Uses the same API config pattern as vectorStore.js.
 */

import { ensureApiKey, getBaseUrl } from "./api/clientConfig.js";

/**
 * List files with purpose "assistants"
 */
export async function listAssistantFiles() {
  const apiKey = ensureApiKey();
  const baseUrl = getBaseUrl();

  const url = `${baseUrl}/files?purpose=assistants`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list assistant files: ${error}`);
  }

  return response.json(); // { data: [...] }
}

/**
 * Delete a file by ID
 */
export async function deleteFile(fileId) {
  const apiKey = ensureApiKey();
  const baseUrl = getBaseUrl();

  const response = await fetch(`${baseUrl}/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete file ${fileId}: ${error}`);
  }

  return response.json();
}

/**
 * Delete all files with purpose "assistants"
 */
export async function deleteAllAssistantFiles() {
  const list = await listAssistantFiles();
  const files = Array.isArray(list?.data) ? list.data : [];

  let deleted = 0;
  const errors = [];

  for (const f of files) {
    try {
      await deleteFile(f.id);
      deleted++;
    } catch (e) {
      console.error("Error deleting file", f.id, e);
      errors.push({ id: f.id, error: e?.message || String(e) });
    }
  }

  return { deleted, total: files.length, errors };
}
