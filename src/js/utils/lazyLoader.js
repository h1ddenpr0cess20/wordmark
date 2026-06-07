/**
 * Lazy loading utilities for optional modules to reduce initial page weight.
 */

window.lazyModulesLoaded = window.lazyModulesLoaded || {};

window.loadGalleryModule = function() {
  if (window.lazyModulesLoaded.gallery) {
    return Promise.resolve();
  }
  return import("../components/gallery.js").then((mod) => {
    // If the module didn’t attach to window (when treated as ESM), then do it here if exports exist
    if (mod) {
      if (mod.initGallery && !window.initGallery) {
        window.initGallery = mod.initGallery;
      }
      if (mod.downloadGalleryImage && !window.downloadGalleryImage) {
        window.downloadGalleryImage = mod.downloadGalleryImage;
      }
      if (mod.showFullSizeImage && !window.showFullSizeImage) {
        window.showFullSizeImage = mod.showFullSizeImage;
      }
    }
    window.lazyModulesLoaded.gallery = true;
  });
};

window.loadHistoryModule = function() {
  if (window.lazyModulesLoaded.history) {
    return Promise.resolve();
  }
  return import("../services/history.js").then(() => {
    window.lazyModulesLoaded.history = true;
  });
};

window.loadTtsModule = function() {
  if (window.lazyModulesLoaded.tts) {
    return Promise.resolve();
  }
  return import("../services/tts.js").then(() => {
    window.lazyModulesLoaded.tts = true;
  });
};

window.loadLocationModule = function() {
  if (window.lazyModulesLoaded.location) {
    return Promise.resolve();
  }
  return import("../services/location.js").then(() => {
    window.lazyModulesLoaded.location = true;
  });
};

window.loadMobileHandling = function() {
  if (window.lazyModulesLoaded.mobileHandling) {
    return Promise.resolve();
  }
  return import("./mobileHandling.js").then(() => {
    window.lazyModulesLoaded.mobileHandling = true;
  });
};

window.loadMarkedLibrary = function() {
  // Marked is bundled and imported in main.js; just ensure it's configured.
  if (typeof window.initializeMarked === "function") {
    window.initializeMarked();
  }
  return Promise.resolve();
};

/**
 * Load vector store module and initialize related components
 */
window.loadVectorStoreModule = function() {
  if (window.lazyModulesLoaded.vectorStore) {
    return Promise.resolve();
  }
  return import("../services/vectorStore.js").then(({
    initializeVectorStore,
    saveVectorStoreMetadata,
    setActiveVectorStoreId,
    clearActiveVectorStore,
    getActiveVectorStoreId,
  }) => {
    // Make functions globally available
    window.saveVectorStoreMetadata = saveVectorStoreMetadata;
    window.setActiveVectorStoreId = setActiveVectorStoreId;
    window.clearActiveVectorStore = clearActiveVectorStore;
    window.getActiveVectorStoreId = getActiveVectorStoreId;

    // Initialize vector store from localStorage
    initializeVectorStore();

    return import("../components/vectorStoreManager.js").then(({ initVectorStoreManager }) => {
      return initVectorStoreManager().then(() => {
        return import("../components/filesManager.js").then(({ initFilesManager }) => {
          return initFilesManager().then(() => {
            window.lazyModulesLoaded.vectorStore = true;
          }).catch(fe => {
            console.warn("Files manager initialization failed:", fe);
            window.lazyModulesLoaded.vectorStore = true;
            return Promise.resolve();
          });
        }).catch(fe => {
          console.warn("Files manager import failed:", fe);
          window.lazyModulesLoaded.vectorStore = true;
          return Promise.resolve();
        });
      });
    });
  }).catch(e => {
    console.error("Vector store module loading failed:", e);
    return Promise.reject(e);
  });
};
