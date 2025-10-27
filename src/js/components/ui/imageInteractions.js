function downloadImageFromUrl(url, filename) {
  fetch(url)
    .then(response => response.blob())
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = filename;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(blobUrl);
    })
    .catch((error) => console.error('Error downloading image:', error));
}

window.downloadImage = function(url, filename) {
  if (url.startsWith('data:')) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    return;
  }

  downloadImageFromUrl(url, filename);
};

window.setupImageInteractions = function(messageElement) {
  if (!messageElement) {
    return;
  }

  const images = messageElement.querySelectorAll('.message-content img');
  if (!images.length) {
    return;
  }

  const downloadIconSvg = window.icon('download', { width: 16, height: 16 });

  images.forEach((img, index) => {
    if (img.parentNode.classList.contains('image-container')) {
      return;
    }

    const container = document.createElement('div');
    container.className = 'image-container';
    img.parentNode.insertBefore(container, img);
    container.appendChild(img);

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'image-download-btn';
    downloadBtn.innerHTML = downloadIconSvg;
    downloadBtn.setAttribute('aria-label', 'Download image');
    downloadBtn.title = 'Download image';
    container.appendChild(downloadBtn);

    downloadBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const filename = img.dataset.filename || `image-${Date.now()}-${index + 1}.png`;
      window.downloadImage(img.src, filename);
    });
  });

  images.forEach((img) => {
    img.addEventListener('click', () => {
      if (window.isSlideshowOpen) {
        return;
      }

      window.isSlideshowOpen = true;
      const allImagesData = window.gatherAllConversationImages(img);
      window.createImageSlideshow(allImagesData.images, allImagesData.clickedIndex);
    });
  });
};

