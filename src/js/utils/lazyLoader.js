/**
 * Lazy loading utilities for optional modules to reduce initial page weight.
 */

window.lazyModulesLoaded = window.lazyModulesLoaded || {};

function resolveUrl(relativePath) {
  try {
    return new URL(relativePath, import.meta.url).href;
  } catch {
    // Fallback to root-absolute paths as before
    return relativePath.startsWith("/") ? relativePath : `/src/js/${relativePath}`;
  }
}

function loadScriptOnce(src, flag) {
  return new Promise((resolve, reject) => {
    if (window.lazyModulesLoaded[flag]) {
      return resolve();
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => {
      window.lazyModulesLoaded[flag] = true;
      resolve();
    };
    script.onerror = err => reject(err);
    document.head.appendChild(script);
  });
}

window.loadGalleryModule = function() {
  if (window.lazyModulesLoaded.gallery) {
    return Promise.resolve();
  }
  const url = new URL("../components/gallery.js", import.meta.url).href;
  return import(url).then((mod) => {
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
  const url = new URL("../services/history.js", import.meta.url).href;
  return import(url).then(() => {
    window.lazyModulesLoaded.history = true;
  });
};

window.loadTtsModule = function() {
  if (window.lazyModulesLoaded.tts) {
    return Promise.resolve();
  }
  const url = new URL("../services/tts.js", import.meta.url).href;
  return import(url).then(() => {
    window.lazyModulesLoaded.tts = true;
  });
};

window.loadLocationModule = function() {
  if (window.lazyModulesLoaded.location) {
    return Promise.resolve();
  }
  const url = new URL("../services/location.js", import.meta.url).href;
  return import(url).then(() => {
    window.lazyModulesLoaded.location = true;
  });
};

window.isMobileDevice = function() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         window.innerWidth <= 768;
};

window.loadMobileHandling = function() {
  return loadScriptOnce(resolveUrl("./mobileHandling.js"), "mobileHandling");
};

window.loadMarkedLibrary = function() {
  return loadScriptOnce(resolveUrl("../lib/marked.min.js"), "marked").then(() => {
    if (typeof window.initializeMarked === "function") {
      window.initializeMarked();
    }
  });
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
