/**
 * Image and media interactions.
 *
 * @remarks
 * Provides the full-screen slideshow viewer and the per-image actions
 * (download, delete) used in chat messages and the gallery.
 */

import { state } from "../../init/state.ts";
import { icon } from "../../utils/icons.ts";
import { deleteImageFromDb } from "../../utils/storage/imageStorage.ts";
import { isMobileDevice } from "../../utils/dom/mobileHandling.ts";
import { escapeHtml } from "../../utils/sanitize.ts";
import { detectMediaType, downloadMediaSource } from "../../services/mediaTools.ts";

let activeSlideshowKeydown: ((event: KeyboardEvent) => void) | null = null;

/** Normalized media descriptor consumed by the slideshow viewer. */
interface ViewerItem {
  mediaType: string;
  url: string;
  prompt: string;
  timestamp: string | number | null;
  filename: string | null;
  uploaded: boolean;
}

/**
 * Determines a media element's type from its `data-media-type` attribute,
 * falling back to its tag name (`<video>` → `"video"`, otherwise `"image"`).
 */
function elementMediaType(element: HTMLElement): "video" | "image" {
  const explicit = element?.dataset?.mediaType;
  if (explicit === "video" || explicit === "image") {
    return explicit;
  }
  return element?.tagName?.toLowerCase() === "video" ? "video" : "image";
}

/**
 * Builds a slideshow top-bar icon button (download/close/delete) with the shared
 * `slideshow-icon-btn` styling. The `title` doubles as the `aria-label`.
 */
function createSlideshowIconButton(id: string, title: string, iconName: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "slideshow-icon-btn";
  button.id = id;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.innerHTML = icon(iconName, { width: 24, height: 24 });
  return button;
}

/** Builds the `<video>` or `<img>` element shown in the slideshow viewer for an item. */
function buildViewerMediaElement(item: ViewerItem) {
  const mediaType = item.mediaType;
  if (mediaType === "video") {
    const video = document.createElement("video");
    video.className = "gallery-slideshow-media gallery-slideshow-video";
    video.src = item.url;
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    return video;
  }

  const img = document.createElement("img");
  img.className = "gallery-slideshow-media gallery-slideshow-image";
  img.src = item.url;
  img.alt = item.prompt || "Image";
  return img;
}

/**
 * Normalizes a slideshow source into a {@link ViewerItem}, reading from a stored
 * gallery record (`isGalleryMode`) or from a clicked DOM media element's
 * `src`/`dataset`. Uploads are flagged by the `upload-` filename prefix.
 *
 * @param source - A gallery image record or a DOM `<img>`/`<video>` element.
 * @param isGalleryMode - Whether `source` is a stored gallery record.
 */
function normalizeViewerItem(source: any, isGalleryMode: boolean): ViewerItem {
  if (isGalleryMode) {
    const mediaType = detectMediaType(source);
    return {
      mediaType,
      url: source.data,
      prompt: source.prompt || (mediaType === "video" ? "Generated video" : "No prompt available"),
      timestamp: source.timestamp || null,
      filename: source.filename || null,
      uploaded: Boolean(source.filename && source.filename.startsWith("upload-")),
    };
  }

  const mediaType = elementMediaType(source);
  return {
    mediaType,
    url: mediaType === "video" ? source.currentSrc || source.src : source.src,
    prompt: source.dataset.prompt || source.alt || (mediaType === "video" ? "Generated video" : "No prompt available"),
    timestamp: source.dataset.timestamp || null,
    filename: source.dataset.filename || null,
    uploaded: Boolean(source.dataset.filename && source.dataset.filename.startsWith("upload-")),
  };
}

/**
 * Attaches click handlers to images/videos within a message so they open the
 * conversation-wide media slideshow at the clicked item.
 */
