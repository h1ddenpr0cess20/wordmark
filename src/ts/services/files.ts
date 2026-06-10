/**
 * Assistants files service.
 *
 * @remarks
 * Browser-side list/delete operations over the provider's `/files` endpoint,
 * scoped to the `assistants` purpose. Uses the same API-config pattern as
 * {@link ./vectorStore.ts}.
 */

import { ensureApiKey, getBaseUrl } from "./api/clientConfig.ts";

/**
 * Lists files uploaded with the `assistants` purpose.
 *
 * @returns The provider's file list (`{ data: [...] }`).
 * @throws If the request fails.
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

  return response.json();
}

/**
 * Deletes a single file by id.
 *
 * @param fileId - The file id to delete.
 * @throws If the request fails.
 */
export async function deleteFile(fileId: string) {
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
 * Deletes every `assistants`-purpose file, continuing past individual failures.
 *
 * @returns A summary `{ deleted, total, errors }`.
 */
export async function deleteAllAssistantFiles() {
  const list = await listAssistantFiles();
  const files = Array.isArray(list?.data) ? list.data : [];

  let deleted = 0;
  const errors: { id: string; error: string }[] = [];

  for (const f of files) {
    try {
      await deleteFile(f.id);
      deleted++;
    } catch (e) {
      console.error("Error deleting file", f.id, e);
      errors.push({ id: f.id, error: (e instanceof Error ? e.message : "") || String(e) });
    }
  }

  return { deleted, total: files.length, errors };
}
