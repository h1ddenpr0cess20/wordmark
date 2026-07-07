/**
 * Local embedding utilities for client-side document retrieval.
 *
 * @remarks
 * Ported from the dataset-generator source: text chunking, cosine similarity,
 * and a call to the active provider's OpenAI-compatible `/embeddings` endpoint.
 * Used to build an in-browser vector index over attached documents so local
 * providers (LM Studio / Ollama) retrieve only the relevant passages per turn
 * instead of receiving every file's full text. See {@link ./localDocRetrieval.ts}.
 */

import { getActiveServiceKey, getBaseUrl } from "./api/clientConfig.ts";
import { buildHeaders } from "./api/requestTransport.ts";
import { config } from "../../config/config.ts";

/** localStorage key for the user-set embedding model (blank = auto-detect). */
export const EMBEDDING_MODEL_STORAGE_KEY = "wordmark:embeddingModel";

/** Maximum inputs per `/embeddings` request. */
export const EMBEDDING_BATCH_SIZE = 64;

/**
 * Splits text into chunks of about `size` characters, preferring paragraph,
 * then line, sentence, and word boundaries so chunks stay coherent.
 *
 * @param t - The text to split.
 * @param size - Target chunk size in characters.
 */
export function chunkText(t: string, size = 2000): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < t.length) {
    if (start + size >= t.length) {
      const tail = t.slice(start).trim();
      if (tail) chunks.push(tail);
      break;
    }

    const window = t.slice(start, start + size);
    let breakAt = -1;

    const paraIdx = window.lastIndexOf("\n\n");
    if (paraIdx >= size * 0.4) breakAt = paraIdx + 2;

    if (breakAt < 0) {
      const nlIdx = window.lastIndexOf("\n");
      if (nlIdx >= size * 0.4) breakAt = nlIdx + 1;
    }

    if (breakAt < 0) {
      const sentMatches = [...window.matchAll(/[.!?]\s+/g)];
      if (sentMatches.length) {
        const last = sentMatches[sentMatches.length - 1];
        if ((last.index ?? -1) >= size * 0.4) breakAt = (last.index ?? 0) + last[0].length;
      }
    }

    if (breakAt < 0) {
      const spIdx = window.lastIndexOf(" ");
      if (spIdx >= size * 0.4) breakAt = spIdx + 1;
    }

    if (breakAt < 0) breakAt = size;

    const chunk = t.slice(start, start + breakAt).trim();
    if (chunk) chunks.push(chunk);
    start += breakAt;
  }

  return chunks;
}

/** Cosine similarity between two equal-length vectors. */
export function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** Reads the user-set embedding model from localStorage, or `null` if unset. */
function readStoredEmbeddingModel(): string | null {
  try {
    return localStorage.getItem(EMBEDDING_MODEL_STORAGE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

const EMBEDDING_NAME_RE =
  /embed|bge|nomic|gte|e5|minilm|mxbai|jina|snowflake|arctic|sentence|instructor|multilingual-e5|granite-embedding/i;

/** Preferred embedding models in priority order; nomic is the default. */
const PREFERRED_EMBEDDING_PATTERNS = [
  /nomic/i,
  /mxbai/i,
  /bge/i,
  /gte/i,
  /(^|[^a-z])e5([^a-z]|$)|multilingual-e5/i,
  /embeddinggemma|gemma-embed/i,
  /snowflake|arctic/i,
  /jina/i,
];

/** Picks the highest-priority known embedding model, else the first one given. */
function pickPreferred(models: string[]): string | null {
  if (models.length === 0) return null;
  for (const pattern of PREFERRED_EMBEDDING_PATTERNS) {
    const match = models.find((m) => pattern.test(m));
    if (match) return match;
  }
  return models[0];
}

/**
 * Resolves the embedding model for the active provider: the user-set value if
 * present, otherwise a preferred embedding model (nomic first, then known
 * alternatives, then any available) from the provider's embedding-model list.
 *
 * @returns The model id, or `null` if none can be determined.
 */
export function resolveEmbeddingModel(): string | null {
  const stored = readStoredEmbeddingModel();
  if (stored) return stored;

  const service = config?.services?.[getActiveServiceKey()];

  const embeddingModels = service?.embeddingModels;
  if (Array.isArray(embeddingModels) && embeddingModels.length > 0) {
    return pickPreferred(embeddingModels);
  }

  const models = service?.models;
  if (Array.isArray(models)) {
    return pickPreferred(models.filter((m) => EMBEDDING_NAME_RE.test(m)));
  }
  return null;
}

/**
 * Fetches embedding vectors for a batch of texts from the active provider's
 * OpenAI-compatible `/embeddings` endpoint. Inputs are sent in batches of
 * {@link EMBEDDING_BATCH_SIZE} so a large document doesn't produce one request
 * the local server rejects or times out on.
 *
 * @param texts - The input texts.
 * @param model - The embedding model id.
 * @param signal - Optional abort signal.
 * @returns One vector per input, in input order.
 * @throws If a request fails.
 */
export async function fetchEmbeddings(
  texts: string[],
  model: string,
  signal?: AbortSignal,
): Promise<number[][]> {
  const base = getBaseUrl();
  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
    const res = await fetch(`${base}/embeddings`, {
      method: "POST",
      headers: { ...buildHeaders(), Accept: "application/json" },
      body: JSON.stringify({ model, input: batch }),
      signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Embeddings request failed: HTTP ${res.status} — ${err.slice(0, 200)}`);
    }
    const data = await res.json();
    vectors.push(...(data.data as { index: number; embedding: number[] }[])
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding));
  }
  return vectors;
}