export function setupImageInteractions(messageElement: HTMLElement | null) {
  if (!messageElement) {
    return;
  }

  const mediaElements = messageElement.querySelectorAll<HTMLImageElement | HTMLVideoElement>(".message-content img, .message-content video");
  if (!mediaElements.length) {
    return;
  }

  const downloadIconSvg = icon("download", { width: 16, height: 16 });

  mediaElements.forEach((media, index) => {
    if (media.parentElement?.classList.contains("image-container")) {
      return;
    }

    const mediaType = elementMediaType(media);
    const parent = media.parentNode;
    if (!parent) {
      return;
    }
    const container = document.createElement("div");
    container.className = "image-container";
    parent.insertBefore(container, media);
    container.appendChild(media);

    if (media instanceof HTMLVideoElement) {
      media.controls = true;
      media.playsInline = true;
      media.preload = media.preload || "metadata";
    }

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "image-download-btn";
    downloadBtn.innerHTML = downloadIconSvg;
    downloadBtn.setAttribute("aria-label", `Download ${mediaType}`);
    downloadBtn.title = `Download ${mediaType}`;
    container.appendChild(downloadBtn);

    downloadBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const fallbackName = mediaType === "video"
        ? `video-${Date.now()}-${index + 1}.mp4`
        : `image-${Date.now()}-${index + 1}.png`;
      const filename = media.dataset.filename || fallbackName;
      const source = media instanceof HTMLVideoElement ? (media.currentSrc || media.src) : media.src;
      downloadMediaSource(source, filename)
        .catch(error => console.error(`Error downloading ${mediaType}:`, error));
    });
  });

  const images = messageElement.querySelectorAll<HTMLImageElement>(".message-content img");
  images.forEach((img) => {
    if (img.dataset.viewerBound === "true") {
      return;
    }
    img.dataset.viewerBound = "true";
    img.addEventListener("click", () => {
      if (state.isSlideshowOpen) {
        return;
      }

      const allMediaData = gatherAllConversationMedia(img);
      createImageSlideshow(allMediaData.images, allMediaData.clickedIndex);
    });
  });

  const videos = messageElement.querySelectorAll<HTMLVideoElement>(".message-content video");
  videos.forEach((video) => {
    if (video.dataset.viewerBound === "true") {
      return;
    }
    video.dataset.viewerBound = "true";

    const container = video.closest(".image-container");
    if (!container) {
      return;
    }

    const expandBtn = document.createElement("button");
    expandBtn.className = "video-expand-btn";
    expandBtn.innerHTML = icon("maximize", { width: 16, height: 16 });
    expandBtn.setAttribute("aria-label", "Open in viewer");
    expandBtn.title = "Open in viewer";
    container.appendChild(expandBtn);

    expandBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.isSlideshowOpen) {
        return;
      }

      const allMediaData = gatherAllConversationMedia(video);
      createImageSlideshow(allMediaData.images, allMediaData.clickedIndex);
    });
  });
}

/**
 * Opens a fullscreen slideshow overlay for `images`, starting at `startIndex`.
 *
 * @param images - The media records to page through; a no-op when empty.
 * @param startIndex - Index of the item to show first.
 * @param isGalleryMode - When `true`, enables gallery-specific controls.
 */
