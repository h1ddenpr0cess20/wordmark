/**
 * Media Gallery functionality for the chatbot application.
 * Displays and manages generated or uploaded images and videos from IndexedDB.
 */

// -----------------------------------------------------
// Gallery functionality
// -----------------------------------------------------

// Global flag to track if slideshow is open
window.isSlideshowOpen = false;

/**
 * Initialize the gallery functionality
 */
window.initGallery = function() {
  if (window.__GALLERY_INITIALIZED__) {
    return;
  }

  // Add event listeners for gallery controls
  const galleryButton = document.getElementById("gallery-button");
  const closeGallery = document.querySelector(".close-gallery");
  const galleryPanel = document.getElementById("gallery-panel");
  const bulkDeleteBtn = document.getElementById("bulk-delete-images");
  const refreshGalleryBtn = document.getElementById("refresh-gallery");

  if (!galleryButton || !galleryPanel || !closeGallery) {
    console.error("Gallery elements not found in the DOM");
    return;
  }

  window.__GALLERY_INITIALIZED__ = true;

  // Keep track of whether images have been loaded
  window.galleryImagesLoaded = false;
  // Toggle gallery visibility when the gallery button is clicked
  galleryButton.addEventListener("click", () => {
    const isExpanded = galleryButton.getAttribute("aria-expanded") === "true";
    galleryButton.setAttribute("aria-expanded", !isExpanded);
    galleryPanel.setAttribute("aria-hidden", isExpanded);

    if (!isExpanded) {
      galleryPanel.removeAttribute("inert"); // Ensure panel is not inert when opened
      window.showGalleryPlaceholders();

      // Then load the actual images asynchronously
      setTimeout(() => {
        window.loadGalleryImages();
      }, 50); // Small delay to ensure animation completes first
    } else {
      galleryPanel.setAttribute("inert", "true"); // Make panel inert when closed
    }

    if (typeof window.updatePanelOpenState === "function") {
      window.updatePanelOpenState();
    }
  });
  // Close gallery when the close button is clicked
  closeGallery.addEventListener("click", () => {
    galleryPanel.setAttribute("aria-hidden", "true");
    galleryPanel.setAttribute("inert", "true"); // Make panel inert when closed
    galleryButton.setAttribute("aria-expanded", "false");
    galleryButton.focus(); // Explicitly move focus
    if (typeof window.updatePanelOpenState === "function") {
      window.updatePanelOpenState();
    }
  });

  // Refresh gallery when the refresh button is clicked
  if (refreshGalleryBtn) {
    refreshGalleryBtn.addEventListener("click", () => {
      window.loadGalleryImages();
    });
  }

  // Handle bulk delete
  if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener("click", () => {
      window.bulkDeleteSelectedImages();
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
window.showGalleryPlaceholders = function() {
  const galleryGrid = document.getElementById("gallery-grid");
  if (!galleryGrid) {
    return;
  }

  // Create 8 placeholder items (or adjust based on typical gallery size)
  galleryGrid.innerHTML = "";
  const count = window.galleryImages && window.galleryImages.length > 0 ?
    window.galleryImages.length : 8;

  // Show count from last load
  const galleryCount = document.getElementById("gallery-count");
  if (galleryCount && window.galleryImages) {
    galleryCount.textContent = window.galleryImages.length || "...";
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
window.loadGalleryImages = async function() {
  const galleryGrid = document.getElementById("gallery-grid");
  if (!galleryGrid) {
    return;
  }

  try {
    // Get all media records from IndexedDB
    const images = await window.getAllImagesFromDb();

    // Filter images based on current tab
    const currentTab = window.currentGalleryTab || "generated";
    let visibleImages;

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
      generatedCount.textContent = generatedImages.length;
    }
    if (uploadedCount) {
      uploadedCount.textContent = uploadedImages.length;
    }
    if (galleryCount) {
      galleryCount.textContent = visibleImages.length;
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
      return dateB - dateA;
    });

    // Store images globally for slideshow access
    window.galleryImages = visibleImages;
    window.galleryImagesLoaded = true;

    // Clear placeholders
    galleryGrid.innerHTML = "";

    // Process images in batches to not block the UI
    const batchSize = 10;

    function processBatch(startIndex) {
      const endIndex = Math.min(startIndex + batchSize, visibleImages.length);

      for (let i = startIndex; i < endIndex; i++) {
        const image = visibleImages[i];
        const mediaType = typeof window.detectMediaType === "function"
          ? window.detectMediaType(image)
          : ((image.mimeType || "").startsWith("video/") ? "video" : "image");

        // Create gallery item
        const galleryItem = document.createElement("div");
        galleryItem.className = "gallery-item";
        galleryItem.dataset.filename = image.filename;
        galleryItem.dataset.index = i;
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
          badge.innerHTML = window.icon("play", { width: 18, height: 18 });
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
                    <button class="gallery-download-btn" title="Download ${mediaType}">${window.icon("download", { width: 16, height: 16 })}</button>
                    <button class="gallery-delete-btn" title="Delete ${mediaType}">${window.icon("trash", { width: 16, height: 16 })}</button>
                `;

        // Add event listeners to buttons
        const deleteBtn = actions.querySelector(".gallery-delete-btn");
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm(`Delete this ${mediaType}?`)) {
            window.deleteImageAndUpdateGallery(image.filename);
          }
        });

        const downloadBtn = actions.querySelector(".gallery-download-btn");
        downloadBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          window.downloadGalleryImage(image.data, image.filename);
        });

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
        const checkbox = selectContainer.querySelector(".gallery-select-checkbox");
        if (checkbox) {
          checkbox.addEventListener("click", (e) => {
            e.stopPropagation();
          });

          // Also prevent propagation from the label
          selectContainer.addEventListener("click", (e) => {
            e.stopPropagation();
          });
        }

        // Add click event to show the viewer starting with this media item
        galleryItem.addEventListener("click", () => {
          window.startGallerySlideshow(i);
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
    }

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
window.getAllImagesFromDb = function() {
  return new Promise((resolve, reject) => {
    if (!window.imageDb) {
      window.initImageDb()
        .then(() => window.getAllImagesFromDb())
        .then(resolve)
        .catch(reject);
      return;
    }
    const images = [];
    const storeName = (typeof window !== "undefined" && window.IMAGE_STORE_NAME) ? window.IMAGE_STORE_NAME : "images";
    const transaction = window.imageDb.transaction([storeName], "readonly");
    const store = transaction.objectStore(storeName);

    const request = store.openCursor();

    request.onerror = (event) => {
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const value = cursor.value;
        images.push({
          ...value,
          data: window.getMediaDisplayUrl?.(value.data, value.filename) || value.data,
          mediaType: typeof window.detectMediaType === "function"
            ? window.detectMediaType(value)
            : ((value.mimeType || "").startsWith("video/") ? "video" : "image"),
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
window.deleteImageAndUpdateGallery = async function(filename) {
  try {
    await window.deleteImageFromDb(filename);

    // Remove the media element from the gallery
    const galleryItem = document.querySelector(`.gallery-item[data-filename="${filename}"]`);
    if (galleryItem) {
      galleryItem.remove();

      // Update gallery count
      const galleryCount = document.getElementById("gallery-count");
      if (galleryCount) {
        const currentCount = parseInt(galleryCount.textContent);
        galleryCount.textContent = currentCount - 1;
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
window.downloadGalleryImage = function(imageData, filename) {
  window.downloadMediaSource?.(imageData, filename)
    .catch(error => {
      console.error("Failed to download gallery media:", error);
      alert("Failed to download the selected media item.");
    });
};

/**
 * Start the gallery slideshow from a specific index
 * @param {number} startIndex - The index to start from
 */
window.startGallerySlideshow = function(startIndex) {
  if (!window.galleryImages || window.galleryImages.length === 0) {
    console.error("No media available for viewer");
    return;
  }

  // Use the shared slideshow function, passing gallery mode as true
  window.createImageSlideshow(window.galleryImages, startIndex, true);
};

/**
 * Show a full-size view of a media item
 * @param {string} imageUrl - The media display URL
 * @param {Object} imageData - The media metadata
 */
window.showFullSizeImage = function(imageUrl, imageData) {
  // Find the media index in gallery items
  const index = window.galleryImages.findIndex(img => img.filename === imageData.filename);
  if (index !== -1) {
    window.startGallerySlideshow(index);
  } else {
    // If media is not found in gallery, add it temporarily and show it.
    const tempImage = {
      data: imageUrl,
      filename: imageData.filename,
      prompt: imageData.prompt,
      timestamp: imageData.timestamp,
      mediaType: imageData.mediaType || (typeof window.detectMediaType === "function"
        ? window.detectMediaType(imageData)
        : "image"),
      mimeType: imageData.mimeType || "",
    };

    if (!window.galleryImages) {
      window.galleryImages = [];
    }

    window.galleryImages.push(tempImage);
    window.startGallerySlideshow(window.galleryImages.length - 1);
  }
};

/**
 * Bulk delete selected media items
 */
window.bulkDeleteSelectedImages = async function() {
  const selectedCheckboxes = document.querySelectorAll(".gallery-select-checkbox:checked");

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
    const deletePromises = [];

    selectedCheckboxes.forEach(checkbox => {
      const galleryItem = checkbox.closest(".gallery-item");
      if (galleryItem) {
        const filename = galleryItem.dataset.filename;
        if (filename) {
          deletePromises.push(window.deleteImageFromDb(filename));
        }
      }
    });

    await Promise.all(deletePromises);

    // Reload the gallery
    window.loadGalleryImages();
  } catch (error) {
    console.error("Error bulk deleting media:", error);
    alert("Some media items could not be deleted. Please try again.");

    // Reload the gallery
    window.loadGalleryImages();
  }
};

/**
 * Initialize gallery tabs functionality
 */
function initializeGalleryTabs() {
  // Set the current active tab (default to 'generated')
  window.currentGalleryTab = "generated";

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
window.switchGalleryTab = function(tabName) {
  window.currentGalleryTab = tabName;

  // Update tab active states
  const tabs = document.querySelectorAll(".gallery-tab");
  tabs.forEach(tab => {
    if (tab.dataset.tab === tabName) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  // Clear any selected checkboxes when switching tabs
  const checkboxes = document.querySelectorAll(".gallery-select-checkbox:checked");
  checkboxes.forEach(checkbox => {
    checkbox.checked = false;
  });

  // Reload gallery with the new filter
  window.loadGalleryImages();
};
