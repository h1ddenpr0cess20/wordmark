/**
 * Assistants File Manager UI Component
 * Mirrors the Python utility (upload/list/delete/delete-all) for browser usage.
 */

import { listAssistantFiles, deleteFile as deleteAssistantFile, deleteAllAssistantFiles } from "../services/files.js";
import { uploadFile as uploadAssistantFile } from "../services/vectorStore.js"; // reuse existing upload implementation

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
    const listHtml = files.map((file, idx) => {
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
    listContainer.querySelectorAll(".btn-delete-file").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const fileId = e.currentTarget.getAttribute("data-file-id");
        if (!fileId) return;
        const confirmed = confirm("Delete this file? This action cannot be undone.");
        if (!confirmed) return;

        try {
          await deleteAssistantFile(fileId);
          if (window.showInfo) window.showInfo("File deleted");
          await refreshAssistantFileList();
        } catch (err) {
          console.error("Failed to delete file:", err);
          if (window.showError) window.showError(`Failed to delete: ${err.message}`);
        }
      });
    });

  } catch (error) {
    console.error("Failed to load assistant files:", error);

    const isCorsError = error.message.includes("CORS") ||
                        error.message.includes("fetch") ||
                        error.name === "TypeError";

    if (isCorsError) {
      listContainer.innerHTML = `
        <div class="info-message">
          <p><strong>File Listing Not Available</strong></p>
        </div>
      `;
    } else {
      listContainer.innerHTML = `<div class="error-message">Failed to load files: ${escapeHtml(error.message)}</div>`;
    }
  }
}

/**
 * Upload files selected in the input
 */
async function uploadSelectedAssistantFiles() {
  const input = document.getElementById("assistant-file-upload");
  if (!input || !input.files || input.files.length === 0) {
    if (window.showInfo) window.showInfo("Select one or more files first.");
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

  if (window.showInfo) {
    window.showInfo(`Upload complete. Success: ${success}${fail ? `, Failed: ${fail}` : ""}`);
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
    if (window.showInfo) window.showInfo("Operation cancelled.");
    return;
  }

  try {
    const result = await deleteAllAssistantFiles();
    if (window.showInfo) {
      window.showInfo(`Deleted ${result.deleted}/${result.total} files.${result.errors?.length ? " Some deletions failed." : ""}`);
    }
    await refreshAssistantFileList();
  } catch (err) {
    console.error("Failed to delete all assistant files:", err);
    if (window.showError) window.showError(`Failed to delete all: ${err.message}`);
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}

// Export for use in other modules and debugging
window.filesManager = {
  init: initFilesManager,
  refresh: refreshAssistantFileList,
};
