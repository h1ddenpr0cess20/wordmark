import { state } from "../init/state.ts";
import { icon } from "../utils/icons.ts";
/**
 * Media Gallery functionality for the chatbot application.
 * Displays and manages generated or uploaded images and videos from IndexedDB.
 */

import {
  initImageDb,
  deleteImageFromDb,
  getImageDb,
  IMAGE_STORE_NAME,
} from "../utils/imageStorage.ts";
import { detectMediaType, getMediaDisplayUrl, downloadMediaSource } from "../services/mediaTools.ts";
import { createImageSlideshow } from "./ui/imageInteractions.ts";
import { updatePanelOpenState } from "../init/eventListeners/settingsPanel.ts";

// -----------------------------------------------------
// Gallery functionality
// -----------------------------------------------------

// Global flag to track if slideshow is open
state.isSlideshowOpen = false;

/**
 * Initialize the gallery functionality
 */
const initGallery = function() {
  if (state.galleryInitialized) {
    return;
  }

  // Add event listeners for gallery controls
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

  // Keep track of whether images have been loaded
  state.galleryImagesLoaded = false;
  // Toggle gallery visibility when the gallery button is clicked
  galleryButton.addEventListener("click", () => {
    const isExpanded = galleryButton.getAttribute("aria-expanded") === "true";
    galleryButton.setAttribute("aria-expanded", String(!isExpanded));
    galleryPanel.setAttribute("aria-hidden", String(isExpanded));

    if (!isExpanded) {
      galleryPanel.removeAttribute("inert"); // Ensure panel is not inert when opened
      showGalleryPlaceholders();

      // Then load the actual images asynchronously
      setTimeout(() => {
        loadGalleryImages();
      }, 50); // Small delay to ensure animation completes first
    } else {
      galleryPanel.setAttribute("inert", "true"); // Make panel inert when closed
    }

    updatePanelOpenState();
  });
  // Close gallery when the close button is clicked
  closeGallery.addEventListener("click", () => {
    galleryPanel.setAttribute("aria-hidden", "true");
    galleryPanel.setAttribute("inert", "true"); // Make panel inert when closed
    galleryButton.setAttribute("aria-expanded", "false");
    galleryButton.focus(); // Explicitly move focus
    updatePanelOpenState();
  });

  // Refresh gallery when the refresh button is clicked
  if (refreshGalleryBtn) {
    refreshGalleryBtn.addEventListener("click", () => {
      loadGalleryImages();
    });
  }

  // Handle bulk delete
  if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener("click", () => {
      bulkDeleteSelectedImages();
    });
  }

  // Initialize gallery tabs
  initializeGalleryTabs();

  // Note: Outside click handling for all panels (gallery, settings, history)
  // is consolidated in eventListeners.js to avoid conflicts
};

/**
 * Show placeholder grid while media items are loading
 */
