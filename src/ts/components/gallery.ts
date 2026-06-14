/**
 * Media gallery.
 *
 * @remarks
 * Displays and manages generated or uploaded images and videos from IndexedDB.
 */

import { state } from "../init/state.ts";
import { icon } from "../utils/icons.ts";
import { deleteImageFromDb } from "../utils/imageStorage.ts";
import { detectMediaType, downloadMediaSource } from "../services/mediaTools.ts";
import { getAllImagesFromDb } from "./galleryData.ts";
import { createImageSlideshow } from "./ui/imageInteractions.ts";
import type { GeneratedImage } from "../../types/common.ts";
import { updatePanelOpenState } from "../init/eventListeners/settingsPanel.ts";

state.isSlideshowOpen = false;

/**
 * Initialize the gallery functionality
 */
const initGallery = function() {
  if (state.galleryInitialized) {
    return;
  }

  const galleryButton = document.getElementById("gallery-button");
  const closeGallery = document.querySelector<HTMLElement>(".close-gallery");
  const galleryPanel = document.getElementById("gallery-panel");
  const bulkDeleteBtn = document.getElementById("bulk-delete-images");
  const refreshGalleryBtn = document.getElementById("refresh-gallery");

  if (!galleryButton || !galleryPanel || !closeGallery) {
    console.error("Gallery elements not found in the DOM");
    return;
  }

  state.galleryInitialized = true;

  state.galleryImagesLoaded = false;
  galleryButton.addEventListener("click", () => {
    const isExpanded = galleryButton.getAttribute("aria-expanded") === "true";
    galleryButton.setAttribute("aria-expanded", String(!isExpanded));
    galleryPanel.setAttribute("aria-hidden", String(isExpanded));

    if (!isExpanded) {
      galleryPanel.removeAttribute("inert");
      showGalleryPlaceholders();

      setTimeout(() => {
        loadGalleryImages();
      }, 50);
    } else {
      galleryPanel.setAttribute("inert", "true");
    }

    updatePanelOpenState();
  });
  closeGallery.addEventListener("click", () => {
    galleryPanel.setAttribute("aria-hidden", "true");
    galleryPanel.setAttribute("inert", "true");
    galleryButton.setAttribute("aria-expanded", "false");
    galleryButton.focus();
    updatePanelOpenState();
  });

  if (refreshGalleryBtn) {
    refreshGalleryBtn.addEventListener("click", () => {
      loadGalleryImages();
    });
  }

  if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener("click", () => {
      bulkDeleteSelectedImages();
    });
  }

  initializeGalleryTabs();

};

/**
 * Show placeholder grid while media items are loading
 */
const showGalleryPlaceholders = function() {
  const galleryGrid = document.getElementById("gallery-grid");
  if (!galleryGrid) {
    return;
  }

  galleryGrid.innerHTML = "";
  const count = state.galleryImages && state.galleryImages.length > 0 ?
    state.galleryImages.length : 8;

  const galleryCount = document.getElementById("gallery-count");
  if (galleryCount && state.galleryImages) {
    galleryCount.textContent = String(state.galleryImages.length || "...");
  } else if (galleryCount) {
    galleryCount.textContent = "...";
  }

  for (let i = 0; i < count; i++) {
    const placeholder = document.createElement("div");
    placeholder.className = "gallery-item gallery-placeholder";
    placeholder.innerHTML = `
            <div class="gallery-item-image-container placeholder-pulse"></div>
            <div class="gallery-item-footer">
                <div class="truncated-prompt placeholder-pulse" style="width: 60px; height: 12px;"></div>
                <div class="gallery-actions">
                    <div class="placeholder-pulse" style="width: 20px; height: 20px; border-radius: 4px;"></div>
                    <div class="placeholder-pulse" style="width: 20px; height: 20px; border-radius: 4px;"></div>
                </div>
            </div>
        `;
    galleryGrid.appendChild(placeholder);
  }
};

/**
 * Load media from IndexedDB and display them in the gallery
 */
