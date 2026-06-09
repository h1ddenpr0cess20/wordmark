import { showError,showInfo } from "../utils/notifications.ts";
/**
 * Assistants File Manager UI Component
 * Mirrors the Python utility (upload/list/delete/delete-all) for browser usage.
 */

import { listAssistantFiles, deleteFile as deleteAssistantFile, deleteAllAssistantFiles } from "../services/files.ts";
import { uploadFile as uploadAssistantFile } from "../services/vectorStore.ts"; // reuse existing upload implementation

/**
 * Initialize the Assistants File Manager
 */
export async function initFilesManager() {
  const listContainer = document.getElementById("assistant-file-list");
  if (!listContainer) return;

  const refreshButton = document.getElementById("refresh-assistant-files");
  const uploadButton = document.getElementById("upload-assistant-files");
  const deleteAllButton = document.getElementById("delete-all-assistant-files");

  if (refreshButton) {
    refreshButton.addEventListener("click", refreshAssistantFileList);
  }

  if (uploadButton) {
    uploadButton.addEventListener("click", uploadSelectedAssistantFiles);
  }

  if (deleteAllButton) {
    deleteAllButton.addEventListener("click", handleDeleteAllAssistantFiles);
  }

  await refreshAssistantFileList();
}

/**
 * Refresh the assistants file list
 */
export async function refreshAssistantFileList() {
  const listContainer = document.getElementById("assistant-file-list");
  if (!listContainer) return;

  listContainer.innerHTML = "<div class=\"loading-text\">Loading assistant files...</div>";

  try {
    const response = await listAssistantFiles();
    const files = Array.isArray(response?.data) ? response.data : [];

    if (files.length === 0) {
      listContainer.innerHTML = "<div class=\"empty-state\">No assistant files found.</div>";
      return;
    }

    // Build list
    const listHtml = files.map((file: { id?: string; filename?: string; name?: string; created_at?: number }) => {
      const createdDate = file.created_at ? new Date(file.created_at * 1000).toLocaleDateString() : "Unknown";
      const name = escapeHtml(file.filename || file.name || "(no name)");
      const id = escapeHtml(file.id || "");
      return `
        <div class="assistant-file-item" data-file-id="${id}">
          <div class="assistant-file-row">
            <div class="assistant-file-info">
              <strong>${name}</strong>
              <div class="assistant-file-meta">
                <span class="meta-item"><strong>ID:</strong> ${id}</span>
                <span class="meta-item"><strong>Created:</strong> ${createdDate}</span>
              </div>
            </div>
            <div class="assistant-file-actions">
              <button class="btn-small btn-delete-file" data-file-id="${id}" title="Delete this file">Delete</button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    listContainer.innerHTML = listHtml;

    // Wire per-file delete
    listContainer.querySelectorAll(".btn-delete-file").forEach((btn: Element) => {
      btn.addEventListener("click", async (e: Event) => {
        const fileId = (e.currentTarget as HTMLElement).getAttribute("data-file-id");
        if (!fileId) return;
        const confirmed = confirm("Delete this file? This action cannot be undone.");
        if (!confirmed) return;

        try {
          await deleteAssistantFile(fileId);
          if (showInfo) showInfo("File deleted");
          await refreshAssistantFileList();
        } catch (err) {
          console.error("Failed to delete file:", err);
          if (showError) showError(`Failed to delete: ${err instanceof Error ? err.message : ""}`);
        }
      });
    });

  } catch (error) {
    console.error("Failed to load assistant files:", error);

    const errorMessage = error instanceof Error ? error.message : "";
    const isCorsError = errorMessage.includes("CORS") ||
                        errorMessage.includes("fetch") ||
                        (error instanceof Error && error.name === "TypeError");

    if (isCorsError) {
      listContainer.innerHTML = `
        <div class="info-message">
          <p><strong>File Listing Not Available</strong></p>
        </div>
      `;
    } else {
      listContainer.innerHTML = `<div class="error-message">Failed to load files: ${escapeHtml(errorMessage)}</div>`;
    }
  }
}

/**
 * Upload files selected in the input
 */
async function uploadSelectedAssistantFiles() {
  const input = document.getElementById("assistant-file-upload") as HTMLInputElement | null;
  if (!input || !input.files || input.files.length === 0) {
    if (showInfo) showInfo("Select one or more files first.");
    return;
  }

  // Upload sequentially for clearer status and rate-limit friendliness
  let success = 0;
  let fail = 0;

  for (const file of Array.from(input.files)) {
    try {
      await uploadAssistantFile(file); // purpose=assistants handled by service
      success++;
    } catch (err) {
      console.error("File upload failed:", file.name, err);
      fail++;
    }
  }

  if (showInfo) {
    showInfo(`Upload complete. Success: ${success}${fail ? `, Failed: ${fail}` : ""}`);
  }

  // Clear the file input
  input.value = "";
  // Refresh list
  await refreshAssistantFileList();
}

/**
 * Delete all assistant files, with strong confirmation
 */
async function handleDeleteAllAssistantFiles() {
  const confirmation = prompt("This will delete all OpenAI files with purpose 'assistants'. Type 'YES' to confirm:");
  if (confirmation !== "YES") {
    if (showInfo) showInfo("Operation cancelled.");
    return;
  }

  try {
    const result = await deleteAllAssistantFiles();
    if (showInfo) {
      showInfo(`Deleted ${result.deleted}/${result.total} files.${result.errors?.length ? " Some deletions failed." : ""}`);
    }
    await refreshAssistantFileList();
  } catch (err) {
    console.error("Failed to delete all assistant files:", err);
    if (showError) showError(`Failed to delete all: ${err instanceof Error ? err.message : ""}`);
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: unknown) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}
