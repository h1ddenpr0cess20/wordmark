/**
 * Lazy loading utilities for optional modules to reduce initial page weight.
 */

export const lazyModulesLoaded = {};

let galleryModule = null;

export function loadGalleryModule() {
  if (galleryModule) {
    return Promise.resolve(galleryModule);
  }
  return import("../components/gallery.js").then((mod) => {
    galleryModule = mod;
    lazyModulesLoaded.gallery = true;
    return mod;
  });
}

export function loadHistoryModule() {
  if (lazyModulesLoaded.history) {
    return Promise.resolve();
  }
  return import("../services/history.js").then(() => {
    lazyModulesLoaded.history = true;
  });
}

export function loadLocationModule() {
  if (lazyModulesLoaded.location) {
    return Promise.resolve();
  }
  return import("../services/location.js").then(() => {
    lazyModulesLoaded.location = true;
  });
}

export function loadMobileHandling() {
  if (lazyModulesLoaded.mobileHandling) {
    return Promise.resolve();
  }
  return import("./mobileHandling.js").then(() => {
    lazyModulesLoaded.mobileHandling = true;
  });
}

export function loadMarkedLibrary() {
  // Marked is bundled and imported in main.js; just ensure it's configured.
  if (typeof window.initializeMarked === "function") {
    window.initializeMarked();
  }
  return Promise.resolve();
}

/**
 * Load vector store module and initialize related components
 */
export function loadVectorStoreModule() {
  if (lazyModulesLoaded.vectorStore) {
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
            lazyModulesLoaded.vectorStore = true;
          }).catch(fe => {
            console.warn("Files manager initialization failed:", fe);
            lazyModulesLoaded.vectorStore = true;
            return Promise.resolve();
          });
        }).catch(fe => {
          console.warn("Files manager import failed:", fe);
          lazyModulesLoaded.vectorStore = true;
          return Promise.resolve();
        });
      });
    });
  }).catch(e => {
    console.error("Vector store module loading failed:", e);
    return Promise.reject(e);
  });
}
