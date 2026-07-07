/**
 * In-browser semantic retrieval over attached documents for local providers.
 *
 * @remarks
 * Local servers (LM Studio / Ollama) have no files API or vector store, so
 * attached documents are indexed client-side: each file is extracted to text,
 * split into chunks, and embedded via the provider's `/embeddings` endpoint.
 * At send time the user's question is embedded and the most similar chunks are
 * returned, so only the relevant passages reach the model rather than every
 * file's full text. The index is per-conversation: it is persisted to IndexedDB
 * (text + vectors) so a reloaded conversation keeps its documents, and chunks
 * are re-embedded from the stored text when the embedding model changes.
 * Embeddings are also cached by file content hash, so attaching the same file
 * again (in any conversation) reuses them instead of re-extracting/re-embedding.
 */

import { extractDocumentText } from "./parsers/index.ts";
import { chunkText, cosineSim, fetchEmbeddings, resolveEmbeddingModel } from "./embeddings.ts";
import {
  saveDocChunks,
  loadDocChunks,
  getCachedFileChunks,
  saveCachedFileChunks,
  type StoredDocChunk,
} from "../utils/storage/docChunkStorage.ts";

type IndexedChunk = StoredDocChunk;

const index: IndexedChunk[] = [];

/** Number of indexed chunks currently held. */
export function localDocIndexSize(): number {
  return index.length;
}

/** Drops all indexed chunks (called when a conversation is reset or loaded). */
export function clearLocalDocIndex(): void {
  index.length = 0;
}

/**
 * Persists the in-memory index for a conversation so its documents survive
 * reloads. A no-op when the index is empty, so a save that races the restore
 * never wipes previously stored chunks.
 *
 * @param conversationId - The conversation the index belongs to.
 */
export async function persistLocalDocIndex(conversationId: string): Promise<void> {
  if (index.length === 0) return;
  try {
    await saveDocChunks(conversationId, index);
  } catch (error) {
    console.error("Failed to persist document index:", error);
  }
}

/**
 * Replaces the in-memory index with the chunks stored for a conversation.
 *
 * @param conversationId - The conversation whose chunks to restore.
 * @returns The number of restored chunks.
 */
export async function restoreLocalDocIndex(conversationId: string): Promise<number> {
  let chunks: StoredDocChunk[] = [];
  try {
    chunks = await loadDocChunks(conversationId);
  } catch (error) {
    console.error("Failed to restore document index:", error);
  }
  index.length = 0;
  index.push(...chunks);
  return index.length;
}

/**
 * SHA-256 of a file's bytes as hex, or `null` when hashing is unavailable
 * (insecure context or a File that cannot be re-read).
 */
async function hashFile(file: File): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/**
 * Extracts, chunks, and embeds the given files, adding them to the index.
 * Files whose content was embedded before (same bytes, same model) are served
 * from the cache without re-extracting or re-embedding.
 *
 * @param files - The document files to index.
 * @returns A summary of what was indexed and which files could not be read.
 * @throws If no embedding model can be resolved.
 */