const showGalleryPlaceholders = function() {
  const galleryGrid = document.getElementById("gallery-grid");
  if (!galleryGrid) {
    return;
  }

  // Create 8 placeholder items (or adjust based on typical gallery size)
  galleryGrid.innerHTML = "";
  const count = state.galleryImages && state.galleryImages.length > 0 ?
    state.galleryImages.length : 8;

  // Show count from last load
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
    // Get all media records from IndexedDB
    const images = await getAllImagesFromDb();

    // Filter images based on current tab
    const currentTab = state.currentGalleryTab || "generated";
    let visibleImages: any[];

    if (currentTab === "uploaded") {
      // Show only uploaded images
      visibleImages = images.filter(img => img.filename && img.filename.startsWith("upload-"));
    } else {
      // Show only generated images (not uploaded)
      visibleImages = images.filter(img => !img.filename || !img.filename.startsWith("upload-"));
    }

    // Update individual tab counts
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

    // Sort images by timestamp, newest first
    visibleImages.sort((a, b) => {
      const dateA = a.timestamp ? new Date(a.timestamp) : new Date(0);
      const dateB = b.timestamp ? new Date(b.timestamp) : new Date(0);
      return dateB.getTime() - dateA.getTime();
    });

    // Store images globally for slideshow access
    state.galleryImages = visibleImages;
    state.galleryImagesLoaded = true;

    // Clear placeholders
    galleryGrid.innerHTML = "";

    // Process images in batches to not block the UI
    const batchSize = 10;

    const processBatch = (startIndex: number) => {
      const endIndex = Math.min(startIndex + batchSize, visibleImages.length);

      for (let i = startIndex; i < endIndex; i++) {
        const image = visibleImages[i];
        const mediaType = detectMediaType(image);

        // Create gallery item
        const galleryItem = document.createElement("div");
        galleryItem.className = "gallery-item";
        galleryItem.dataset.filename = image.filename;
        galleryItem.dataset.index = String(i);
        galleryItem.dataset.mediaType = mediaType;

        // Create selection bar at the top
        const selectionBar = document.createElement("div");
        selectionBar.className = "gallery-selection-bar";

        // Create image container
        const imageContainer = document.createElement("div");
        imageContainer.className = "gallery-item-image-container";

        if (mediaType === "video") {
          const video = document.createElement("video");
          video.src = image.data;
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
          img.src = image.data;
          img.alt = image.prompt || "Generated image";
          img.title = image.prompt || "";
          imageContainer.appendChild(img);
        }

        // Create checkbox for selection
        const selectContainer = document.createElement("label");
        selectContainer.className = "gallery-select-container";
        selectContainer.innerHTML = `
                    <input type="checkbox" class="gallery-select-checkbox">
                    <span>Select</span>
                `;
        selectionBar.appendChild(selectContainer);

        // Create footer with actions
        const itemFooter = document.createElement("div");
        itemFooter.className = "gallery-item-footer";

        // Create actions container
        const actions = document.createElement("div");
        actions.className = "gallery-actions";
        actions.innerHTML = `
                    <button class="gallery-download-btn" title="Download ${mediaType}">${icon("download", { width: 16, height: 16 })}</button>
                    <button class="gallery-delete-btn" title="Delete ${mediaType}">${icon("trash", { width: 16, height: 16 })}</button>
                `;

        // Add event listeners to buttons
        const deleteBtn = actions.querySelector<HTMLElement>(".gallery-delete-btn");
        if (deleteBtn) {
          deleteBtn.addEventListener("click", (e: Event) => {
            e.stopPropagation();
            if (confirm(`Delete this ${mediaType}?`)) {
              deleteImageAndUpdateGallery(image.filename);
            }
          });
        }

        const downloadBtn = actions.querySelector<HTMLElement>(".gallery-download-btn");
        if (downloadBtn) {
          downloadBtn.addEventListener("click", (e: Event) => {
            e.stopPropagation();
            downloadGalleryImage(image.data, image.filename);
          });
        }

        // Add prompt truncated text (first few words) or "uploaded" label
        const truncatedPrompt = document.createElement("div");
        truncatedPrompt.className = "truncated-prompt";

        // Check if this is uploaded media
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

        // Stop propagation for checkbox to prevent triggering slideshow
        const checkbox = selectContainer.querySelector<HTMLElement>(".gallery-select-checkbox");
        if (checkbox) {
          checkbox.addEventListener("click", (e: Event) => {
            e.stopPropagation();
          });

          // Also prevent propagation from the label
          selectContainer.addEventListener("click", (e: Event) => {
            e.stopPropagation();
          });
        }

        // Add click event to show the viewer starting with this media item
        galleryItem.addEventListener("click", () => {
          startGallerySlideshow(i);
        });

        // Append all elements to gallery item in the correct order
        galleryItem.appendChild(selectionBar);
        galleryItem.appendChild(imageContainer);
        galleryItem.appendChild(itemFooter);

        // Add the complete item to the grid
        galleryGrid.appendChild(galleryItem);
      }

      // Process next batch if needed
      if (endIndex < visibleImages.length) {
        setTimeout(() => processBatch(endIndex), 0);
      }
    };

    // Start processing the first batch
    processBatch(0);

  } catch (error) {
    console.error("Error loading gallery images:", error);
    galleryGrid.innerHTML = "<div class=\"gallery-error\">Error loading media from storage</div>";
  }
};

/**
 * Get all media records from IndexedDB
 * @returns {Promise<Array>} Promise resolving to an array of media objects
 */
