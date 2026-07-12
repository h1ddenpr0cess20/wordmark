/**
 * Local document chunk storage backed by IndexedDB.
 *
 * @remarks
 * Persists the extracted text chunks (and their embedding vectors) that back
 * local-provider document retrieval, keyed by conversation id. Storing the text
 * lets the index be rebuilt after a reload, and re-embedded when the embedding
 * model changes, without re-uploading the original files.
 */

import { createScopedLogger } from "../logger.ts";
import { openDatabase } from "./idb.ts";

const logChunkStore = createScopedLogger("doc-chunk-storage");

const CHUNK_DB_NAME = "wordmark-doc-chunks";
const CHUNK_DB_VERSION = 2;
const CHUNK_STORE_NAME = "chunks";
const FILE_CACHE_STORE_NAME = "fileCache";
const FILE_CACHE_LIMIT = 50;

/** One persisted retrieval chunk: source file name, text, and its embedding. */
export interface StoredDocChunk {
  name: string;
  text: string;
  vector: number[];
  model: string;
  cacheKey?: string | null;
}

/** One file in a conversation's record: a cache reference, or inlined chunks. */
export interface StoredFileRef {
  cacheKey: string | null;
  name: string;
  chunks: StoredDocChunk[] | null;
}

/** A conversation's indexed files. */
export interface DocChunkRecord {
  conversationId: string;
  updated: string;
  files: StoredFileRef[];
  chunks?: StoredDocChunk[];
}

/** Cached chunks for one file, keyed by content hash + embedding model. */
export interface CachedFileRecord {
  key: string;
  name: string;
  updated: string;
  chunks: StoredDocChunk[];
}

let chunkDb: IDBDatabase | null = null;

/** Opens (and upgrades, if needed) the IndexedDB database used for document chunks. */
export function initDocChunkDb() {
  return openDatabase({
    name: CHUNK_DB_NAME,
    version: CHUNK_DB_VERSION,
    errorLabel: "Doc chunk IndexedDB error:",
    onUpgrade: (db) => {
      if (!db.objectStoreNames.contains(CHUNK_STORE_NAME)) {
        db.createObjectStore(CHUNK_STORE_NAME, { keyPath: "conversationId" });
        logChunkStore("Created doc chunk store in IndexedDB");
      }
      if (!db.objectStoreNames.contains(FILE_CACHE_STORE_NAME)) {
        db.createObjectStore(FILE_CACHE_STORE_NAME, { keyPath: "key" });
        logChunkStore("Created file cache store in IndexedDB");
      }
    },
  }).then((db) => {
    chunkDb = db;
  });
}

function withChunkDb<T>(run: (db: IDBDatabase) => Promise<T>): Promise<T> {
  if (chunkDb) return run(chunkDb);
  return initDocChunkDb().then(() => run(chunkDb!));
}

/**
 * Groups flat chunks into a conversation record. Chunks whose file content was
 * hashed become cache references; the rest are inlined.
 *
 * @param conversationId - The conversation the chunks belong to.
 * @param chunks - The chunks to group.
 */
export function buildDocChunkRecord(conversationId: string, chunks: StoredDocChunk[]): DocChunkRecord {
  const files: StoredFileRef[] = [];
  const refByKeyAndSource = new Map<string, StoredFileRef>();

  for (const chunk of chunks) {
    if (chunk.cacheKey) {
      // The same bytes may legitimately appear at multiple paths. Each source
      // needs its own reference even though both resolve the same cached chunks.
      const refKey = `${chunk.cacheKey}\u0000${chunk.name}`;
      if (!refByKeyAndSource.has(refKey)) {
        const ref: StoredFileRef = { cacheKey: chunk.cacheKey, name: chunk.name, chunks: null };
        refByKeyAndSource.set(refKey, ref);
        files.push(ref);
      }
      continue;
    }
    const last = files[files.length - 1];
    if (last && !last.cacheKey && last.name === chunk.name) {
      last.chunks!.push(chunk);
    } else {
      files.push({ cacheKey: null, name: chunk.name, chunks: [chunk] });
    }
  }

  return { conversationId, updated: new Date().toISOString(), files };
}

/**
 * Persists the chunks for a conversation, replacing any existing record.
 * An empty chunk list deletes the record instead.
 *
 * @param conversationId - The conversation the chunks belong to.
 * @param chunks - The chunks to store.
 */
export function saveDocChunks(conversationId: string, chunks: StoredDocChunk[]): Promise<void> {
  if (chunks.length === 0) return deleteDocChunks(conversationId);
  const record = buildDocChunkRecord(conversationId, chunks);
  return withChunkDb((db) => new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([CHUNK_STORE_NAME], "readwrite");
    transaction.objectStore(CHUNK_STORE_NAME).put(record);
    transaction.onabort = () => reject(transaction.error || new Error("Doc chunk save aborted"));
    transaction.oncomplete = () => {
      logChunkStore(`Saved ${record.files.length} file entries for conversation:`, conversationId);
      resolve();
    };
  }));
}

function getDocChunkRecord(conversationId: string): Promise<DocChunkRecord | undefined> {
  return withChunkDb((db) => new Promise<DocChunkRecord | undefined>((resolve, reject) => {
    const request = db.transaction([CHUNK_STORE_NAME], "readonly")
      .objectStore(CHUNK_STORE_NAME)
      .get(conversationId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as DocChunkRecord | undefined);
  }));
}

