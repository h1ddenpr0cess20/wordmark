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
import { getDocumentSourceName } from "../utils/documentPaths.ts";

type IndexedChunk = StoredDocChunk;

const index: IndexedChunk[] = [];
const lexicalTokenCache = new WeakMap<IndexedChunk, string[]>();

/** Retrieval defaults keep context close to the old ~16k character envelope. */
export const DEFAULT_RETRIEVAL_TOP_K = 12;
export const DEFAULT_RETRIEVAL_CHARACTER_BUDGET = 24_000;

const HYBRID_DENSE_WEIGHT = 0.72;
const HYBRID_LEXICAL_WEIGHT = 0.28;
const MMR_RELEVANCE_WEIGHT = 0.78;
const MAX_CHUNKS_PER_SOURCE = 3;
const BM25_K1 = 1.2;
const BM25_B = 0.75;

/**
 * Monotonic token for index restores. A restore captures it before awaiting
 * IndexedDB and bails out if it changed, so a slow load for a previously
 * opened conversation can't dump its chunks into the conversation that is now
 * active (which the next save would then persist under the wrong id).
 */
let restoreToken = 0;
let activeRestore: Promise<number> | null = null;

/** Number of indexed chunks currently held. */
export function localDocIndexSize(): number {
  return index.length;
}

/** Sorted source paths currently represented in the in-memory index. */
export function getIndexedDocumentNames(): string[] {
  return [...new Set(index.map(chunk => chunk.name))].sort((a, b) => a.localeCompare(b));
}

/** Counts both chunks and distinct source paths for user-facing diagnostics. */
export function getLocalDocIndexStats(): { chunks: number; documents: number } {
  return { chunks: index.length, documents: getIndexedDocumentNames().length };
}

/** Detects questions that need the source inventory in addition to retrieved text. */
export function isDocumentInventoryQuery(query: string): boolean {
  const normalized = query.toLowerCase().replace(/\s+/g, " ");
  return /\b(?:list|show|name|which|what|how many|all|every)\b.{0,48}\b(?:files?|documents?|sources?|folder|directory)\b/.test(normalized)
    || /\b(?:files?|documents?|sources?)\b.{0,32}\b(?:available|attached|indexed|uploaded|access)\b/.test(normalized);
}

