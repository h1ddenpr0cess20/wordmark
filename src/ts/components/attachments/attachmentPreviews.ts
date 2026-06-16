/**
 * Pending-attachment preview rendering.
 *
 * @remarks
 * Renders the thumbnail/chip previews for queued image uploads and documents
 * (including expandable directory groups) into the input wrapper, and removes
 * individual items from the pending-attachment state. The file ingestion/upload
 * flow lives in {@link ./attachments.ts}, which calls
 * {@link showPendingUploadPreviews} after mutating the pending state.
 */

import { state } from "../../init/state.ts";
import { escapeHtml } from "../../utils/sanitize.ts";
import { formatFileSize } from "../../utils/utils.ts";

/**
 * Re-renders the pending image/document/directory previews inside the input
 * wrapper, wiring up each item's remove button. No-op when the wrapper is absent.
 */
export function showPendingUploadPreviews() {
  const wrapper = document.querySelector<HTMLElement>(".input-wrapper");
  if (!wrapper) {
    return;
  }
  let previewEl = wrapper.querySelector<HTMLElement>(".upload-previews");
  if (!previewEl) {
    previewEl = document.createElement("div");
    previewEl.className = "upload-previews";
    wrapper.insertBefore(previewEl, wrapper.firstChild);
  }
  const preview = previewEl;
  preview.innerHTML = "";

  state.pendingUploads.forEach((up, index) => {
    const container = document.createElement("div");
    container.className = "upload-preview-container";

    const img = document.createElement("img");
    img.src = up.dataUrl || "";
    img.alt = "Upload preview";
    img.className = "upload-preview-img";

    const removeBtn = document.createElement("button");
    removeBtn.className = "upload-preview-remove";
    removeBtn.innerHTML = "×";
    removeBtn.title = "Remove image";
    removeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      removeUploadPreview(index);
    });

    container.appendChild(img);
    container.appendChild(removeBtn);
    preview.appendChild(container);
  });

  state.pendingDocuments.forEach((doc, index) => {
    if (doc.isDirectory) {
      const container = document.createElement("div");
      container.className = "upload-preview-container directory-preview";

      const directoryFiles = doc.files || [];
      const totalSize = directoryFiles.reduce((sum, f) => sum + f.size, 0);

      const docInfo = document.createElement("div");
      docInfo.className = "document-info";
      docInfo.innerHTML = `
        <span class="doc-icon">📁</span>
        <span class="doc-name">${escapeHtml(doc.directoryName)}</span>
        <span class="doc-size">${directoryFiles.length} file${directoryFiles.length !== 1 ? "s" : ""} (${formatFileSize(totalSize)})</span>
      `;

      const removeBtn = document.createElement("button");
      removeBtn.className = "upload-preview-remove";
      removeBtn.innerHTML = "×";
      removeBtn.title = "Remove directory";
      removeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        removeDocumentPreview(index);
      });

      const fileList = document.createElement("div");
      fileList.className = "directory-file-list";
      fileList.style.display = "none";

      directoryFiles.forEach(file => {
        const fileItem = document.createElement("div");
        fileItem.className = "directory-file-item";
        const displayName = file.relativePath || file.name;
        fileItem.innerHTML = `
          <span class="file-item-icon">📄</span>
          <span class="file-item-name">${escapeHtml(displayName)}</span>
          <span class="file-item-size">${formatFileSize(file.size)}</span>
        `;
        fileList.appendChild(fileItem);
      });

      docInfo.style.cursor = "pointer";
      docInfo.addEventListener("click", (e) => {
        if (e.target === removeBtn || removeBtn.contains(e.target as Node)) return;
        const isExpanded = fileList.style.display !== "none";
        fileList.style.display = isExpanded ? "none" : "block";
        container.classList.toggle("expanded", !isExpanded);
      });

      container.appendChild(docInfo);
      container.appendChild(removeBtn);
      container.appendChild(fileList);
      preview.appendChild(container);
    } else {
      const container = document.createElement("div");
      container.className = "upload-preview-container document-preview";

      const docInfo = document.createElement("div");
      docInfo.className = "document-info";
      docInfo.innerHTML = `
        <span class="doc-icon">📄</span>
        <span class="doc-name">${escapeHtml(doc.name)}</span>
        <span class="doc-size">${formatFileSize(doc.size || 0)}</span>
      `;

      const removeBtn = document.createElement("button");
      removeBtn.className = "upload-preview-remove";
      removeBtn.innerHTML = "×";
      removeBtn.title = "Remove document";
      removeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        removeDocumentPreview(index);
      });

      container.appendChild(docInfo);
      container.appendChild(removeBtn);
      preview.appendChild(container);
    }
  });
}

/** Removes the pending image at `index` and re-renders the previews. */
function removeUploadPreview(index: number) {
  if (index >= 0 && index < state.pendingUploads.length) {
    state.pendingUploads.splice(index, 1);
    showPendingUploadPreviews();
  }
}

/** Removes the pending document/directory at `index` and re-renders the previews. */
function removeDocumentPreview(index: number) {
  if (index >= 0 && index < state.pendingDocuments.length) {
    state.pendingDocuments.splice(index, 1);
    showPendingUploadPreviews();
  }
}