const getAllImagesFromDb = function(): Promise<any[]> {
  return new Promise((resolve, reject) => {
    if (!getImageDb()) {
      initImageDb()
        .then(() => getAllImagesFromDb())
        .then(resolve)
        .catch(reject);
      return;
    }
    const images: any[] = [];
    const storeName = IMAGE_STORE_NAME || "images";
    const transaction = getImageDb()!.transaction([storeName], "readonly");
    const store = transaction.objectStore(storeName);

    const request = store.openCursor();

    request.onerror = (event) => {
      reject((event.target as IDBRequest).error);
    };

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        const value = cursor.value;
        images.push({
          ...value,
          data: getMediaDisplayUrl(value.data, value.filename) || value.data,
          mediaType: detectMediaType(value),
        });
        cursor.continue();
      } else {
        resolve(images);
      }
    };
  });
};

/**
 * Delete a media item from IndexedDB and remove it from the gallery
 * @param {string} filename - The filename of the media item to delete
 */
const deleteImageAndUpdateGallery = async function(filename: string) {
  try {
    await deleteImageFromDb(filename);

    // Remove the media element from the gallery
    const galleryItem = document.querySelector<HTMLElement>(`.gallery-item[data-filename="${filename}"]`);
    if (galleryItem) {
      galleryItem.remove();

      // Update gallery count
      const galleryCount = document.getElementById("gallery-count");
      if (galleryCount) {
        const currentCount = parseInt(galleryCount.textContent || "0", 10);
        galleryCount.textContent = String(currentCount - 1);
      }

      // Show empty message if no more media
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
 * Download a gallery media item
 * @param {string|Blob} imageData - Media data or display URL
 * @param {string} filename - The filename to save as
 */
const downloadGalleryImage = function(imageData: any, filename: string) {
  downloadMediaSource(imageData, filename)
    .catch(error => {
      console.error("Failed to download gallery media:", error);
      alert("Failed to download the selected media item.");
    });
};

/**
 * Start the gallery slideshow from a specific index
 * @param {number} startIndex - The index to start from
 */
const startGallerySlideshow = function(startIndex: number) {
  if (!state.galleryImages || state.galleryImages.length === 0) {
    console.error("No media available for viewer");
    return;
  }

  // Use the shared slideshow function, passing gallery mode as true
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

  // Show loading indicator
  const galleryGrid = document.getElementById("gallery-grid");
  const loadingIndicator = document.createElement("div");
  loadingIndicator.className = "bulk-delete-indicator";
  loadingIndicator.textContent = `Deleting ${selectedCheckboxes.length} media item(s)...`;

  if (galleryGrid) {
    galleryGrid.classList.add("deleting-images");
    galleryGrid.appendChild(loadingIndicator);
  }

  try {
    const deletePromises: Promise<any>[] = [];

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

    // Reload the gallery
    loadGalleryImages();
  } catch (error) {
    console.error("Error bulk deleting media:", error);
    alert("Some media items could not be deleted. Please try again.");

    // Reload the gallery
    loadGalleryImages();
  }
};

/**
 * Initialize gallery tabs functionality
 */
function initializeGalleryTabs() {
  // Set the current active tab (default to 'generated')
  state.currentGalleryTab = "generated";

  // Get tab elements
  const generatedTab = document.getElementById("gallery-tab-generated");
  const uploadedTab = document.getElementById("gallery-tab-uploaded");

  if (!generatedTab || !uploadedTab) {
    console.warn("Gallery tab elements not found");
    return;
  }

  // Add click handlers for tabs
  generatedTab.addEventListener("click", () => {
    switchGalleryTab("generated");
  });

  uploadedTab.addEventListener("click", () => {
    switchGalleryTab("uploaded");
  });
}

/**
 * Switch between gallery tabs
 * @param {string} tabName - 'generated' or 'uploaded'
 */
const switchGalleryTab = function(tabName: string) {
  state.currentGalleryTab = tabName;

  // Update tab active states
  const tabs = document.querySelectorAll<HTMLElement>(".gallery-tab");
  tabs.forEach((tab) => {
    if (tab.dataset.tab === tabName) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  // Clear any selected checkboxes when switching tabs
  const checkboxes = document.querySelectorAll<HTMLInputElement>(".gallery-select-checkbox:checked");
  checkboxes.forEach((checkbox) => {
    checkbox.checked = false;
  });

  // Reload gallery with the new filter
  loadGalleryImages();
};

export { initGallery };