const loadGalleryImages = async function() {
  const galleryGrid = document.getElementById("gallery-grid");
  if (!galleryGrid) {
    return;
  }

  try {
    const images = await getAllImagesFromDb();

    const currentTab = state.currentGalleryTab || "generated";
    let visibleImages: GeneratedImage[];

    if (currentTab === "uploaded") {
      visibleImages = images.filter(img => img.filename && img.filename.startsWith("upload-"));
    } else {
      visibleImages = images.filter(img => !img.filename || !img.filename.startsWith("upload-"));
    }

    const generatedImages = images.filter(img => !img.filename || !img.filename.startsWith("upload-"));
    const uploadedImages = images.filter(img => img.filename && img.filename.startsWith("upload-"));

    const generatedCount = document.getElementById("generated-count");
    const uploadedCount = document.getElementById("uploaded-count");
    const galleryCount = document.getElementById("gallery-count");

    if (generatedCount) {
      generatedCount.textContent = String(generatedImages.length);
    }
    if (uploadedCount) {
      uploadedCount.textContent = String(uploadedImages.length);
    }
    if (galleryCount) {
      galleryCount.textContent = String(visibleImages.length);
    }

    if (!visibleImages || visibleImages.length === 0) {
      let emptyMessage;
      if (currentTab === "uploaded") {
        emptyMessage = "No uploaded media found.<br><small>Upload images using the attach button in the chat.</small>";
      } else {
        emptyMessage = "No generated media found.<br><small>Generate images or videos by asking the AI to create them for you.</small>";
      }
      galleryGrid.innerHTML = `<div class="gallery-empty">${emptyMessage}</div>`;
      return;
    }

    visibleImages.sort((a, b) => {
      const dateA = a.timestamp ? new Date(a.timestamp) : new Date(0);
      const dateB = b.timestamp ? new Date(b.timestamp) : new Date(0);
      return dateB.getTime() - dateA.getTime();
    });

    state.galleryImages = visibleImages;
    state.galleryImagesLoaded = true;

    galleryGrid.innerHTML = "";

    const batchSize = 10;

    const processBatch = (startIndex: number) => {
      const endIndex = Math.min(startIndex + batchSize, visibleImages.length);

      for (let i = startIndex; i < endIndex; i++) {
        const image = visibleImages[i];
        const mediaType = detectMediaType(image);

        const galleryItem = document.createElement("div");
        galleryItem.className = "gallery-item";
        galleryItem.dataset.filename = image.filename;
        galleryItem.dataset.index = String(i);
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
              deleteImageAndUpdateGallery(image.filename);
            }
          });
        }

        const downloadBtn = actions.querySelector<HTMLElement>(".gallery-download-btn");
        if (downloadBtn) {
          downloadBtn.addEventListener("click", (e: Event) => {
            e.stopPropagation();
            downloadGalleryImage(image.data || "", image.filename);
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
          startGallerySlideshow(i);
        });

        galleryItem.appendChild(selectionBar);
        galleryItem.appendChild(imageContainer);
        galleryItem.appendChild(itemFooter);

        galleryGrid.appendChild(galleryItem);
      }

      if (endIndex < visibleImages.length) {
        setTimeout(() => processBatch(endIndex), 0);
      }
    };

    processBatch(0);

  } catch (error) {
    console.error("Error loading gallery images:", error);
    galleryGrid.innerHTML = "<div class=\"gallery-error\">Error loading media from storage</div>";
  }
};

/**
 * Gets all media records from IndexedDB.
 *
 * @returns A promise resolving to an array of media objects.
 */
/**
 * Deletes a media item from IndexedDB and removes it from the gallery.
 *
 * @param filename - The filename of the media item to delete.
 */
