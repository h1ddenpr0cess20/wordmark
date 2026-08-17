/**
 * Pending-attachment preview rendering.
 *
 * @remarks
 * Renders the chip previews for queued image uploads and documents (including
 * expandable directory groups) into the input wrapper, and removes individual
 * items from the pending-attachment state. Chips share their markup with the
 * sent-message chips via {@link ./attachmentChips.ts} so an attachment looks the
 * same before and after sending. The file ingestion/upload flow lives in
 * {@link ./attachments.ts}, which calls {@link showPendingUploadPreviews} after
 * mutating the pending state.
 */

import { state } from "../../init/state.ts";
import { icon } from "../../utils/icons.ts";
import { escapeHtml } from "../../utils/sanitize.ts";
import { formatFileSize } from "../../utils/utils.ts";
import { chipContentMarkup, formatDirectoryMeta } from "./attachmentChips.ts";

/** Builds a chip's remove button, wired to `onRemove`. */
function createRemoveButton(label: string, onRemove: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chip-remove";
  button.innerHTML = icon("x", { width: 12, height: 12 });
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove();
  });
  return button;
}

/** Builds the chip preview for a pending image upload. */
function createImageChip(dataUrl: string, name: string, meta: string, onRemove: () => void) {
  const chip = document.createElement("div");
  chip.className = "attachment-chip attachment-chip-image";

  const escapedName = escapeHtml(name);
  chip.innerHTML = [
    `<span class="chip-name" title="${escapedName}">${escapedName}</span>`,
    meta ? `<span class="chip-meta">${escapeHtml(meta)}</span>` : "",
  ].join("");

  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = "";
  img.className = "chip-thumb";
  chip.insertBefore(img, chip.firstChild);

  chip.appendChild(createRemoveButton("Remove image", onRemove));
  return chip;
}

/** Builds the expandable chip preview for a pending directory upload. */
function createDirectoryChip(
  name: string,
  files: { name: string; size: number; relativePath?: string }[],
  listId: string,
  onRemove: () => void,
) {
  const chip = document.createElement("div");
  chip.className = "attachment-chip attachment-chip-directory";

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  const fileList = document.createElement("div");
  fileList.className = "chip-files";
  fileList.id = listId;
  fileList.hidden = true;
  fileList.innerHTML = files.map((file) => {
    const displayName = escapeHtml(file.relativePath || file.name);
    return [
      "<div class=\"chip-file-item\">",
      "<span class=\"chip-file-icon\" aria-hidden=\"true\"></span>",
      `<span class="chip-file-name" title="${displayName}">${displayName}</span>`,
      `<span class="chip-file-size">${escapeHtml(formatFileSize(file.size))}</span>`,
      "</div>",
    ].join("");
  }).join("");

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "chip-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", listId);
  toggle.title = "Show directory contents";
  toggle.innerHTML = `${chipContentMarkup({
    name,
    meta: formatDirectoryMeta(files.length, totalSize),
    isDirectory: true,
  })}<span class="chip-chevron" aria-hidden="true"></span>`;
  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", expanded ? "false" : "true");
    toggle.title = expanded ? "Show directory contents" : "Hide directory contents";
    fileList.hidden = expanded;
    chip.classList.toggle("expanded", !expanded);
  });

  const row = document.createElement("div");
  row.className = "chip-row";
  row.appendChild(toggle);
  row.appendChild(createRemoveButton("Remove directory", onRemove));

  chip.appendChild(row);
  chip.appendChild(fileList);
  return chip;
}

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
    const size = up.file && typeof up.file.size === "number" ? up.file.size : 0;
    preview.appendChild(createImageChip(
      up.dataUrl || "",
      (up.file && up.file.name) || "Image",
      size ? formatFileSize(size) : "",
      () => removeUploadPreview(index),
    ));
  });

  state.pendingDocuments.forEach((doc, index) => {
    if (doc.isDirectory) {
      preview.appendChild(createDirectoryChip(
        doc.directoryName || "",
        doc.files || [],
        `directory-files-${index}`,
        () => removeDocumentPreview(index),
      ));
      return;
    }

    const chip = document.createElement("div");
    chip.className = "attachment-chip attachment-chip-document";
    chip.innerHTML = chipContentMarkup({
      name: doc.name || "",
      meta: formatFileSize(doc.size || 0),
    });
    chip.appendChild(createRemoveButton("Remove document", () => removeDocumentPreview(index)));
    preview.appendChild(chip);
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