/** Drops all indexed chunks (called when a conversation is reset or loaded). */
export function clearLocalDocIndex(): void {
  restoreToken++;
  activeRestore = null;
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
export function restoreLocalDocIndex(conversationId: string): Promise<number> {
  const token = ++restoreToken;
  const operation = (async() => {
    let chunks: StoredDocChunk[] = [];
    try {
      chunks = await loadDocChunks(conversationId);
    } catch (error) {
      console.error("Failed to restore document index:", error);
    }
    if (token !== restoreToken) {
      return index.length;
    }
    index.length = 0;
    index.push(...chunks);
    return index.length;
  })();
  activeRestore = operation;
  void operation.finally(() => {
    if (activeRestore === operation) activeRestore = null;
  });
  return operation;
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

  const originalIndex = [...index];
  const pending: { name: string; text: string; cacheKey: string | null; vectorKey: string }[] = [];
  const failed: string[] = [];
  let indexed = 0;
  let cachedFiles = 0;
  let cachedChunks = 0;

  try {
    for (const file of files) {
      const name = getDocumentSourceName(file);
      const hash = await hashFile(file);
      const cacheKey = hash ? `${hash}:${model}` : null;

      if (cacheKey) {
        const cached = await getCachedFileChunks(cacheKey).catch(() => null);
        if (cached) {
          // Re-attaching a path replaces its old chunks instead of duplicating it.
          for (let i = index.length - 1; i >= 0; i--) {
            if (index[i].name === name) index.splice(i, 1);
          }
          index.push(...cached.map((chunk) => ({ ...chunk, name, cacheKey })));
          indexed++;
          cachedFiles++;
          cachedChunks += cached.length;
          continue;
        }
      }

      try {
        const text = await extractDocumentText(file);
        if (!text.trim()) {
          failed.push(name);
          continue;
        }
        const chunks = chunkText(text);
        if (chunks.length === 0) {
          failed.push(name);
          continue;
        }
        for (const chunk of chunks) {
          const vectorKey = `${cacheKey || name}\u0000${chunk}`;
          pending.push({ name, text: chunk, cacheKey, vectorKey });
        }
        indexed++;
      } catch {
        failed.push(name);
      }
    }

    if (pending.length === 0) {
      return { indexed, chunks: cachedChunks, cached: cachedFiles, failed };
    }

    // Identical content at multiple paths shares one embedding request while
    // retaining a distinct source entry in the retrieval index.
    const uniqueInputs = new Map<string, string>();
    for (const item of pending) uniqueInputs.set(item.vectorKey, item.text);
    const inputEntries = [...uniqueInputs.entries()];
    const vectors = await fetchEmbeddings(inputEntries.map(([, text]) => text), model);
    const vectorByKey = new Map(inputEntries.map(([key], i) => [key, vectors[i]]));

    const byCacheKey = new Map<string, StoredDocChunk[]>();
    const replacedSources = new Set<string>();
    for (const item of pending) {
      if (!replacedSources.has(item.name)) {
        for (let i = index.length - 1; i >= 0; i--) {
          if (index[i].name === item.name) index.splice(i, 1);
        }
        replacedSources.add(item.name);
      }
      const chunk: StoredDocChunk = {
        name: item.name,
        text: item.text,
        vector: vectorByKey.get(item.vectorKey)!,
        model,
        cacheKey: item.cacheKey,
      };
      index.push(chunk);
      if (item.cacheKey) {
        const group = byCacheKey.get(item.cacheKey);
        // The cache stores one source-neutral copy; loadDocChunks applies the
        // conversation's source path when resolving each reference.
        if (!group) {
          byCacheKey.set(item.cacheKey, [chunk]);
        } else if (group[0].name === item.name) {
          group.push(chunk);
        }
      }
    }

    for (const [cacheKey, chunks] of byCacheKey) {
      try {
        await saveCachedFileChunks(cacheKey, chunks[0].name, chunks);
      } catch (error) {
        // Cache references without a committed cache record cannot be restored.
        // Inline these chunks in conversation storage instead.
        console.error("Failed to cache file chunks:", error);
        for (const chunk of index) {
          if (chunk.cacheKey === cacheKey) chunk.cacheKey = null;
        }
      }
    }

    return { indexed, chunks: cachedChunks + pending.length, cached: cachedFiles, failed };
  } catch (error) {
    index.length = 0;
    index.push(...originalIndex);
    throw error;
  }
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
        const group = byCacheKey.get(index[i].cacheKey!);
        if (!group) {
          byCacheKey.set(index[i].cacheKey!, [index[i]]);
        } else if (group[0].name === index[i].name) {
          group.push(index[i]);
        }
      }
    }
    for (const [cacheKey, chunks] of byCacheKey) {
      try {
        await saveCachedFileChunks(cacheKey, chunks[0].name, chunks);
      } catch (error) {
        console.error("Failed to cache re-embedded chunks:", error);
        for (const chunk of chunks) chunk.cacheKey = null;
      }
    }
    return [...index];
  } catch (error) {
    console.error("Failed to re-embed document index:", error);
    return [];
  }
}