const deleteImageAndUpdateGallery = async function(filename: string) {
  try {
    await deleteImageFromDb(filename);

    const galleryItem = document.querySelector<HTMLElement>(`.gallery-item[data-filename="${filename}"]`);
    if (galleryItem) {
      galleryItem.remove();

      const galleryCount = document.getElementById("gallery-count");
      if (galleryCount) {
        const currentCount = parseInt(galleryCount.textContent || "0", 10);
        galleryCount.textContent = String(currentCount - 1);
      }

      const galleryGrid = document.getElementById("gallery-grid");
      if (galleryGrid && galleryGrid.children.length === 0) {
        galleryGrid.innerHTML = "<div class=\"gallery-empty\">No media found in gallery</div>";
      }
    }
  } catch (error) {
    console.error("Error deleting media:", error);
    alert("Failed to delete the media item. Please try again.");
  }
};

/**
 * Downloads a gallery media item.
 *
 * @param imageData - Media data or display URL.
 * @param filename - The filename to save as.
 */
const downloadGalleryImage = function(imageData: string | Blob, filename?: string) {
  downloadMediaSource(imageData, filename)
    .catch(error => {
      console.error("Failed to download gallery media:", error);
      alert("Failed to download the selected media item.");
    });
};

/**
 * Starts the gallery slideshow from a specific index.
 *
 * @param startIndex - The index to start from.
 */
const startGallerySlideshow = function(startIndex: number) {
  if (!state.galleryImages || state.galleryImages.length === 0) {
    console.error("No media available for viewer");
    return;
  }

  createImageSlideshow(state.galleryImages, startIndex, true);
};

/**
 * Bulk delete selected media items
 */
const bulkDeleteSelectedImages = async function() {
  const selectedCheckboxes = document.querySelectorAll<HTMLInputElement>(".gallery-select-checkbox:checked");

  if (selectedCheckboxes.length === 0) {
    alert("No media selected");
    return;
  }

  if (!confirm(`Delete ${selectedCheckboxes.length} selected media item(s)?`)) {
    return;
  }

  const galleryGrid = document.getElementById("gallery-grid");
  const loadingIndicator = document.createElement("div");
  loadingIndicator.className = "bulk-delete-indicator";
  loadingIndicator.textContent = `Deleting ${selectedCheckboxes.length} media item(s)...`;

  if (galleryGrid) {
    galleryGrid.classList.add("deleting-images");
    galleryGrid.appendChild(loadingIndicator);
  }

  try {
    const deletePromises: Promise<unknown>[] = [];

    selectedCheckboxes.forEach((checkbox) => {
      const galleryItem = checkbox.closest<HTMLElement>(".gallery-item");
      if (galleryItem) {
        const filename = galleryItem.dataset.filename;
        if (filename) {
          deletePromises.push(deleteImageFromDb(filename));
        }
      }
    });

    await Promise.all(deletePromises);

    loadGalleryImages();
  } catch (error) {
    console.error("Error bulk deleting media:", error);
    alert("Some media items could not be deleted. Please try again.");

    loadGalleryImages();
  }
};

/**
 * Initialize gallery tabs functionality
 */
function initializeGalleryTabs() {
  state.currentGalleryTab = "generated";

  const generatedTab = document.getElementById("gallery-tab-generated");
  const uploadedTab = document.getElementById("gallery-tab-uploaded");

  if (!generatedTab || !uploadedTab) {
    console.warn("Gallery tab elements not found");
    return;
  }

  generatedTab.addEventListener("click", () => {
    switchGalleryTab("generated");
  });

  uploadedTab.addEventListener("click", () => {
    switchGalleryTab("uploaded");
  });
}

/**
 * Switches between gallery tabs.
 *
 * @param tabName - Either `generated` or `uploaded`.
 */
const switchGalleryTab = function(tabName: string) {
  state.currentGalleryTab = tabName;

  const tabs = document.querySelectorAll<HTMLElement>(".gallery-tab");
  tabs.forEach((tab) => {
    if (tab.dataset.tab === tabName) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  const checkboxes = document.querySelectorAll<HTMLInputElement>(".gallery-select-checkbox:checked");
  checkboxes.forEach((checkbox) => {
    checkbox.checked = false;
  });

  loadGalleryImages();
};

export { initGallery };