window.createImageSlideshow = function(images, startIndex, isGalleryMode = false) {
  if (!images || !images.length) {
    return;
  }

  const existingSlideshow = document.querySelector('.gallery-slideshow');
  if (existingSlideshow) {
    document.body.removeChild(existingSlideshow);
  }

  let currentIndex = startIndex || 0;
  const isMobile = typeof window.isMobileDevice === 'function' ? window.isMobileDevice() : false;

  const slideshow = document.createElement('div');
  slideshow.className = 'gallery-slideshow';
  if (isMobile) {
    slideshow.classList.add('mobile-slideshow');
  }

  const slideshowContainer = document.createElement('div');
  slideshowContainer.className = 'gallery-slideshow-container';

  const img = document.createElement('img');
  img.className = 'gallery-slideshow-image';
  slideshowContainer.appendChild(img);

  const prevBtn = document.createElement('button');
  prevBtn.className = 'gallery-slideshow-nav gallery-slideshow-prev';
  prevBtn.innerHTML = '&#10094;';
  prevBtn.title = 'Previous image';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'gallery-slideshow-nav gallery-slideshow-next';
  nextBtn.innerHTML = '&#10095;';
  nextBtn.title = 'Next image';

  slideshowContainer.appendChild(prevBtn);
  slideshowContainer.appendChild(nextBtn);

  const controlsBar = document.createElement('div');
  controlsBar.className = 'gallery-slideshow-top-controls';

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'slideshow-icon-btn';
  downloadBtn.id = 'slideshow-download';
  downloadBtn.title = 'Download this image';
  downloadBtn.setAttribute('aria-label', 'Download this image');
  downloadBtn.innerHTML = window.icon('download', { width: 24, height: 24 });

  const closeBtn = document.createElement('button');
  closeBtn.className = 'slideshow-icon-btn';
  closeBtn.id = 'slideshow-close';
  closeBtn.title = 'Close image viewer';
  closeBtn.setAttribute('aria-label', 'Close image viewer');
  closeBtn.innerHTML = window.icon('x', { width: 24, height: 24 });

  if (isGalleryMode) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'slideshow-icon-btn';
    deleteBtn.id = 'slideshow-delete';
    deleteBtn.title = 'Delete this image permanently';
    deleteBtn.setAttribute('aria-label', 'Delete this image permanently');
    deleteBtn.innerHTML = window.icon('trash', { width: 24, height: 24 });
    controlsBar.appendChild(deleteBtn);

    deleteBtn.addEventListener('click', () => {
      const image = window.galleryImages[currentIndex];
      if (!confirm('Delete this image?')) {
        return;
      }

      window.deleteImageFromDb?.(image.filename)
        .then(() => {
          window.galleryImages.splice(currentIndex, 1);

          const galleryItem = document.querySelector(`.gallery-item[data-filename="${image.filename}"]`);
          if (galleryItem) {
            galleryItem.remove();
          }

          const galleryCount = document.getElementById('gallery-count');
          if (galleryCount) {
            const currentCount = parseInt(galleryCount.textContent, 10);
            galleryCount.textContent = currentCount - 1;
          }

          if (!window.galleryImages.length) {
            closeSlideshow();
            const galleryGrid = document.getElementById('gallery-grid');
            if (galleryGrid) {
              galleryGrid.innerHTML = '<div class="gallery-empty">No images found in gallery</div>';
            }
          } else {
            showSlide(Math.min(currentIndex, window.galleryImages.length - 1));
          }
        })
        .catch((error) => {
          console.error('Error deleting image:', error);
          alert('Failed to delete the image. Please try again.');
        });
    });
  }

  controlsBar.appendChild(downloadBtn);
  controlsBar.appendChild(closeBtn);

  const infoPanel = document.createElement('div');
  infoPanel.className = 'gallery-slideshow-info';

  slideshowContainer.appendChild(controlsBar);
  slideshow.appendChild(slideshowContainer);
  slideshow.appendChild(infoPanel);
  document.body.appendChild(slideshow);

  window.isSlideshowOpen = true;

  const showSlide = (index) => {
    if (index < 0) {
      index = images.length - 1;
    }
    if (index >= images.length) {
      index = 0;
    }

    currentIndex = index;

    let imageUrl;
    let prompt;
    let timestamp;
    let filename;

    if (isGalleryMode) {
      const image = images[currentIndex];
      imageUrl = image.data;
      prompt = image.prompt || 'No prompt data';
      timestamp = image.timestamp;
      filename = image.filename;
    } else {
      const imgElement = images[currentIndex];
      imageUrl = imgElement.src;
      prompt = imgElement.dataset.prompt || imgElement.alt || 'No prompt available';
      timestamp = imgElement.dataset.timestamp || null;
      filename = imgElement.dataset.filename || null;
    }

    img.src = imageUrl;

    const date = timestamp
      ? `${new Date(timestamp).toLocaleDateString()} ${new Date(timestamp).toLocaleTimeString()}`
      : 'Unknown date';

    const isUploaded = Boolean(filename && filename.startsWith('upload-'));
    const displayPrompt = isUploaded ? 'User uploaded image - no prompt available' : prompt;

    const formattedPrompt = displayPrompt
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');

    infoPanel.innerHTML = `
      <h3>Image Details <span class="gallery-slideshow-counter">${currentIndex + 1} / ${images.length}</span></h3>
      <p><strong>${isUploaded ? 'Type:' : 'Prompt:'}</strong><br><span class="prompt-text ${isUploaded ? 'uploaded-info' : ''}">${formattedPrompt}</span></p>
      <p><strong>Date:</strong> ${date}</p>
      <p><strong>Filename:</strong> ${filename}</p>
    `;
  };

  showSlide(currentIndex);

  prevBtn.addEventListener('click', () => showSlide(currentIndex - 1));
  nextBtn.addEventListener('click', () => showSlide(currentIndex + 1));

  const handleKeydown = (event) => {
    if (event.key === 'ArrowLeft') {
      showSlide(currentIndex - 1);
    } else if (event.key === 'ArrowRight') {
      showSlide(currentIndex + 1);
    } else if (event.key === 'Escape') {
      closeSlideshow();
    }
  };

  document.addEventListener('keydown', handleKeydown);

  slideshow.addEventListener('click', (event) => {
    if (event.target === slideshow) {
      closeSlideshow();
    }
  });

  closeBtn.addEventListener('click', closeSlideshow);

  if (isMobile) {
    let touchStartX = 0;
    let touchEndX = 0;

    slideshowContainer.addEventListener('touchstart', (event) => {
      touchStartX = event.changedTouches[0].screenX;
    }, { passive: true });

    slideshowContainer.addEventListener('touchend', (event) => {
      touchEndX = event.changedTouches[0].screenX;
      handleSwipe();
    }, { passive: true });

    const handleSwipe = () => {
      const swipeDistance = touchEndX - touchStartX;
      const minSwipeDistance = window.innerWidth * 0.2;

      if (swipeDistance > minSwipeDistance) {
        showSlide(currentIndex - 1);
      } else if (swipeDistance < -minSwipeDistance) {
        showSlide(currentIndex + 1);
      }
    };

    img.addEventListener('click', (event) => {
      event.stopPropagation();
      controlsBar.style.opacity = controlsBar.style.opacity === '0' ? '1' : '0';
      prevBtn.style.opacity = prevBtn.style.opacity === '0' ? '1' : '0';
      nextBtn.style.opacity = nextBtn.style.opacity === '0' ? '1' : '0';
      infoPanel.style.opacity = infoPanel.style.opacity === '0' ? '1' : '0';
    });
  }

  downloadBtn.addEventListener('click', () => {
    if (isGalleryMode) {
      const image = images[currentIndex];
      window.downloadGalleryImage?.(image.data, image.filename);
    } else {
      const imgElement = images[currentIndex];
      const filename = imgElement.dataset.filename || `image-${Date.now()}.png`;
      window.downloadImage(imgElement.src, filename);
    }
  });

  const closeSlideshow = () => {
    document.removeEventListener('keydown', handleKeydown);
    if (slideshow.parentNode) {
      document.body.removeChild(slideshow);
    }

    setTimeout(() => {
      window.isSlideshowOpen = false;
    }, 50);
  };
};

window.gatherAllConversationImages = function(clickedImg) {
  const allMessages = Array.from(document.querySelectorAll('.message'));
  const allImages = [];
  let clickedImageIndex = -1;

  allMessages.forEach((message) => {
    const messageImages = Array.from(message.querySelectorAll('.message-content img'));
    messageImages.forEach((img) => {
      allImages.push(img);
      if (img === clickedImg) {
        clickedImageIndex = allImages.length - 1;
      }
    });
  });

  return {
    images: allImages,
    clickedIndex: clickedImageIndex >= 0 ? clickedImageIndex : 0,
  };
};

