/**
 * Shared IndexedDB helpers.
 *
 * Centralizes the database-open handshake (browser-support check + open +
 * upgrade/success/error wiring) that each storage module previously hand-rolled.
 * Per-operation reads/writes stay in their own modules, where the success/error
 * logging and result handling are meaningfully different.
 */

export interface OpenDatabaseOptions {
  /** Database name passed to `indexedDB.open`. */
  name: string;
  /** Schema version passed to `indexedDB.open`. */
  version: number;
  /** Invoked on `onupgradeneeded` to create/upgrade object stores. */
  onUpgrade: (db: IDBDatabase) => void;
  /** Prefix for the `console.error` logged if opening fails. */
  errorLabel?: string;
}

/**
 * Open (and upgrade, if needed) an IndexedDB database.
 *
 * Rejects with an `Error` when IndexedDB is unavailable, or with the request's
 * error when the open fails. Resolves with the open database handle.
 */
export function openDatabase({
  name,
  version,
  onUpgrade,
  errorLabel = "IndexedDB error:",
}: OpenDatabaseOptions): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === "undefined" || window.indexedDB === undefined) {
      console.error("IndexedDB is not supported in this browser");
      reject(new Error("IndexedDB not supported"));
      return;
    }

    const request = window.indexedDB.open(name, version);

    request.onerror = () => {
      console.error(errorLabel, request.error);
      reject(request.error);
    };

    request.onupgradeneeded = () => {
      onUpgrade(request.result);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}