/**
 * Loads the stored chunks for a conversation, resolving cache references back
 * into chunks. Referenced files evicted from the cache are dropped.
 *
 * @param conversationId - The conversation id to look up.
 * @returns The stored chunks, or an empty array when none exist.
 */
export async function loadDocChunks(conversationId: string): Promise<StoredDocChunk[]> {
  const record = await getDocChunkRecord(conversationId);
  if (!record) return [];
  if (!Array.isArray(record.files)) {
    return Array.isArray(record.chunks) ? record.chunks : [];
  }

  const chunks: StoredDocChunk[] = [];
  for (const file of record.files) {
    if (!file.cacheKey) {
      chunks.push(...(file.chunks || []));
      continue;
    }
    const cached = await getCachedFileChunks(file.cacheKey).catch(() => null);
    if (cached) {
      chunks.push(...cached.map((chunk) => ({ ...chunk, name: file.name, cacheKey: file.cacheKey })));
    } else {
      console.warn(`Document cache entry is missing for stored source: ${file.name}`);
    }
  }
  return chunks;
}

/** Deletes the stored chunks for a conversation. */
export function deleteDocChunks(conversationId: string): Promise<void> {
  return withChunkDb((db) => new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([CHUNK_STORE_NAME], "readwrite");
    transaction.objectStore(CHUNK_STORE_NAME).delete(conversationId);
    transaction.onabort = () => reject(transaction.error || new Error("Doc chunk delete aborted"));
    transaction.oncomplete = () => resolve();
  }));
}

/** Returns every stored chunk record (used for export and storage accounting). */
export function getAllDocChunkRecords(): Promise<DocChunkRecord[]> {
  return withChunkDb((db) => new Promise<DocChunkRecord[]>((resolve, reject) => {
    const request = db.transaction([CHUNK_STORE_NAME], "readonly")
      .objectStore(CHUNK_STORE_NAME)
      .getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  }));
}

/** Deletes every stored chunk record and cached file entry. */
export function clearAllDocChunks(): Promise<void> {
  return withChunkDb((db) => new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([CHUNK_STORE_NAME, FILE_CACHE_STORE_NAME], "readwrite");
    transaction.objectStore(CHUNK_STORE_NAME).clear();
    transaction.objectStore(FILE_CACHE_STORE_NAME).clear();
    transaction.onabort = () => reject(transaction.error || new Error("Doc chunk clear aborted"));
    transaction.oncomplete = () => resolve();
  }));
}

/**
 * Looks up cached chunks for a file by its cache key.
 *
 * @param key - `<content-hash>:<embedding-model>` cache key.
 * @returns The cached chunks, or `null` on a cache miss.
 */
export function getCachedFileChunks(key: string): Promise<StoredDocChunk[] | null> {
  return withChunkDb((db) => new Promise<StoredDocChunk[] | null>((resolve, reject) => {
    const request = db.transaction([FILE_CACHE_STORE_NAME], "readonly")
      .objectStore(FILE_CACHE_STORE_NAME)
      .get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const record = request.result as CachedFileRecord | undefined;
      resolve(Array.isArray(record?.chunks) && record.chunks.length > 0 ? record.chunks : null);
    };
  }));
}

/**
 * Caches a file's chunks under its cache key, evicting the oldest entries once
 * the cache exceeds {@link FILE_CACHE_LIMIT} files.
 *
 * @param key - `<content-hash>:<embedding-model>` cache key.
 * @param name - The file name, kept for display and debugging.
 * @param chunks - The chunks (text + vectors) to cache.
 */
export function saveCachedFileChunks(key: string, name: string, chunks: StoredDocChunk[]): Promise<void> {
  return withChunkDb((db) => new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([CHUNK_STORE_NAME, FILE_CACHE_STORE_NAME], "readwrite");
    const store = transaction.objectStore(FILE_CACHE_STORE_NAME);
    const record: CachedFileRecord = { key, name, updated: new Date().toISOString(), chunks };
    store.put(record);

    const refsRequest = transaction.objectStore(CHUNK_STORE_NAME).getAll();
    refsRequest.onsuccess = () => {
      const referenced = new Set<string>();
      for (const convo of refsRequest.result as DocChunkRecord[]) {
        for (const file of convo.files || []) {
          if (file.cacheKey) referenced.add(file.cacheKey);
        }
      }

      const allRequest = store.getAll();
      allRequest.onsuccess = () => {
        const evictable = (allRequest.result as CachedFileRecord[])
          .filter((r) => r.key !== key && !referenced.has(r.key))
          .sort((a, b) => a.updated.localeCompare(b.updated));
        const excess = allRequest.result.length - FILE_CACHE_LIMIT;
        for (const stale of evictable.slice(0, Math.max(0, excess))) {
          store.delete(stale.key);
        }
      };
    };

    transaction.onabort = () => reject(transaction.error || new Error("File cache save aborted"));
    transaction.oncomplete = () => {
      logChunkStore(`Cached ${chunks.length} chunks for file:`, name);
      resolve();
    };
  }));
}

/** Counts the cached file entries. */
export function countCachedFiles(): Promise<number> {
  return withChunkDb((db) => new Promise<number>((resolve, reject) => {
    const request = db.transaction([FILE_CACHE_STORE_NAME], "readonly")
      .objectStore(FILE_CACHE_STORE_NAME)
      .count();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  }));
}
