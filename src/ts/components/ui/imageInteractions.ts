import { state } from "../../init/state.ts";
import { icon } from "../../utils/icons.ts";
import { deleteImageFromDb } from "../../utils/imageStorage.ts";
import { isMobileDevice } from "../../utils/mobileHandling.ts";
import { detectMediaType, downloadMediaSource } from "../../services/mediaTools.ts";

function elementMediaType(element) {
  const explicit = element?.dataset?.mediaType;
  if (explicit === "video" || explicit === "image") {
    return explicit;
  }
  return element?.tagName?.toLowerCase() === "video" ? "video" : "image";
}

function buildViewerMediaElement(item) {
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

function normalizeViewerItem(source, isGalleryMode) {
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

export function setupImageInteractions(messageElement) {
  if (!messageElement) {
    return;
  }

  const mediaElements = messageElement.querySelectorAll(".message-content img, .message-content video") as any;
  if (!mediaElements.length) {
    return;
  }

  const downloadIconSvg = icon("download", { width: 16, height: 16 });

  mediaElements.forEach((media, index) => {
    if (media.parentNode?.classList?.contains("image-container")) {
      return;
    }

    const mediaType = elementMediaType(media);
    const container = document.createElement("div");
    container.className = "image-container";
    media.parentNode.insertBefore(container, media);
    container.appendChild(media);

    if (mediaType === "video") {
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
      const source = mediaType === "video" ? (media.currentSrc || media.src) : media.src;
      downloadMediaSource(source, filename)
        .catch(error => console.error(`Error downloading ${mediaType}:`, error));
    });
  });

  const images = messageElement.querySelectorAll(".message-content img") as any;
  images.forEach((img) => {
    if (img.dataset.viewerBound === "true") {
      return;
    }
    img.dataset.viewerBound = "true";
    img.addEventListener("click", () => {
      if (state.isSlideshowOpen) {
        return;
      }

      state.isSlideshowOpen = true;
      const allMediaData = gatherAllConversationMedia(img);
      createImageSlideshow(allMediaData.images, allMediaData.clickedIndex);
    });
  });

  const videos = messageElement.querySelectorAll(".message-content video") as any;
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

      state.isSlideshowOpen = true;
      const allMediaData = gatherAllConversationMedia(video);
      createImageSlideshow(allMediaData.images, allMediaData.clickedIndex);
    });
  });
}

export function createImageSlideshow(images, startIndex, isGalleryMode = false) {
  if (!images || !images.length) {
    return;
  }

  const existingSlideshow = document.querySelector(".gallery-slideshow") as any;
  if (existingSlideshow) {
    document.body.removeChild(existingSlideshow);
  }

  let currentIndex = startIndex || 0;
  const isMobile =isMobileDevice();

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

  const downloadBtn = document.createElement("button");
  downloadBtn.className = "slideshow-icon-btn";
  downloadBtn.id = "slideshow-download";
  downloadBtn.title = "Download this media";
  downloadBtn.setAttribute("aria-label", "Download this media");
  downloadBtn.innerHTML = icon("download", { width: 24, height: 24 });

  const closeBtn = document.createElement("button");
  closeBtn.className = "slideshow-icon-btn";
  closeBtn.id = "slideshow-close";
  closeBtn.title = "Close media viewer";
  closeBtn.setAttribute("aria-label", "Close media viewer");
  closeBtn.innerHTML = icon("x", { width: 24, height: 24 });

  if (isGalleryMode) {
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "slideshow-icon-btn";
    deleteBtn.id = "slideshow-delete";
    deleteBtn.title = "Delete this media permanently";
    deleteBtn.setAttribute("aria-label", "Delete this media permanently");
    deleteBtn.innerHTML = icon("trash", { width: 24, height: 24 });
    controlsBar.appendChild(deleteBtn);

    deleteBtn.addEventListener("click", () => {
      const image = state.galleryImages[currentIndex];
      const mediaType = detectMediaType(image);
      if (!confirm(`Delete this ${mediaType}?`)) {
        return;
      }

      deleteImageFromDb?.(image.filename)
        .then(() => {
          state.galleryImages.splice(currentIndex, 1);

          const galleryItem = document.querySelector(`.gallery-item[data-filename="${image.filename}"]`) as any;
          if (galleryItem) {
            galleryItem.remove();
          }

          const galleryCount = document.getElementById("gallery-count") as any;
          if (galleryCount) {
            const currentCount = parseInt(galleryCount.textContent, 10);
            galleryCount.textContent = Math.max(0, currentCount - 1);
          }

          if (!state.galleryImages.length) {
            closeSlideshow();
            const galleryGrid = document.getElementById("gallery-grid") as any;
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
    if (slideshow.parentNode) {
      document.body.removeChild(slideshow);
    }

    setTimeout(() => {
      state.isSlideshowOpen = false;
    }, 50);
  };

  const showSlide = (index) => {
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

    const formattedPrompt = String(displayPrompt || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");

    infoPanel.innerHTML = `
      <h3>Media Details <span class="gallery-slideshow-counter">${currentIndex + 1} / ${images.length}</span></h3>
      <p><strong>${item.uploaded ? "Type:" : "Prompt:"}</strong><br><span class="prompt-text ${item.uploaded ? "uploaded-info" : ""}">${formattedPrompt || "No prompt available"}</span></p>
      <p><strong>Media Type:</strong> ${item.mediaType}</p>
      <p><strong>Date:</strong> ${date}</p>
      <p><strong>Filename:</strong> ${item.filename || "Unknown"}</p>
    `;
  };

  showSlide(currentIndex);

  prevBtn.addEventListener("click", () => showSlide(currentIndex - 1));
  nextBtn.addEventListener("click", () => showSlide(currentIndex + 1));

  const handleKeydown = (event) => {
    if (event.key === "ArrowLeft") {
      showSlide(currentIndex - 1);
    } else if (event.key === "ArrowRight") {
      showSlide(currentIndex + 1);
    } else if (event.key === "Escape") {
      closeSlideshow();
    }
  };

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
    downloadMediaSource(item.url, item.filename || `${item.mediaType}-${Date.now()}`)
      .catch(error => console.error(`Failed to download ${item.mediaType}:`, error));
  });
}

function gatherAllConversationMedia(clickedElement) {
  const allMessages = Array.from(document.querySelectorAll(".message"));
  const allMedia = [];
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