export function createImageSlideshow(images: any[], startIndex: number, isGalleryMode = false) {
  if (!images || !images.length) {
    return;
  }

  const existingSlideshow = document.querySelector(".gallery-slideshow");
  if (existingSlideshow) {
    if (activeSlideshowKeydown) {
      document.removeEventListener("keydown", activeSlideshowKeydown);
      activeSlideshowKeydown = null;
    }
    document.body.removeChild(existingSlideshow);
  }

  let currentIndex = startIndex || 0;
  const isMobile = isMobileDevice();

  const slideshow = document.createElement("div");
  slideshow.className = "gallery-slideshow";
  if (isMobile) {
    slideshow.classList.add("mobile-slideshow");
  }

  const slideshowContainer = document.createElement("div");
  slideshowContainer.className = "gallery-slideshow-container";

  const mediaHost = document.createElement("div");
  mediaHost.className = "gallery-slideshow-media-host";
  slideshowContainer.appendChild(mediaHost);

  const prevBtn = document.createElement("button");
  prevBtn.className = "gallery-slideshow-nav gallery-slideshow-prev";
  prevBtn.innerHTML = "&#10094;";
  prevBtn.title = "Previous media";

  const nextBtn = document.createElement("button");
  nextBtn.className = "gallery-slideshow-nav gallery-slideshow-next";
  nextBtn.innerHTML = "&#10095;";
  nextBtn.title = "Next media";

  slideshowContainer.appendChild(prevBtn);
  slideshowContainer.appendChild(nextBtn);

  const controlsBar = document.createElement("div");
  controlsBar.className = "gallery-slideshow-top-controls";

  const downloadBtn = createSlideshowIconButton("slideshow-download", "Download this media", "download");

  const closeBtn = createSlideshowIconButton("slideshow-close", "Close media viewer", "x");

  if (isGalleryMode) {
    const deleteBtn = createSlideshowIconButton("slideshow-delete", "Delete this media permanently", "trash");
    controlsBar.appendChild(deleteBtn);

    deleteBtn.addEventListener("click", () => {
      const image = state.galleryImages[currentIndex];
      const mediaType = detectMediaType(image);
      if (!confirm(`Delete this ${mediaType}?`)) {
        return;
      }
      if (!image.filename) {
        return;
      }

      deleteImageFromDb?.(image.filename)
        .then(() => {
          state.galleryImages.splice(currentIndex, 1);

          const galleryItem = document.querySelector(`.gallery-item[data-filename="${image.filename}"]`);
          if (galleryItem) {
            galleryItem.remove();
          }

          const galleryCount = document.getElementById("gallery-count");
          if (galleryCount) {
            const currentCount = parseInt(galleryCount.textContent || "0", 10);
            galleryCount.textContent = String(Math.max(0, currentCount - 1));
          }

          const activeTabCountId = state.currentGalleryTab === "uploaded" ? "uploaded-count" : "generated-count";
          const activeTabCount = document.getElementById(activeTabCountId);
          if (activeTabCount) {
            const tabCount = parseInt(activeTabCount.textContent || "0", 10);
            activeTabCount.textContent = String(Math.max(0, tabCount - 1));
          }

          if (!state.galleryImages.length) {
            closeSlideshow();
            const galleryGrid = document.getElementById("gallery-grid");
            if (galleryGrid) {
              galleryGrid.innerHTML = "<div class=\"gallery-empty\">No media found in gallery</div>";
            }
          } else {
            showSlide(Math.min(currentIndex, state.galleryImages.length - 1));
          }
        })
        .catch((error) => {
          console.error("Error deleting media:", error);
          alert("Failed to delete the media item. Please try again.");
        });
    });
  }

  controlsBar.appendChild(downloadBtn);
  controlsBar.appendChild(closeBtn);

  const infoPanel = document.createElement("div");
  infoPanel.className = "gallery-slideshow-info";

  slideshowContainer.appendChild(controlsBar);
  slideshow.appendChild(slideshowContainer);
  slideshow.appendChild(infoPanel);
  document.body.appendChild(slideshow);

  state.isSlideshowOpen = true;

  const closeSlideshow = () => {
    document.removeEventListener("keydown", handleKeydown);
    if (activeSlideshowKeydown === handleKeydown) {
      activeSlideshowKeydown = null;
    }
    if (slideshow.parentNode) {
      document.body.removeChild(slideshow);
    }

    setTimeout(() => {
      state.isSlideshowOpen = false;
    }, 50);
  };

  const showSlide = (index: number) => {
    if (index < 0) {
      index = images.length - 1;
    }
    if (index >= images.length) {
      index = 0;
    }

    currentIndex = index;

    const item = normalizeViewerItem(images[currentIndex], isGalleryMode);
    mediaHost.innerHTML = "";
    mediaHost.appendChild(buildViewerMediaElement(item));

    const date = item.timestamp
      ? `${new Date(item.timestamp).toLocaleDateString()} ${new Date(item.timestamp).toLocaleTimeString()}`
      : "Unknown date";

    const displayPrompt = item.uploaded
      ? `User uploaded ${item.mediaType} - no prompt available`
      : item.prompt;

    const formattedPrompt = escapeHtml(displayPrompt || "");

    infoPanel.innerHTML = `
      <h3>Media Details <span class="gallery-slideshow-counter">${currentIndex + 1} / ${images.length}</span></h3>
      <p><strong>${item.uploaded ? "Type:" : "Prompt:"}</strong><br><span class="prompt-text ${item.uploaded ? "uploaded-info" : ""}">${formattedPrompt || "No prompt available"}</span></p>
      <p><strong>Media Type:</strong> ${escapeHtml(item.mediaType)}</p>
      <p><strong>Date:</strong> ${date}</p>
      <p><strong>Filename:</strong> ${escapeHtml(item.filename || "Unknown")}</p>
    `;
  };

  showSlide(currentIndex);

  prevBtn.addEventListener("click", () => showSlide(currentIndex - 1));
  nextBtn.addEventListener("click", () => showSlide(currentIndex + 1));

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") {
      showSlide(currentIndex - 1);
    } else if (event.key === "ArrowRight") {
      showSlide(currentIndex + 1);
    } else if (event.key === "Escape") {
      closeSlideshow();
    }
  };

  activeSlideshowKeydown = handleKeydown;
  document.addEventListener("keydown", handleKeydown);

  slideshow.addEventListener("click", (event) => {
    if (event.target === slideshow) {
      closeSlideshow();
    }
  });

  closeBtn.addEventListener("click", closeSlideshow);

  if (isMobile) {
    let touchStartX = 0;
    let touchEndX = 0;

    slideshowContainer.addEventListener("touchstart", (event) => {
      touchStartX = event.changedTouches[0].screenX;
    }, { passive: true });

    slideshowContainer.addEventListener("touchend", (event) => {
      touchEndX = event.changedTouches[0].screenX;
      const swipeDistance = touchEndX - touchStartX;
      const minSwipeDistance = window.innerWidth * 0.2;

      if (swipeDistance > minSwipeDistance) {
        showSlide(currentIndex - 1);
      } else if (swipeDistance < -minSwipeDistance) {
        showSlide(currentIndex + 1);
      }
    }, { passive: true });
  }

  downloadBtn.addEventListener("click", () => {
    const item = normalizeViewerItem(images[currentIndex], isGalleryMode);
    const fallbackName = item.mediaType === "video"
      ? `video-${Date.now()}.mp4`
      : `image-${Date.now()}.png`;
    downloadMediaSource(item.url, item.filename || fallbackName)
      .catch(error => console.error(`Failed to download ${item.mediaType}:`, error));
  });
}

/**
 * Collects every image/video across all chat messages in document order, so the
 * slideshow can page through the whole conversation.
 *
 * @param clickedElement - The media element that was clicked.
 * @returns `{ images, clickedIndex }` - the ordered media list and the clicked
 *   item's index (0 if not found).
 */
function gatherAllConversationMedia(clickedElement: Element) {
  const allMessages = Array.from(document.querySelectorAll(".message"));
  const allMedia: Element[] = [];
  let clickedIndex = -1;

  allMessages.forEach((message) => {
    const mediaElements = Array.from(message.querySelectorAll(".message-content img, .message-content video"));
    mediaElements.forEach((el) => {
      allMedia.push(el);
      if (el === clickedElement) {
        clickedIndex = allMedia.length - 1;
      }
    });
  });

  return {
    images: allMedia,
    clickedIndex: clickedIndex >= 0 ? clickedIndex : 0,
  };
}
