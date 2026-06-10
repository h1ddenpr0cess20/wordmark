/**
 * Lazy loading utilities for optional modules to reduce initial page weight.
 */

import { initializeVectorStore } from "../services/vectorStore.ts";

export const lazyModulesLoaded: Record<string, boolean> = {};

let galleryModule: typeof import("../components/gallery.ts") | null = null;

/** Dynamically imports the gallery module once, caching the resolved module. */
export function loadGalleryModule() {
  if (galleryModule) {
    return Promise.resolve(galleryModule);
  }
  return import("../components/gallery.ts").then((mod) => {
    galleryModule = mod;
    lazyModulesLoaded.gallery = true;
    return mod;
  });
}

/**
 * Load vector store module and initialize related components
 */
export function loadVectorStoreModule() {
  if (lazyModulesLoaded.vectorStore) {
    return Promise.resolve();
  }
  // Initialize vector store from localStorage. The service itself is eagerly
  // bundled (core upload code depends on it); only the manager UI panels below
  // are code-split into separate chunks.
  initializeVectorStore();

  return import("../components/vectorStoreManager.ts").then(({ initVectorStoreManager }) => {
    return initVectorStoreManager().then(() => {
      return import("../components/filesManager.ts").then(({ initFilesManager }) => {
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
  }).catch(e => {
    console.error("Vector store module loading failed:", e);
    return Promise.reject(e);
  });
}
