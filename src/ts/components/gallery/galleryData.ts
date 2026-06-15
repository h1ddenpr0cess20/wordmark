/**
 * Gallery data access.
 *
 * @remarks
 * Reads stored media out of IndexedDB for the gallery, resolving each record's
 * display URL and media type. Separated from the gallery UI in
 * {@link ./gallery.ts} so the storage read is independent of rendering.
 */

import { initImageDb, getImageDb, IMAGE_STORE_NAME } from "../../utils/storage/imageStorage.ts";
import { detectMediaType, getMediaDisplayUrl } from "../../services/mediaTools.ts";
import type { GeneratedImage } from "../../../types/common.ts";

/**
 * Reads every stored media item from IndexedDB, resolving each record's display
 * URL and media type. Initializes the image DB first if it is not yet open.
 */
export const getAllImagesFromDb = function(): Promise<GeneratedImage[]> {
  return new Promise((resolve, reject) => {
    if (!getImageDb()) {
      initImageDb()
        .then(() => getAllImagesFromDb())
        .then(resolve)
        .catch(reject);
      return;
    }
    const images: GeneratedImage[] = [];
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
