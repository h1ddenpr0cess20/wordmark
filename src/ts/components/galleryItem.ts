/**
 * Gallery item construction.
 *
 * @remarks
 * Builds a single gallery grid item (image/video thumbnail, selection control,
 * prompt label, and download/delete actions) for a stored media record. The
 * three user actions — delete, download, and open — are supplied by the caller
 * as {@link GalleryItemHandlers} callbacks so this leaf builder stays free of a
 * dependency cycle with {@link ./gallery.ts}.
 */

import { icon } from "../utils/icons.ts";
import { detectMediaType } from "../services/mediaTools.ts";
import type { GeneratedImage } from "../../types/common.ts";

/** Callbacks wiring a gallery item's buttons back to the gallery controller. */
export interface GalleryItemHandlers {
  /** Invoked (after a confirm) when the delete button is clicked. */
  onDelete: (filename: string) => void;
  /** Invoked when the download button is clicked. */
  onDownload: (imageData: string | Blob, filename?: string) => void;
  /** Invoked when the item is clicked, to open the slideshow at its index. */
  onOpen: (index: number) => void;
}

/**
 * Builds a single gallery grid item element for a media record.
 *
 * @param image - The stored media record to render.
 * @param index - The item's position in the visible gallery list.
 * @param handlers - Callbacks for the item's delete/download/open actions.
 * @returns The fully wired gallery item element.
 */
export function createGalleryItem(image: GeneratedImage, index: number, handlers: GalleryItemHandlers): HTMLElement {
  const mediaType = detectMediaType(image);

  const galleryItem = document.createElement("div");
  galleryItem.className = "gallery-item";
  galleryItem.dataset.filename = image.filename;
  galleryItem.dataset.index = String(index);
  galleryItem.dataset.mediaType = mediaType;

  const selectionBar = document.createElement("div");
  selectionBar.className = "gallery-selection-bar";

  const imageContainer = document.createElement("div");
  imageContainer.className = "gallery-item-image-container";

  if (mediaType === "video") {
    const video = document.createElement("video");
    video.src = image.data || "";
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.title = image.prompt || "";
    imageContainer.appendChild(video);

    const badge = document.createElement("div");
    badge.className = "gallery-video-badge";
    badge.innerHTML = icon("play", { width: 18, height: 18 });
    imageContainer.appendChild(badge);
  } else {
    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = image.data || "";
    img.alt = image.prompt || "Generated image";
    img.title = image.prompt || "";
    imageContainer.appendChild(img);
  }

  const selectContainer = document.createElement("label");
  selectContainer.className = "gallery-select-container";
  selectContainer.innerHTML = `
                    <input type="checkbox" class="gallery-select-checkbox">
                    <span>Select</span>
                `;
  selectionBar.appendChild(selectContainer);

  const itemFooter = document.createElement("div");
  itemFooter.className = "gallery-item-footer";

  const actions = document.createElement("div");
  actions.className = "gallery-actions";
  actions.innerHTML = `
                    <button class="gallery-download-btn" title="Download ${mediaType}">${icon("download", { width: 16, height: 16 })}</button>
                    <button class="gallery-delete-btn" title="Delete ${mediaType}">${icon("trash", { width: 16, height: 16 })}</button>
                `;

  const deleteBtn = actions.querySelector<HTMLElement>(".gallery-delete-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", (e: Event) => {
      e.stopPropagation();
      if (image.filename && confirm(`Delete this ${mediaType}?`)) {
        handlers.onDelete(image.filename);
      }
    });
  }

  const downloadBtn = actions.querySelector<HTMLElement>(".gallery-download-btn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", (e: Event) => {
      e.stopPropagation();
      handlers.onDownload(image.data || "", image.filename);
    });
  }

  const truncatedPrompt = document.createElement("div");
  truncatedPrompt.className = "truncated-prompt";

  const isUploaded = image.filename && image.filename.startsWith("upload-");

  if (isUploaded) {
    truncatedPrompt.textContent = mediaType === "video" ? "Uploaded Video" : "Uploaded Image";
    truncatedPrompt.title = mediaType === "video" ? "User uploaded video" : "User uploaded image";
    truncatedPrompt.classList.add("uploaded-label");
  } else {
    truncatedPrompt.title = image.prompt || "No prompt data";
    truncatedPrompt.textContent = image.prompt ?
      (image.prompt.length > 50 ? `${image.prompt.substring(0, 50)}...` : image.prompt) :
      (mediaType === "video" ? "Generated video" : "No prompt");
  }

  itemFooter.appendChild(truncatedPrompt);
  itemFooter.appendChild(actions);

  const checkbox = selectContainer.querySelector<HTMLElement>(".gallery-select-checkbox");
  if (checkbox) {
    checkbox.addEventListener("click", (e: Event) => {
      e.stopPropagation();
    });

    selectContainer.addEventListener("click", (e: Event) => {
      e.stopPropagation();
    });
  }

  galleryItem.addEventListener("click", () => {
    handlers.onOpen(index);
  });

  galleryItem.appendChild(selectionBar);
  galleryItem.appendChild(imageContainer);
  galleryItem.appendChild(itemFooter);

  return galleryItem;
}