/** Tokens suited to both prose and technical identifiers/paths. */
function lexicalTokens(text: string): string[] {
  const normalized = text.toLowerCase();
  const compounds = normalized.match(/[\p{L}\p{N}_]+(?:[./:@#-][\p{L}\p{N}_]+)*/gu) || [];
  const parts = compounds.flatMap(token => token.split(/[./:@#-]+/g));
  return [...compounds, ...parts.filter(part => part.length > 1)];
}

function chunkLexicalTokens(chunk: IndexedChunk): string[] {
  const cached = lexicalTokenCache.get(chunk);
  if (cached) return cached;
  const tokens = lexicalTokens(`source ${chunk.name}\n${chunk.text}`);
  lexicalTokenCache.set(chunk, tokens);
  return tokens;
}

/** Lightweight in-memory BM25 over chunk text plus its source path. */
function lexicalScores(chunks: IndexedChunk[], query: string): number[] {
  const queryTerms = [...new Set(lexicalTokens(query))];
  if (queryTerms.length === 0 || chunks.length === 0) return chunks.map(() => 0);

  const documents = chunks.map(chunkLexicalTokens);
  const avgLength = documents.reduce((sum, terms) => sum + terms.length, 0) / documents.length || 1;
  const documentFrequency = new Map<string, number>();
  for (const terms of documents) {
    const present = new Set(terms);
    for (const term of queryTerms) {
      if (present.has(term)) documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    }
  }

  const raw = documents.map((terms) => {
    const frequencies = new Map<string, number>();
    for (const term of terms) frequencies.set(term, (frequencies.get(term) || 0) + 1);
    let score = 0;
    for (const term of queryTerms) {
      const tf = frequencies.get(term) || 0;
      if (tf === 0) continue;
      const df = documentFrequency.get(term) || 0;
      const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
      const denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * terms.length / avgLength);
      score += idf * (tf * (BM25_K1 + 1)) / denominator;
    }
    return score;
  });
  const max = Math.max(...raw, 0);
  return max > 0 ? raw.map(score => score / max) : raw;
}

function normalizedCosine(a: number[], b: number[]): number {
  const score = cosineSim(a, b);
  return Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
}

interface RetrievalCandidate {
  chunk: IndexedChunk;
  relevance: number;
  dense: number;
  lexical: number;
}

/** Selects relevant but non-redundant chunks while preventing one file dominating. */
function diversifyCandidates(
  candidates: RetrievalCandidate[],
  topK: number,
  characterBudget: number,
  inventoryQuery: boolean,
): IndexedChunk[] {
  const selected: RetrievalCandidate[] = [];
  const sourceCounts = new Map<string, number>();
  let characters = 0;

  while (selected.length < topK) {
    let best: RetrievalCandidate | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      if (selected.includes(candidate)) continue;
      const sourceCount = sourceCounts.get(candidate.chunk.name) || 0;
      const perSourceLimit = inventoryQuery ? 1 : MAX_CHUNKS_PER_SOURCE;
      if (sourceCount >= perSourceLimit) continue;
      if (selected.length > 0 && characters + candidate.chunk.text.length > characterBudget) continue;

      const redundancy = selected.length === 0
        ? 0
        : Math.max(...selected.map(item => normalizedCosine(candidate.chunk.vector, item.chunk.vector)));
      const sourcePenalty = sourceCount * 0.12;
      const mmrScore = MMR_RELEVANCE_WEIGHT * candidate.relevance
        - (1 - MMR_RELEVANCE_WEIGHT) * redundancy
        - sourcePenalty;
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        best = candidate;
      }
    }
    if (!best) break;
    selected.push(best);
    sourceCounts.set(best.chunk.name, (sourceCounts.get(best.chunk.name) || 0) + 1);
    characters += best.chunk.text.length;
  }

  return selected.map(item => item.chunk);
}

/**
 * Returns chunks using hybrid semantic/lexical relevance plus diversity-aware
 * reranking, bounded by both result count and total characters.
 *
 * @param query - The user's message.
 * @param topK - Maximum chunks to return.
 * @param characterBudget - Maximum total chunk characters to return.
 * @returns The matching chunks (name + text), most relevant first.
 */
export async function retrieveRelevantChunks(
  query: string,
  topK = DEFAULT_RETRIEVAL_TOP_K,
  characterBudget = DEFAULT_RETRIEVAL_CHARACTER_BUDGET,
): Promise<{ name: string; text: string }[]> {
  if (activeRestore) await activeRestore;
  if (index.length === 0 || !query.trim()) return [];

  const model = resolveEmbeddingModel();
  if (!model) return [];

  let scorable = index.filter((chunk) => chunk.model === model);
  if (scorable.length < index.length) {
    const reembedded = await reembedIndex(model);
    if (reembedded.length > 0) {
      scorable = reembedded;
    }
    if (scorable.length === 0) return [];
  }

  const [queryVector] = await fetchEmbeddings([query], model);
  const sparse = lexicalScores(scorable, query);
  const loweredQuery = query.toLowerCase();
  const candidates = scorable.map((chunk, i): RetrievalCandidate => {
    const dense = normalizedCosine(queryVector, chunk.vector);
    let lexical = sparse[i];
    const source = chunk.name.toLowerCase();
    if (source.length > 2 && loweredQuery.includes(source)) lexical = 1;
    const basename = source.split("/").pop() || source;
    if (basename.length > 2 && loweredQuery.includes(basename)) lexical = 1;
    return {
      chunk,
      dense,
      lexical,
      relevance: HYBRID_DENSE_WEIGHT * dense + HYBRID_LEXICAL_WEIGHT * lexical,
    };
  }).sort((a, b) => b.relevance - a.relevance);

  const inventoryQuery = isDocumentInventoryQuery(query);
  const bestRelevance = candidates[0]?.relevance || 0;
  const minimumRelevance = inventoryQuery ? 0 : Math.max(0.05, bestRelevance * 0.35);
  const poolSize = Math.max(topK * 5, 40);
  const candidatePool = candidates
    .filter(candidate => candidate.relevance >= minimumRelevance || candidate.lexical > 0)
    .slice(0, poolSize);
  const selected = diversifyCandidates(candidatePool, Math.max(1, topK), Math.max(1, characterBudget), inventoryQuery);
  return selected.map(chunk => ({ name: chunk.name, text: chunk.text }));
}