export async function indexDocuments(
  files: File[],
): Promise<{ indexed: number; chunks: number; cached: number; failed: string[] }> {
  const model = resolveEmbeddingModel();
  if (!model) {
    throw new Error(
      "No embedding model found. Load an embedding model in your local server (LM Studio / Ollama) and reconnect.",
    );
  }

  const pending: { name: string; text: string; cacheKey: string | null }[] = [];
  const failed: string[] = [];
  let indexed = 0;
  let cachedFiles = 0;
  let cachedChunks = 0;

  for (const file of files) {
    const hash = await hashFile(file);
    const cacheKey = hash ? `${hash}:${model}` : null;

    if (cacheKey) {
      const cached = await getCachedFileChunks(cacheKey).catch(() => null);
      if (cached) {
        index.push(...cached.map((chunk) => ({ ...chunk, name: file.name, cacheKey })));
        indexed++;
        cachedFiles++;
        cachedChunks += cached.length;
        continue;
      }
    }

    try {
      const text = await extractDocumentText(file);
      if (!text.trim()) {
        failed.push(file.name);
        continue;
      }
      for (const chunk of chunkText(text)) {
        pending.push({ name: file.name, text: chunk, cacheKey });
      }
    } catch {
      failed.push(file.name);
    }
  }

  if (pending.length === 0) {
    return { indexed, chunks: cachedChunks, cached: cachedFiles, failed };
  }

  const vectors = await fetchEmbeddings(pending.map((p) => p.text), model);
  const byCacheKey = new Map<string, StoredDocChunk[]>();
  for (let i = 0; i < pending.length; i++) {
    const chunk: StoredDocChunk = {
      name: pending[i].name,
      text: pending[i].text,
      vector: vectors[i],
      model,
      cacheKey: pending[i].cacheKey,
    };
    index.push(chunk);
    if (pending[i].cacheKey) {
      const group = byCacheKey.get(pending[i].cacheKey!) || [];
      group.push(chunk);
      byCacheKey.set(pending[i].cacheKey!, group);
    }
  }

  for (const [cacheKey, chunks] of byCacheKey) {
    saveCachedFileChunks(cacheKey, chunks[0].name, chunks).catch((error) => {
      console.error("Failed to cache file chunks:", error);
    });
  }

  indexed += new Set(pending.map((p) => p.name)).size;
  return { indexed, chunks: cachedChunks + pending.length, cached: cachedFiles, failed };
}

/**
 * Re-embeds every indexed chunk's stored text with `model`, updating the index
 * in place. Called when the embedding model no longer matches any stored
 * vectors (e.g. after a provider or model switch).
 *
 * @param model - The embedding model to re-embed with.
 * @returns The re-embedded chunks, or the empty array if embedding failed.
 */
async function reembedIndex(model: string): Promise<IndexedChunk[]> {
  try {
    const vectors = await fetchEmbeddings(index.map((chunk) => chunk.text), model);
    const byCacheKey = new Map<string, IndexedChunk[]>();
    for (let i = 0; i < index.length; i++) {
      index[i].vector = vectors[i];
      index[i].model = model;
      const oldKey = index[i].cacheKey;
      if (oldKey) {
        const hash = oldKey.slice(0, oldKey.indexOf(":"));
        index[i].cacheKey = `${hash}:${model}`;
        const group = byCacheKey.get(index[i].cacheKey!) || [];
        group.push(index[i]);
        byCacheKey.set(index[i].cacheKey!, group);
      }
    }
    for (const [cacheKey, chunks] of byCacheKey) {
      saveCachedFileChunks(cacheKey, chunks[0].name, chunks).catch((error) => {
        console.error("Failed to cache re-embedded chunks:", error);
      });
    }
    return [...index];
  } catch (error) {
    console.error("Failed to re-embed document index:", error);
    return [];
  }
}

/**
 * Returns the chunks most relevant to a query, ranked by cosine similarity.
 *
 * @param query - The user's message.
 * @param topK - Maximum chunks to return.
 * @returns The matching chunks (name + text), most relevant first.
 */
export async function retrieveRelevantChunks(
  query: string,
  topK = 8,
): Promise<{ name: string; text: string }[]> {
  if (index.length === 0 || !query.trim()) return [];

  const model = resolveEmbeddingModel();
  if (!model) return [];

  let scorable = index.filter((chunk) => chunk.model === model);
  if (scorable.length === 0) {
    scorable = await reembedIndex(model);
    if (scorable.length === 0) return [];
  }

  const [queryVector] = await fetchEmbeddings([query], model);

  return scorable
    .map((chunk) => ({ chunk, score: cosineSim(queryVector, chunk.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ chunk }) => ({ name: chunk.name, text: chunk.text }));
}
